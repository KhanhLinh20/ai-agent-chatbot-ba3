import type {
  ProductSearchResult,
  SearchProductsInput,
} from "@/features/catalog/schemas";

type RankableProduct = Omit<
  ProductSearchResult,
  "similarity" | "finalScore" | "reason" | "consideration"
>;

const STOP_WORDS = new Set([
  "cho",
  "cua",
  "can",
  "co",
  "giá",
  "gia",
  "gi",
  "mua",
  "nao",
  "sản",
  "san",
  "pham",
  "tôi",
  "toi",
  "va",
  "voi",
  "an",
]);

function tokens(value: string): Set<string> {
  return new Set(
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/đ/g, "d")
      .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  );
}

export function keywordSimilarity(query: string, product: RankableProduct) {
  const queryTokens = tokens(query);
  if (!queryTokens.size) return 0;

  const productTokens = tokens(
    [
      product.name,
      product.category,
      product.brand,
      product.shortDescription,
      product.useCases.join(" "),
    ]
      .filter(Boolean)
      .join(" "),
  );

  let intersection = 0;
  queryTokens.forEach((token) => {
    if (productTokens.has(token)) intersection += 1;
  });
  return Math.min(1, intersection / queryTokens.size);
}

export function calculateBudgetScore(
  price: number,
  budgetMin?: number,
  budgetMax?: number,
) {
  if (budgetMin !== undefined && price < budgetMin) return 0;
  if (budgetMax !== undefined && price > budgetMax) return 0;
  if (budgetMax === undefined) return 1;
  return Math.max(0, 1 - Math.abs(budgetMax - price) / budgetMax);
}

export function calculateFinalScore(input: {
  similarity: number;
  budgetScore: number;
  inStock: boolean;
  isFeatured: boolean;
}) {
  return Math.min(
    1,
    input.similarity * 0.6 +
      input.budgetScore * 0.2 +
      (input.inStock ? 1 : 0) * 0.1 +
      (input.isFeatured ? 1 : 0) * 0.1,
  );
}

export function rankProducts(
  products: RankableProduct[],
  input: SearchProductsInput,
): ProductSearchResult[] {
  return products
    .filter(
      (product) =>
        (!input.category || product.category === input.category) &&
        (input.budgetMin === undefined || product.price >= input.budgetMin) &&
        (input.budgetMax === undefined || product.price <= input.budgetMax) &&
        (!input.inStockOnly || product.inStock),
    )
    .map((product) => {
      const similarity = keywordSimilarity(input.query, product);
      const finalScore = calculateFinalScore({
        similarity,
        budgetScore: calculateBudgetScore(
          product.price,
          input.budgetMin,
          input.budgetMax,
        ),
        inStock: product.inStock,
        isFeatured: product.isFeatured,
      });

      return {
        ...product,
        similarity,
        finalScore,
        reason: [
          similarity > 0
            ? "Tên, thương hiệu hoặc mục đích sử dụng khớp nhu cầu."
            : "Sản phẩm thuộc catalog đang hoạt động.",
          product.inStock ? "Đang còn hàng." : "Hiện đã hết hàng.",
          input.budgetMax !== undefined ? "Nằm trong ngân sách đã chọn." : "",
        ]
          .filter(Boolean)
          .join(" "),
        consideration:
          product.stockQuantity !== null && product.stockQuantity <= 5
            ? "Số lượng tồn kho còn ít."
            : null,
      };
    })
    .sort(
      (left, right) =>
        right.finalScore - left.finalScore ||
        right.similarity - left.similarity ||
        left.price - right.price,
    )
    .slice(0, input.limit);
}
