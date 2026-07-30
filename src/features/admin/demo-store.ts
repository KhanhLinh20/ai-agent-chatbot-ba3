import fallbackData from "@/lib/shopee_fallback.json";

export type AdminProduct = {
  id: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  stockQuantity: number;
  imageUrl: string | null;
  isActive: boolean;
  description?: string | null;
  descriptionSourceUrl?: string | null;
  descriptionSourceType?:
    | "official_product"
    | "official_brand"
    | "generated_from_name"
    | null;
  descriptionConfidence?: number | null;
};

function categoryOf(name: string) {
  const value = name.toLowerCase();
  if (/bánh|kẹo|socola|snack|bibica|orion/.test(value)) return "banh-keo";
  if (/cà phê|nescaf|coffee/.test(value)) return "ca-phe";
  if (/maggi|gia vị|nước tương|dầu hào|hạt nêm/.test(value)) return "gia-vi";
  return "do-uong";
}

const initialProducts: AdminProduct[] = fallbackData.products
  .filter((product) => !/quà tặng|không bán/i.test(product.product_name))
  .slice(0, 40)
  .map((product) => ({
    id: String(product.item_id),
    name: product.product_name,
    category: categoryOf(product.product_name),
    brand: product.brand || "Khác",
    price: Number(product.price) || 0,
    stockQuantity:
      String(product.is_sold_out).toLowerCase() === "true" ? 0 : 100,
    imageUrl: product.image_url || null,
    isActive: true,
    description: null,
    descriptionSourceUrl: null,
    descriptionSourceType: null,
    descriptionConfidence: null,
  }));

type DemoState = { products: AdminProduct[] };
const globalStore = globalThis as typeof globalThis & {
  __martyAdminDemo?: DemoState;
};

export const demoStore =
  globalStore.__martyAdminDemo ??
  (globalStore.__martyAdminDemo = { products: initialProducts });
