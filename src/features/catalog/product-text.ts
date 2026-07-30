type EmbeddableProduct = {
  name: string;
  category: string;
  brand?: string | null;
  short_description?: string | null;
  description?: string | null;
  specifications?: Record<string, unknown> | null;
  use_cases?: string[] | null;
};

export type LegacyEmbeddableProduct = {
  product_name: string;
  brand?: string | null;
  description?: string | null;
};

export function buildProductEmbeddingText(product: EmbeddableProduct): string {
  const specifications = Object.entries(product.specifications ?? {})
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(", ");

  return [
    `Tên sản phẩm: ${product.name}`,
    `Danh mục: ${product.category}`,
    product.brand ? `Thương hiệu: ${product.brand}` : "",
    product.short_description
      ? `Mô tả ngắn: ${product.short_description}`
      : "",
    product.description ? `Mô tả: ${product.description}` : "",
    specifications ? `Thông số: ${specifications}` : "",
    product.use_cases?.length
      ? `Mục đích sử dụng: ${product.use_cases.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildLegacyProductEmbeddingText(
  product: LegacyEmbeddableProduct,
): string {
  return [
    `Tên sản phẩm: ${product.product_name}`,
    product.brand ? `Thương hiệu: ${product.brand}` : "",
    product.description ? `Mô tả đã xác minh: ${product.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
