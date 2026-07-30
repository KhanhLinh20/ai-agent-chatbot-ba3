begin;

drop function if exists public.create_order_from_chat(
  uuid, text, text, text, bigint[]
);

create or replace function public.create_order_from_chat(
  p_session_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_product_ids bigint[],
  p_quantity integer default 1
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
    or cardinality(p_product_ids) <> 1
    or p_quantity not between 1 and 999 then
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
        'quantity', p_quantity
      )
    ),
    coalesce(sum(p.price * p_quantity), 0),
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

revoke all on function public.create_order_from_chat(
  uuid, text, text, text, bigint[], integer
) from public;
grant execute on function public.create_order_from_chat(
  uuid, text, text, text, bigint[], integer
) to anon, authenticated, service_role;

comment on function public.create_order_from_chat(
  uuid, text, text, text, bigint[], integer
) is
  'Creates or updates one checkout order per conversation with the customer-confirmed quantity.';

commit;
