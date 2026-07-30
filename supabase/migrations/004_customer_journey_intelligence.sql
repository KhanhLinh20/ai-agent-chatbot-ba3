begin;

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

create index if not exists customer_journey_session_time_idx
  on public.customer_journey_events (session_id, occurred_at desc);
create index if not exists customer_journey_category_idx
  on public.customer_journey_events (category)
  where category is not null;

alter table public.customer_journey_events enable row level security;

create policy "API can append journey events"
on public.customer_journey_events for insert
to anon, authenticated
with check (true);

create policy "Admins read journey events"
on public.customer_journey_events for select
to authenticated
using ((select public.is_admin()));

commit;
