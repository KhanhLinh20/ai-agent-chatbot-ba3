begin;

create table if not exists public.consultation_session_states (
  session_id uuid primary key,
  state jsonb not null default '{
    "version": 1,
    "profile": {},
    "stage": "DISCOVERING",
    "activeProductIds": [],
    "selectedProductId": null,
    "lastIntent": null,
    "lastSalesIntent": null
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consultation_session_state_is_object
    check (jsonb_typeof(state) = 'object'),
  constraint consultation_session_state_version
    check (coalesce((state ->> 'version')::integer, 0) = 1)
);

create index if not exists consultation_session_states_updated_at_idx
  on public.consultation_session_states (updated_at desc);

alter table public.consultation_session_states enable row level security;

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
  if jsonb_typeof(p_state) <> 'object'
    or coalesce((p_state ->> 'version')::integer, 0) <> 1 then
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

revoke all on table public.consultation_session_states from anon, authenticated;
revoke all on function public.get_consultation_session_state(uuid)
from public;
revoke all on function public.upsert_consultation_session_state(uuid, jsonb)
from public;

grant execute on function public.get_consultation_session_state(uuid)
to anon, authenticated;
grant execute on function public.upsert_consultation_session_state(uuid, jsonb)
to anon, authenticated;

commit;
