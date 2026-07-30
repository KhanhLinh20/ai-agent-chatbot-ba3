begin;

create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.products (
  id bigint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  category text not null,
  brand text,
  short_description text not null default '',
  description text not null default '',
  price numeric(14, 2) not null check (price >= 0),
  original_price numeric(14, 2) check (original_price is null or original_price >= price),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  image_url text,
  specifications jsonb not null default '{}'::jsonb,
  use_cases text[] not null default '{}',
  is_featured boolean not null default false,
  is_active boolean not null default true,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.faq_documents (
  id bigint generated always as identity primary key,
  title text not null,
  content text not null,
  document_type text not null check (document_type in ('shipping', 'returns', 'warranty', 'payment', 'general')),
  is_active boolean not null default true,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id bigint generated always as identity primary key,
  session_id uuid not null default gen_random_uuid(),
  customer_name text,
  customer_phone text,
  status text not null default 'active' check (status in ('active', 'qualified', 'closed')),
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id)
);

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.leads (
  id bigint generated always as identity primary key,
  conversation_id bigint references public.conversations(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  interested_product_ids bigint[] not null default '{}',
  customer_need text not null,
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_active_category_price_idx
  on public.products (category, price)
  where is_active = true;
create index products_in_stock_idx
  on public.products (stock_quantity)
  where is_active = true and stock_quantity > 0;
create index products_featured_idx
  on public.products (is_featured)
  where is_active = true and is_featured = true;
create index products_embedding_hnsw_idx
  on public.products using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null and is_active = true;
create index faq_embedding_hnsw_idx
  on public.faq_documents using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null and is_active = true;
create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index leads_status_created_idx
  on public.leads (status, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger faq_set_updated_at before update on public.faq_documents
for each row execute function public.set_updated_at();
create trigger conversations_set_updated_at before update on public.conversations
for each row execute function public.set_updated_at();
create trigger leads_set_updated_at before update on public.leads
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

alter table public.products enable row level security;
alter table public.faq_documents enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.leads enable row level security;

create policy "Public can read active products"
on public.products for select
to anon, authenticated
using (is_active = true or (select public.is_admin()));

create policy "Admins manage products"
on public.products for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "Public can read active FAQ"
on public.faq_documents for select
to anon, authenticated
using (is_active = true or (select public.is_admin()));

create policy "Admins manage FAQ"
on public.faq_documents for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "API can create conversations"
on public.conversations for insert
to anon, authenticated
with check (true);

create policy "Admins read conversations"
on public.conversations for select
to authenticated
using ((select public.is_admin()));

create policy "API can append messages"
on public.messages for insert
to anon, authenticated
with check (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
  )
);

create policy "Admins read messages"
on public.messages for select
to authenticated
using ((select public.is_admin()));

create policy "API can create leads"
on public.leads for insert
to anon, authenticated
with check (char_length(customer_name) between 2 and 120 and char_length(customer_phone) between 9 and 20);

create policy "Admins manage leads"
on public.leads for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create or replace function public.match_products(
  query_embedding extensions.vector(1536),
  match_count integer default 3,
  filter_category text default null,
  budget_min numeric default null,
  budget_max numeric default null,
  in_stock_only boolean default true
)
returns table (
  id bigint,
  name text,
  slug text,
  category text,
  brand text,
  short_description text,
  price numeric,
  original_price numeric,
  stock_quantity integer,
  image_url text,
  specifications jsonb,
  use_cases text[],
  is_featured boolean,
  similarity double precision,
  final_score double precision
)
language sql
stable
set search_path = ''
as $$
  with candidates as (
    select
      p.*,
      1 - (p.embedding <=> query_embedding) as similarity,
      case
        when budget_max is null then 1.0
        when p.price <= budget_max then greatest(0.0, 1.0 - ((budget_max - p.price) / greatest(budget_max, 1)))
        else 0.0
      end as budget_score,
      case when p.stock_quantity > 0 then 1.0 else 0.0 end as stock_score,
      case when p.is_featured then 1.0 else 0.0 end as featured_score
    from public.products p
    where p.is_active = true
      and p.embedding is not null
      and (filter_category is null or p.category = filter_category)
      and (budget_min is null or p.price >= budget_min)
      and (budget_max is null or p.price <= budget_max)
      and (not in_stock_only or p.stock_quantity > 0)
  )
  select
    c.id, c.name, c.slug, c.category, c.brand, c.short_description,
    c.price, c.original_price, c.stock_quantity, c.image_url,
    c.specifications, c.use_cases, c.is_featured, c.similarity,
    (
      c.similarity * 0.60
      + c.budget_score * 0.20
      + c.stock_score * 0.10
      + c.featured_score * 0.10
    )::double precision as final_score
  from candidates c
  order by final_score desc, c.id
  limit least(greatest(match_count, 1), 3);
$$;

grant execute on function public.match_products(
  extensions.vector, integer, text, numeric, numeric, boolean
) to anon, authenticated;

commit;
