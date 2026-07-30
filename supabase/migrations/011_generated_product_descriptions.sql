begin;

alter table public.products
  add column if not exists description text,
  add column if not exists description_generated_at timestamptz,
  add column if not exists description_generation_version text;

alter table public.products
  drop constraint if exists products_description_source_type_check,
  add constraint products_description_source_type_check
    check (
      description_source_type is null
      or description_source_type in (
        'official_product',
        'official_brand',
        'generated_from_name'
      )
    );

comment on column public.products.description_generated_at is
  'Time the current description was generated from the product catalog name.';

comment on column public.products.description_generation_version is
  'Version of the deterministic title-to-description generator.';

commit;

