begin;

-- Promotion metadata is kept alongside the catalog price. `price` remains the
-- amount charged at checkout; these columns allow the UI to explain how it was
-- calculated and preserve the source campaign values.
alter table public.products
  add column if not exists price_before_promo numeric,
  add column if not exists discount_percent numeric,
  add column if not exists voucher_discount numeric,
  add column if not exists promotion_id text;

alter table public.products
  drop constraint if exists products_discount_percent_check,
  add constraint products_discount_percent_check
    check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100));

commit;
