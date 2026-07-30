begin;

alter table public.leads
  add column if not exists customer_address text;

create index if not exists leads_customer_phone_idx
  on public.leads (customer_phone);

comment on column public.leads.customer_address is
  'Optional delivery address collected transparently by the sales chatbot.';

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

revoke all on function public.create_lead_from_chat(
  uuid,
  text,
  text,
  text,
  text,
  bigint[]
) from public;

grant execute on function public.create_lead_from_chat(
  uuid,
  text,
  text,
  text,
  text,
  bigint[]
) to anon, authenticated;

commit;
