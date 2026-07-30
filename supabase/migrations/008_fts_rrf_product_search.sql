begin;

alter table public.products
  add column if not exists rag_fts tsvector
  generated always as (
    to_tsvector('simple', coalesce(rag_content, ''))
  ) stored;

create index if not exists products_rag_fts_idx
  on public.products using gin (rag_fts);

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
      ) as semantic_score,
      row_number() over (
        order by f.embedding OPERATOR(extensions.<=>) query_embedding
      ) as semantic_rank
    from filtered f
    order by f.embedding OPERATOR(extensions.<=>) query_embedding
    limit greatest(match_count * 4, 40)
  ),
  lexical_scored as (
    select
      f.item_id,
      greatest(
        ts_rank_cd(
          f.rag_fts,
          websearch_to_tsquery('simple', query_text)
        ),
        extensions.similarity(coalesce(f.rag_content, ''), query_text)
      ) as lexical_score
    from filtered f
    where
      f.rag_fts @@ websearch_to_tsquery('simple', query_text)
      or extensions.similarity(
        coalesce(f.rag_content, ''),
        query_text
      ) > 0.05
  ),
  lexical_candidates as (
    select
      l.item_id,
      l.lexical_score,
      row_number() over (order by l.lexical_score desc) as lexical_rank
    from lexical_scored l
    order by l.lexical_score desc
    limit greatest(match_count * 4, 40)
  ),
  candidate_ids as (
    select item_id from semantic_candidates
    union
    select item_id from lexical_candidates
  )
  select
    to_jsonb(p) - 'embedding' - 'rag_content' - 'rag_fts' as product,
    coalesce(s.semantic_score, 0)::double precision,
    coalesce(l.lexical_score, 0)::double precision,
    least(
      1,
      (
        coalesce(0.55 / (60 + s.semantic_rank), 0)
        + coalesce(0.35 / (60 + l.lexical_rank), 0)
      ) * 60
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

commit;
