begin;

-- Conversations and messages are the normalized source of truth for the
-- complete transcript. This migration adds the covering index and a single
-- admin-facing RPC so the UI does not need an N+1 query per conversation.
create index if not exists messages_conversation_created_id_idx
  on public.messages (conversation_id, created_at, id);

create or replace function public.get_admin_conversation_transcripts(
  p_limit integer default 100
)
returns table (
  conversation_id bigint,
  session_id uuid,
  customer_name text,
  customer_phone text,
  status text,
  summary text,
  created_at timestamptz,
  updated_at timestamptz,
  message_count bigint,
  last_message text,
  transcript jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id as conversation_id,
    c.session_id,
    c.customer_name,
    c.customer_phone,
    c.status,
    c.summary,
    c.created_at,
    c.updated_at,
    count(m.id) as message_count,
    (
      array_agg(m.content order by m.created_at desc, m.id desc)
      filter (where m.id is not null)
    )[1] as last_message,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'role', m.role,
          'content', m.content,
          'metadata', m.metadata,
          'created_at', m.created_at
        )
        order by m.created_at, m.id
      ) filter (where m.id is not null),
      '[]'::jsonb
    ) as transcript
  from public.conversations c
  left join public.messages m on m.conversation_id = c.id
  group by c.id
  order by c.updated_at desc
  limit least(greatest(p_limit, 1), 200);
$$;

revoke all on function public.get_admin_conversation_transcripts(integer)
  from public, anon;
grant execute on function public.get_admin_conversation_transcripts(integer)
  to authenticated, service_role;

comment on function public.get_admin_conversation_transcripts(integer) is
  'Returns complete user/assistant transcripts for the authenticated admin console.';

commit;
