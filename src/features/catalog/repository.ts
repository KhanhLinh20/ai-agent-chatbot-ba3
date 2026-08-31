import fallbackData from "@/lib/shopee_fallback.json";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { createEmbeddingProvider } from "@/lib/ai/openai-embedding-provider";
import { rankProducts } from "@/features/catalog/ranking";
import {
  searchProductsOutputSchema,
  type ProductSearchResult,
  type SearchProductsInput,
  type SearchProductsOutput,
} from "@/features/catalog/schemas";

type DatabaseProduct = {
  item_id: number | string;
  shop_id: number | string;
  product_name: string;
  price: number | string;
  price_original: number | string | null;
  price_before_promo?: number | string | null;
  discount_percent?: number | string | null;
  voucher_discount?: number | string | null;
  brand: string | null;
  rating: number | string | null;
  rating_count: number | string | null;
  monthly_sold_value: number | string | null;
  image_url: string | null;
  url: string | null;
  is_sold_out: boolean | string;
  description: string | null;
  description_source_url: string | null;
  description_source_type: string | null;
  description_confidence: number | string | null;
  description_verified: boolean | string;
};

type HybridRpcProduct = {
  product: DatabaseProduct;
  semantic_similarity: number;
  lexical_similarity: number;
  final_score: number;
};

const queryEmbeddingCache = new Map<string, number[]>();

async function getQueryEmbedding(
  query: string,
  provider: NonNullable<ReturnType<typeof createEmbeddingProvider>>,
) {
  const key = normalizedText(query).trim();
  const cached = queryEmbeddingCache.get(key);
  if (cached) return cached;
  const embedding = await provider.embed(query);
  if (queryEmbeddingCache.size >= 100) {
    const oldestKey = queryEmbeddingCache.keys().next().value;
    if (oldestKey) queryEmbeddingCache.delete(oldestKey);
  }
  queryEmbeddingCache.set(key, embedding);
  return embedding;
}

function inferLegacyCategory(name: string) {
  const normalized = name.toLowerCase();
  if (/bánh|kẹo|socola|chocopie|biscuit|bibica|orion/.test(normalized))
    return "banh-keo";
  if (/nescaf|cà phê|coffee/.test(normalized)) return "ca-phe";
  if (/maggi|nước tương|dầu hào|hạt nêm|gia vị/.test(normalized))
    return "gia-vi";
  if (/milo|nestea|trà|sữa|thức uống/.test(normalized)) return "do-uong";
  return "banh-keo";
}

function legacyIsInStock(isSoldOut: unknown) {
  return !(
    isSoldOut === true ||
    String(isSoldOut).trim().toLowerCase() === "true" ||
    String(isSoldOut).trim() === "1"
  );
}

function normalizedText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function isSellableProduct(name: string) {
  return !/qua tang|khong ban|mau thu/.test(normalizedText(name));
}

async function databaseSearch(
  input: SearchProductsInput,
  supabase: SupabaseClient,
): Promise<SearchProductsOutput> {
  let query = supabase
    .from("products")
    .select(
      "item_id,shop_id,product_name,price,price_original,price_before_promo,discount_percent,brand,rating,rating_count,monthly_sold_value,image_url,url,is_sold_out,description,description_source_url,description_source_type,description_confidence,description_verified",
    );

  if (input.inStockOnly) query = query.eq("is_sold_out", false);
  if (input.budgetMin !== undefined)
    query = query.gte("price", input.budgetMin);
  if (input.budgetMax !== undefined)
    query = query.lte("price", input.budgetMax);

  const { data, error } = await query
    .order("monthly_sold_value", { ascending: false, nullsFirst: false })
    .limit(1_000);
  if (error) throw error;

  const products = ((data ?? []) as DatabaseProduct[])
    .filter((product) => isSellableProduct(product.product_name))
    .map(mapDatabaseProduct);

  return searchProductsOutputSchema.parse({
    products: rankProducts(products, input),
    retrievalMode: "database",
    appliedFilters: {
      category: input.category ?? null,
      budgetMin: input.budgetMin ?? null,
      budgetMax: input.budgetMax ?? null,
      inStockOnly: input.inStockOnly,
    },
  });
}

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

function mapDatabaseProduct(
  product: DatabaseProduct,
): Omit<
  ProductSearchResult,
  "similarity" | "finalScore" | "reason" | "consideration"
> {
  return {
    id: String(product.item_id),
    name: product.product_name,
    slug: `shopee-${product.shop_id}-${product.item_id}`,
    category: inferLegacyCategory(product.product_name),
    brand: product.brand || null,
    shortDescription:
      product.description?.trim() ||
      [
        product.brand ? `Thương hiệu ${product.brand}.` : "",
        product.rating
          ? `Đánh giá ${Number(product.rating).toFixed(1)}/5.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    price: Number(product.price),
    originalPrice:
      product.price_original === null ? null : Number(product.price_original),
    priceBeforePromotion: nullableNumber(product.price_before_promo),
    discountPercent: nullableNumber(product.discount_percent),
    voucherDiscount: nullableNumber(product.voucher_discount),
    monthlySold: nullableNumber(product.monthly_sold_value),
    stockQuantity: null,
    inStock: legacyIsInStock(product.is_sold_out),
    imageUrl: product.image_url,
    specifications: {
      source: "supabase",
      shopId: String(product.shop_id),
      productUrl: product.url,
      rating: nullableNumber(product.rating),
      ratingCount: nullableNumber(product.rating_count),
      monthlySold: nullableNumber(product.monthly_sold_value),
      descriptionSourceUrl: product.description_source_url,
      descriptionSourceType: product.description_source_type,
      descriptionConfidence: nullableNumber(product.description_confidence),
      descriptionVerified: booleanValue(product.description_verified),
    },
    useCases: [],
    isFeatured: Number(product.monthly_sold_value ?? 0) >= 1_000,
  };
}

function mapHybridProduct(
  row: HybridRpcProduct,
  input: SearchProductsInput,
): ProductSearchResult {
  const product = mapDatabaseProduct(row.product);
  return {
    ...product,
    similarity: Math.max(0, Math.min(1, row.semantic_similarity)),
    finalScore: Math.max(0, Math.min(1, row.final_score)),
    reason: [
      row.semantic_similarity > 0.45
        ? "Nội dung và công dụng có ngữ nghĩa phù hợp với nhu cầu."
        : "Tên hoặc mô tả sản phẩm gần với nhu cầu.",
      row.lexical_similarity > 0.1
        ? "Có từ khóa quan trọng trùng với yêu cầu."
        : "",
      input.budgetMax !== undefined ? "Nằm trong ngân sách đã chọn." : "",
      product.inStock ? "Đang còn hàng." : "",
    ]
      .filter(Boolean)
      .join(" "),
    consideration: null,
  };
}

function createPublicCatalogClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mapFallbackProduct(product: (typeof fallbackData.products)[number]) {
  return {
    id: String(product.item_id),
    name: product.product_name,
    slug: `legacy-${product.item_id}`,
    category: inferLegacyCategory(product.product_name),
    brand: product.brand || null,
    shortDescription: [
      product.brand ? `Thương hiệu ${product.brand}.` : "",
      product.rating ? `Đánh giá ${Number(product.rating).toFixed(1)}/5.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    price: Number(product.price),
    originalPrice: product.price_original
      ? Number(product.price_original)
      : null,
    priceBeforePromotion: nullableNumber(product.price_before_promo),
    discountPercent: nullableNumber(product.discount_percent),
    voucherDiscount: nullableNumber(product.voucher_discount),
    monthlySold: nullableNumber(product.monthly_sold_value),
    stockQuantity: null,
    inStock: legacyIsInStock(product.is_sold_out),
    imageUrl: product.image_url || null,
    specifications: {
      rating: product.rating,
      monthlySold: product.monthly_sold_value,
    },
    useCases: [],
    isFeatured: Number(product.monthly_sold_value ?? 0) >= 1000,
  };
}

function legacyFallback(input: SearchProductsInput): SearchProductsOutput {
  const products = fallbackData.products
    .filter(
      (product) =>
        !/quà tặng|không bán/i.test(product.product_name) &&
        legacyIsInStock(product.is_sold_out),
    )
    .map(mapFallbackProduct);

  return searchProductsOutputSchema.parse({
    products: rankProducts(products, input),
    retrievalMode: "fallback",
    appliedFilters: {
      category: input.category ?? null,
      budgetMin: input.budgetMin ?? null,
      budgetMax: input.budgetMax ?? null,
      inStockOnly: input.inStockOnly,
    },
  });
}

export async function retrieveProductsByIds(
  ids: string[],
  query: string,
): Promise<ProductSearchResult[]> {
  const uniqueIds = [...new Set(ids)].slice(0, 3);
  if (!uniqueIds.length) return [];

  const input: SearchProductsInput = {
    query,
    inStockOnly: true,
    limit: 3,
  };
  const supabase = createPublicCatalogClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "item_id,shop_id,product_name,price,price_original,price_before_promo,discount_percent,brand,rating,rating_count,monthly_sold_value,image_url,url,is_sold_out,description,description_source_url,description_source_type,description_confidence,description_verified",
      )
      .in("item_id", uniqueIds);
    if (!error && data?.length) {
      const ranked = rankProducts(
        (data as DatabaseProduct[])
          .filter((product) => isSellableProduct(product.product_name))
          .map(mapDatabaseProduct),
        input,
      );
      const byId = new Map(ranked.map((product) => [product.id, product]));
      return uniqueIds.flatMap((id) => {
        const product = byId.get(id);
        return product ? [product] : [];
      });
    }
  }

  const fallbackProducts = fallbackData.products
    .filter(
      (product) =>
        uniqueIds.includes(String(product.item_id)) &&
        isSellableProduct(product.product_name),
    )
    .map(mapFallbackProduct);
  const ranked = rankProducts(fallbackProducts, input);
  const byId = new Map(ranked.map((product) => [product.id, product]));
  return uniqueIds.flatMap((id) => {
    const product = byId.get(id);
    return product ? [product] : [];
  });
}

export async function searchProducts(
  input: SearchProductsInput,
): Promise<SearchProductsOutput> {
  const supabase = createPublicCatalogClient();
  const provider = createEmbeddingProvider();

  if (provider && supabase) {
    try {
      const queryEmbedding = await getQueryEmbedding(input.query, provider);
      const { data, error } = await supabase.rpc("hybrid_search_products", {
        query_embedding: queryEmbedding,
        query_text: input.query,
        match_count: Math.max(18, input.limit * 6),
        filter_category: input.category ?? null,
        budget_min: input.budgetMin ?? null,
        budget_max: input.budgetMax ?? null,
        in_stock_only: input.inStockOnly,
      });

      if (error) throw error;
      const products = ((data ?? []) as HybridRpcProduct[])
        .filter((row) => isSellableProduct(row.product.product_name))
        .map((row) => mapHybridProduct(row, input))
        .slice(0, input.limit);
      if (products.length) {
        return searchProductsOutputSchema.parse({
          products,
          retrievalMode: "semantic",
          appliedFilters: {
            category: input.category ?? null,
            budgetMin: input.budgetMin ?? null,
            budgetMax: input.budgetMax ?? null,
            inStockOnly: input.inStockOnly,
          },
        });
      }
    } catch (error) {
      console.warn(
        "Hybrid product search unavailable; trying database ranking.",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  if (supabase) {
    try {
      return await databaseSearch(input, supabase);
    } catch (error) {
      console.warn(
        "Supabase product list unavailable; using deterministic fallback.",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  return legacyFallback(input);
}
