begin;

alter table public.products
  add column if not exists description text,
  add column if not exists description_source_url text,
  add column if not exists description_source_type text,
  add column if not exists description_confidence numeric(4, 3),
  add column if not exists description_collected_at timestamptz,
  add column if not exists description_verified boolean not null default false;

alter table public.products
  drop constraint if exists products_description_source_type_check,
  add constraint products_description_source_type_check
    check (
      description_source_type is null
      or description_source_type in ('official_product', 'official_brand')
    ),
  drop constraint if exists products_description_confidence_check,
  add constraint products_description_confidence_check
    check (
      description_confidence is null
      or description_confidence between 0 and 1
    );

create index if not exists products_description_review_idx
  on public.products (description_verified, description_confidence)
  where description is not null;

commit;
