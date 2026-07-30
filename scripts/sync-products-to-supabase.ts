import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import fallbackData from "../src/lib/shopee_fallback.json";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown) {
  return (
    value === true ||
    String(value).trim().toLowerCase() === "true" ||
    String(value).trim() === "1"
  );
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function timestampValue(value: unknown) {
  const unixSeconds = nullableNumber(value);
  if (unixSeconds === null) return null;
  return new Date(unixSeconds * 1_000).toISOString();
}

const products = fallbackData.products.map((product) => ({
  item_id: String(product.item_id),
  shop_id: String(product.shop_id),
  product_name: product.product_name,
  price: nullableNumber(product.price) ?? 0,
  price_original: nullableNumber(product.price_original),
  price_before_promo: nullableNumber(product.price_before_promo),
  discount_percent: nullableNumber(product.discount_percent),
  brand: product.brand || null,
  brand_id: product.brand_id ? String(product.brand_id) : null,
  catid: product.catid ? String(product.catid) : null,
  rating: nullableNumber(product.rating),
  rating_count: nullableNumber(product.rating_count),
  liked_count: nullableNumber(product.liked_count),
  url: product.url || null,
  image_url: product.image_url || null,
  images: stringArray(product.images),
  tier_variation_name: product.tier_variation_name || null,
  tier_variation_options: stringArray(product.tier_variation_options),
  location: product.location || null,
  is_sold_out: booleanValue(product.is_sold_out),
  shopee_verified: booleanValue(product.shopee_verified),
  ctime: timestampValue(product.ctime),
  monthly_sold_value: nullableNumber(product.monthly_sold_value),
}));

async function main() {
  const env = envSchema.parse(process.env);
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const batchSize = 100;
  let synced = 0;

  for (let offset = 0; offset < products.length; offset += batchSize) {
    const batch = products.slice(offset, offset + batchSize);
    const { error } = await supabase
      .from("products")
      .upsert(batch, { onConflict: "item_id", ignoreDuplicates: false });
    if (error) throw error;
    synced += batch.length;
    console.log(`Synced ${synced}/${products.length} products`);
  }

  const { count, error } = await supabase
    .from("products")
    .select("item_id", { count: "exact", head: true });
  if (error) throw error;

  console.log(
    JSON.stringify({
      sourceProducts: products.length,
      syncedProducts: synced,
      supabaseProducts: count,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
