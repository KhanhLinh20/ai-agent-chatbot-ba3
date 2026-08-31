import { z } from "zod";

export const searchProductsInputSchema = z
  .object({
    query: z.string().trim().min(2).max(500),
    category: z.string().trim().min(1).max(80).optional(),
    budgetMin: z.coerce.number().nonnegative().optional(),
    budgetMax: z.coerce.number().positive().optional(),
    inStockOnly: z.boolean().default(true),
    limit: z.coerce.number().int().min(1).max(3).default(3),
  })
  .superRefine((value, context) => {
    if (
      value.budgetMin !== undefined &&
      value.budgetMax !== undefined &&
      value.budgetMin > value.budgetMax
    ) {
      context.addIssue({
        code: "custom",
        message: "budgetMin không được lớn hơn budgetMax.",
        path: ["budgetMin"],
      });
    }
  });

export type SearchProductsInput = z.infer<typeof searchProductsInputSchema>;

export const productSearchResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  category: z.string(),
  brand: z.string().nullable(),
  shortDescription: z.string(),
  price: z.number().nonnegative(),
  originalPrice: z.number().nonnegative().nullable(),
  priceBeforePromotion: z.number().nonnegative().nullable().optional(),
  discountPercent: z.number().nonnegative().max(100).nullable().optional(),
  voucherDiscount: z.number().nonnegative().nullable().optional(),
  monthlySold: z.number().nonnegative().nullable().optional(),
  stockQuantity: z.number().int().nonnegative().nullable(),
  inStock: z.boolean(),
  imageUrl: z.string().url().nullable(),
  specifications: z.record(z.string(), z.unknown()),
  useCases: z.array(z.string()),
  isFeatured: z.boolean(),
  similarity: z.number().min(0).max(1),
  finalScore: z.number().min(0).max(1),
  reason: z.string(),
  consideration: z.string().nullable(),
});

export type ProductSearchResult = z.infer<typeof productSearchResultSchema>;

export const searchProductsOutputSchema = z.object({
  products: z.array(productSearchResultSchema).max(3),
    retrievalMode: z.enum(["semantic", "database", "fallback"]),
  appliedFilters: z.object({
    category: z.string().nullable(),
    budgetMin: z.number().nullable(),
    budgetMax: z.number().nullable(),
    inStockOnly: z.boolean(),
  }),
});

export type SearchProductsOutput = z.infer<typeof searchProductsOutputSchema>;
