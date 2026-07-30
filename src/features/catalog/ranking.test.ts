import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateBudgetScore,
  calculateFinalScore,
  rankProducts,
} from "@/features/catalog/ranking";

const products = [
  {
    id: "1",
    name: "MILO bột lúa mạch 400g",
    slug: "milo-400g",
    category: "do-uong",
    brand: "MILO",
    shortDescription: "Thức uống cho bữa sáng",
    price: 82_000,
    originalPrice: 90_000,
    stockQuantity: 10,
    inStock: true,
    imageUrl: null,
    specifications: {},
    useCases: ["bua-sang", "tre-em"],
    isFeatured: true,
  },
  {
    id: "2",
    name: "MAGGI nước tương 700ml",
    slug: "maggi-700ml",
    category: "gia-vi",
    brand: "Maggi",
    shortDescription: "Gia vị bếp Việt",
    price: 32_000,
    originalPrice: null,
    stockQuantity: 20,
    inStock: true,
    imageUrl: null,
    specifications: {},
    useCases: ["nau-an"],
    isFeatured: false,
  },
];

test("final score áp dụng đúng trọng số 60/20/10/10", () => {
  assert.equal(
    calculateFinalScore({
      similarity: 1,
      budgetScore: 1,
      inStock: true,
      isFeatured: true,
    }),
    1,
  );
});

test("budget score loại sản phẩm vượt ngân sách", () => {
  assert.equal(calculateBudgetScore(120_000, undefined, 100_000), 0);
});

test("hard filter chạy trước và kết quả tối đa ba sản phẩm", () => {
  const result = rankProducts(products, {
    query: "Milo cho bé ăn sáng",
    category: "do-uong",
    budgetMax: 100_000,
    inStockOnly: true,
    limit: 3,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].brand, "MILO");
  assert.ok(result[0].finalScore > 0.5);
});
