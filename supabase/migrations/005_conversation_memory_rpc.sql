begin;

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

revoke all on function public.append_conversation_turn(
  uuid, text, text, jsonb
) from public;
revoke all on function public.get_conversation_history(uuid, integer)
from public;

grant execute on function public.append_conversation_turn(
  uuid, text, text, jsonb
) to anon, authenticated;
grant execute on function public.get_conversation_history(uuid, integer)
to anon, authenticated;

commit;
