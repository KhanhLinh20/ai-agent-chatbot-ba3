begin;

create table if not exists public.product_description_drafts (
  generation_version text not null,
  item_id text not null references public.products(item_id) on delete cascade,
  description text not null,
  created_at timestamptz not null default now(),
  primary key (generation_version, item_id)
);

alter table public.product_description_drafts enable row level security;

comment on table public.product_description_drafts is
  'Internal resumable staging area for generated product descriptions.';

commit;

