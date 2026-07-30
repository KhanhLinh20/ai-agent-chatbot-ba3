begin;

create table if not exists public.conversations (
  id bigint generated always as identity primary key,
  session_id uuid not null unique,
  customer_name text,
  customer_phone text,
  status text not null default 'active'
    check (status in ('active', 'qualified', 'closed')),
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  conversation_id bigint not null
    references public.conversations(id) on delete cascade,
  role text not null
    check (role in ('system', 'user', 'assistant', 'tool')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id bigint generated always as identity primary key,
  conversation_id bigint
    references public.conversations(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  customer_address text,
  interested_product_ids bigint[] not null default '{}',
  customer_need text not null,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consultation_session_states (
  session_id uuid primary key,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consultation_session_state_is_object
    check (jsonb_typeof(state) = 'object')
);

create table if not exists public.customer_journey_events (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  event_type text not null check (
    event_type in (
      'search',
      'product_impression',
      'product_click',
      'compare',
      'add_to_cart',
      'lead_submit',
      'order_complete',
      'livestream_interaction'
    )
  ),
  product_id text,
  product_name text,
  category text,
  search_query text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index if not exists leads_status_created_idx
  on public.leads (status, created_at desc);
create index if not exists leads_customer_phone_idx
  on public.leads (customer_phone);
create index if not exists consultation_session_states_updated_at_idx
  on public.consultation_session_states (updated_at desc);
create index if not exists customer_journey_session_time_idx
  on public.customer_journey_events (session_id, occurred_at desc);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.leads enable row level security;
alter table public.consultation_session_states enable row level security;
alter table public.customer_journey_events enable row level security;

drop policy if exists "Admins read conversations" on public.conversations;
create policy "Admins read conversations"
on public.conversations for select
to authenticated
using (
  coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  )
);

drop policy if exists "Admins read messages" on public.messages;
create policy "Admins read messages"
on public.messages for select
to authenticated
using (
  coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  )
);

drop policy if exists "Admins manage leads" on public.leads;
create policy "Admins manage leads"
on public.leads for all
to authenticated
using (
  coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  )
)
with check (
  coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  )
);

drop policy if exists "API can append journey events"
  on public.customer_journey_events;
create policy "API can append journey events"
on public.customer_journey_events for insert
to anon, authenticated
with check (true);

drop policy if exists "Admins read journey events"
  on public.customer_journey_events;
create policy "Admins read journey events"
on public.customer_journey_events for select
to authenticated
using (
  coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  )
);

create or replace function public.append_conversation_turn(
  p_session_id uuid,
  p_user_content text,
  p_assistant_content text,
  p_assistant_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id bigint;
begin
  insert into public.conversations (session_id, updated_at)
  values (p_session_id, now())
  on conflict (session_id) do update
    set updated_at = excluded.updated_at
  returning id into v_conversation_id;

  insert into public.messages (conversation_id, role, content, metadata)
  values
    (v_conversation_id, 'user', p_user_content, '{}'::jsonb),
    (
      v_conversation_id,
      'assistant',
      p_assistant_content,
      coalesce(p_assistant_metadata, '{}'::jsonb)
    );

  return v_conversation_id;
end;
$$;

create or replace function public.get_conversation_history(
  p_session_id uuid,
  p_limit integer default 12
)
returns table (
  role text,
  content text,
  metadata jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select recent.role, recent.content, recent.metadata, recent.created_at
  from (
    select m.role, m.content, m.metadata, m.created_at
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where c.session_id = p_session_id
      and m.role in ('user', 'assistant')
    order by m.created_at desc
    limit least(greatest(p_limit, 1), 20)
  ) recent
  order by recent.created_at asc;
$$;

create or replace function public.get_consultation_session_state(
  p_session_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select s.state
  from public.consultation_session_states s
  where s.session_id = p_session_id;
$$;

create or replace function public.upsert_consultation_session_state(
  p_session_id uuid,
  p_state jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_state) <> 'object' then
    raise exception 'Invalid consultation session state';
  end if;

  insert into public.consultation_session_states (
    session_id,
    state,
    updated_at
  )
  values (p_session_id, p_state, now())
  on conflict (session_id) do update
    set state = excluded.state,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function public.create_lead_from_chat(
  p_session_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_customer_need text,
  p_interested_product_ids bigint[] default '{}'::bigint[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id bigint;
  v_lead_id bigint;
begin
  if char_length(trim(p_customer_name)) not between 2 and 120
    or char_length(trim(p_customer_phone)) not between 9 and 20
    or char_length(trim(p_customer_need)) not between 5 and 1000 then
    raise exception 'Invalid customer capture data';
  end if;

  insert into public.conversations (
    session_id,
    customer_name,
    customer_phone,
    status,
    updated_at
  )
  values (
    p_session_id,
    trim(p_customer_name),
    trim(p_customer_phone),
    'qualified',
    now()
  )
  on conflict (session_id) do update
    set customer_name = excluded.customer_name,
        customer_phone = excluded.customer_phone,
        status = 'qualified',
        updated_at = excluded.updated_at
  returning id into v_conversation_id;

  select l.id
  into v_lead_id
  from public.leads l
  where l.conversation_id = v_conversation_id
    and l.customer_phone = trim(p_customer_phone)
  order by l.created_at desc
  limit 1;

  if v_lead_id is null then
    insert into public.leads (
      conversation_id,
      customer_name,
      customer_phone,
      customer_address,
      customer_need,
      interested_product_ids
    )
    values (
      v_conversation_id,
      trim(p_customer_name),
      trim(p_customer_phone),
      nullif(trim(p_customer_address), ''),
      trim(p_customer_need),
      coalesce(p_interested_product_ids, '{}'::bigint[])
    )
    returning id into v_lead_id;
  else
    update public.leads
    set customer_name = trim(p_customer_name),
        customer_address = nullif(trim(p_customer_address), ''),
        customer_need = trim(p_customer_need),
        interested_product_ids = coalesce(
          p_interested_product_ids,
          '{}'::bigint[]
        ),
        status = case when status = 'closed' then status else 'qualified' end,
        updated_at = now()
    where id = v_lead_id;
  end if;

  return v_lead_id;
end;
$$;

revoke all on table public.conversations
  from anon, authenticated;
revoke all on table public.messages
  from anon, authenticated;
revoke all on table public.leads
  from anon, authenticated;
revoke all on table public.consultation_session_states
  from anon, authenticated;

grant select on table public.conversations, public.messages
  to authenticated;
grant select, insert, update, delete on table public.leads
  to authenticated;
grant insert on table public.customer_journey_events
  to anon, authenticated;
grant select on table public.customer_journey_events
  to authenticated;

grant execute on function public.append_conversation_turn(
  uuid, text, text, jsonb
) to anon, authenticated;
grant execute on function public.get_conversation_history(uuid, integer)
  to anon, authenticated;
grant execute on function public.get_consultation_session_state(uuid)
  to anon, authenticated;
grant execute on function public.upsert_consultation_session_state(uuid, jsonb)
  to anon, authenticated;
grant execute on function public.create_lead_from_chat(
  uuid, text, text, text, text, bigint[]
) to anon, authenticated;

commit;
