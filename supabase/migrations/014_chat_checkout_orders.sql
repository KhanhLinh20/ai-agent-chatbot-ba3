begin;

create table if not exists public.orders (
  order_id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone varchar(20) not null,
  customer_address text not null,
  items jsonb not null,
  total_amount numeric not null,
  status varchar(50) not null default 'Pending',
  created_at timestamp not null default now()
);

alter table public.orders
  add column if not exists conversation_id bigint,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_conversation_id_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_conversation_id_fkey
      foreign key (conversation_id)
      references public.conversations(id)
      on delete set null;
  end if;
end;
$$;

create unique index if not exists orders_conversation_id_unique_idx
  on public.orders (conversation_id)
  where conversation_id is not null;
create index if not exists orders_status_created_idx
  on public.orders (status, created_at desc);
create index if not exists orders_customer_phone_idx
  on public.orders (customer_phone);

alter table public.orders enable row level security;

drop policy if exists "Admins read orders" on public.orders;
create policy "Admins read orders"
on public.orders for select
to authenticated
using (
  coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  )
);

create or replace function public.create_order_from_chat(
  p_session_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_product_ids bigint[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id bigint;
  v_items jsonb;
  v_total numeric;
  v_order_id uuid;
  v_product_count integer;
begin
  if char_length(trim(p_customer_name)) not between 2 and 120
    or char_length(trim(p_customer_phone)) not between 9 and 20
    or char_length(trim(p_customer_address)) not between 5 and 300
    or cardinality(p_product_ids) <> 1 then
    raise exception 'Invalid checkout data';
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

  select
    jsonb_agg(
      jsonb_build_object(
        'id', p.item_id,
        'name', p.product_name,
        'price', p.price,
        'quantity', 1
      )
    ),
    coalesce(sum(p.price), 0),
    count(*)::integer
  into v_items, v_total, v_product_count
  from public.products p
  where p.item_id = p_product_ids[1]::text
    and not coalesce(p.is_sold_out, false);

  if v_product_count <> 1 or v_total <= 0 then
    raise exception 'Selected product is unavailable';
  end if;

  insert into public.orders (
    conversation_id,
    customer_name,
    customer_phone,
    customer_address,
    items,
    total_amount,
    status,
    updated_at
  )
  values (
    v_conversation_id,
    trim(p_customer_name),
    trim(p_customer_phone),
    trim(p_customer_address),
    v_items,
    v_total,
    'Pending',
    now()
  )
  on conflict (conversation_id)
    where conversation_id is not null
  do update
    set customer_name = excluded.customer_name,
        customer_phone = excluded.customer_phone,
        customer_address = excluded.customer_address,
        items = excluded.items,
        total_amount = excluded.total_amount,
        updated_at = excluded.updated_at
  returning order_id into v_order_id;

  return v_order_id;
end;
$$;

-- Recover checkout sessions completed before order persistence was connected.
insert into public.orders (
  conversation_id,
  customer_name,
  customer_phone,
  customer_address,
  items,
  total_amount,
  status,
  created_at,
  updated_at
)
select
  c.id,
  s.state #>> '{customerCapture,name}',
  s.state #>> '{customerCapture,phone}',
  s.state #>> '{customerCapture,address}',
  jsonb_build_array(
    jsonb_build_object(
      'id', p.item_id,
      'name', p.product_name,
      'price', p.price,
      'quantity', 1
    )
  ),
  p.price,
  'Pending',
  c.updated_at::timestamp,
  c.updated_at
from public.conversations c
join public.consultation_session_states s
  on s.session_id = c.session_id
join public.products p
  on p.item_id = s.state ->> 'selectedProductId'
where s.state #>> '{customerCapture,status}' = 'saved'
  and nullif(trim(s.state #>> '{customerCapture,name}'), '') is not null
  and nullif(trim(s.state #>> '{customerCapture,phone}'), '') is not null
  and nullif(trim(s.state #>> '{customerCapture,address}'), '') is not null
  and not coalesce(p.is_sold_out, false)
on conflict (conversation_id)
  where conversation_id is not null
do nothing;

revoke all on table public.orders from anon, authenticated;
grant select on table public.orders to authenticated;

revoke all on function public.create_order_from_chat(
  uuid, text, text, text, bigint[]
) from public;
grant execute on function public.create_order_from_chat(
  uuid, text, text, text, bigint[]
) to anon, authenticated, service_role;

comment on function public.create_order_from_chat(
  uuid, text, text, text, bigint[]
) is
  'Creates or updates one checkout order per conversation after the customer confirms one product.';

commit;
