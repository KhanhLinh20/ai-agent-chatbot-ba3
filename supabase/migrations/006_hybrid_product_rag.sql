create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

alter table public.products
  add column if not exists rag_content text,
  add column if not exists rag_category text,
  add column if not exists embedding extensions.vector(1536),
  add column if not exists embedding_updated_at timestamptz;

create or replace function public.refresh_product_rag_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.rag_content := concat_ws(
    ' ',
    new.product_name,
    new.brand,
    new.description
  );
  new.rag_category := case
    when lower(new.product_name) ~ '(nescaf|cà phê|ca phe|coffee)' then 'ca-phe'
    when lower(new.product_name) ~ '(maggi|nước tương|nuoc tuong|dầu hào|dau hao|hạt nêm|hat nem|gia vị|gia vi)' then 'gia-vi'
    when lower(new.product_name) ~ '(milo|nestea|trà|tra|sữa|sua|thức uống|thuc uong)' then 'do-uong'
    else 'banh-keo'
  end;
  return new;
end;
$$;

drop trigger if exists products_refresh_rag_fields on public.products;
create trigger products_refresh_rag_fields
before insert or update of product_name, brand, description
on public.products
for each row execute function public.refresh_product_rag_fields();

update public.products
set
  rag_content = concat_ws(' ', product_name, brand, description),
  rag_category = case
    when lower(product_name) ~ '(nescaf|cà phê|ca phe|coffee)' then 'ca-phe'
    when lower(product_name) ~ '(maggi|nước tương|nuoc tuong|dầu hào|dau hao|hạt nêm|hat nem|gia vị|gia vi)' then 'gia-vi'
    when lower(product_name) ~ '(milo|nestea|trà|tra|sữa|sua|thức uống|thuc uong)' then 'do-uong'
    else 'banh-keo'
  end
where rag_content is null or rag_category is null;

create index if not exists products_embedding_hnsw_idx
  on public.products
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create index if not exists products_rag_content_trgm_idx
  on public.products
  using gin (rag_content extensions.gin_trgm_ops);

create index if not exists products_rag_filters_idx
  on public.products (rag_category, is_sold_out, price);

create or replace function public.hybrid_search_products(
  query_embedding extensions.vector(1536),
  query_text text,
  match_count integer default 18,
  filter_category text default null,
  budget_min numeric default null,
  budget_max numeric default null,
  in_stock_only boolean default true
)
returns table (
  product jsonb,
  semantic_similarity double precision,
  lexical_similarity double precision,
  final_score double precision
)
language sql
stable
set search_path = ''
as $$
  with filtered as (
    select p.*
    from public.products p
    where p.embedding is not null
      and (filter_category is null or p.rag_category = filter_category)
      and (budget_min is null or p.price >= budget_min)
      and (budget_max is null or p.price <= budget_max)
      and (not in_stock_only or not p.is_sold_out)
  ),
  semantic_candidates as (
    select
      f.item_id,
      greatest(
        0,
        1 - (f.embedding OPERATOR(extensions.<=>) query_embedding)
      ) as semantic_score
    from filtered f
    order by f.embedding OPERATOR(extensions.<=>) query_embedding
    limit greatest(match_count * 4, 40)
  ),
  lexical_candidates as (
    select
      f.item_id,
      extensions.similarity(coalesce(f.rag_content, ''), query_text) as lexical_score
    from filtered f
    where extensions.similarity(coalesce(f.rag_content, ''), query_text) > 0.05
    order by lexical_score desc
    limit greatest(match_count * 4, 40)
  ),
  candidate_ids as (
    select item_id from semantic_candidates
    union
    select item_id from lexical_candidates
  )
  select
    to_jsonb(p) - 'embedding' - 'rag_content' as product,
    coalesce(s.semantic_score, 0)::double precision,
    coalesce(l.lexical_score, 0)::double precision,
    (
      coalesce(s.semantic_score, 0) * 0.65
      + coalesce(l.lexical_score, 0) * 0.25
      + least(1, ln(1 + coalesce(p.monthly_sold_value, 0)) / 12) * 0.10
    )::double precision as final_score
  from candidate_ids c
  join public.products p on p.item_id = c.item_id
  left join semantic_candidates s on s.item_id = c.item_id
  left join lexical_candidates l on l.item_id = c.item_id
  order by final_score desc
  limit greatest(1, least(match_count, 50));
$$;

grant execute on function public.hybrid_search_products(
  extensions.vector,
  text,
  integer,
  text,
  numeric,
  numeric,
  boolean
) to anon, authenticated, service_role;
