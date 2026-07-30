import { NextResponse } from "next/server";
import { demoStore } from "@/features/admin/demo-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function categoryOf(name: string) {
  const value = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (/banh|keo|socola|snack|bibica|orion|richy/.test(value))
    return "banh-keo";
  if (/ca phe|nescafe|coffee/.test(value)) return "ca-phe";
  if (/maggi|gia vi|nuoc tuong|dau hao|hat nem/.test(value)) return "gia-vi";
  return "do-uong";
}

export async function GET() {
  try {
    const supabase = createAdminClient() ?? (await createClient());
    const products = await supabase
      .from("products")
      .select(
        "item_id, product_name, brand, price, image_url, is_sold_out, monthly_sold_value, description, description_source_url, description_source_type, description_confidence",
      )
      .order("monthly_sold_value", { ascending: false, nullsFirst: false })
      .limit(1_000);
    if (products.error) throw products.error;

    const [conversations, initialLeads, faq] = await Promise.all([
      supabase
        .from("conversations")
        .select("id, session_id, status, summary, created_at")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("leads")
        .select(
          "id, customer_name, customer_phone, customer_address, customer_need, status, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("faq_documents")
        .select("id, title, content, document_type, is_active")
        .order("updated_at", { ascending: false })
        .limit(30),
    ]);
    let leadRows = initialLeads.error ? [] : (initialLeads.data ?? []);
    if (
      initialLeads.error &&
      ["PGRST204", "42703"].includes(initialLeads.error.code)
    ) {
      const legacyLeads = await supabase
        .from("leads")
        .select(
          "id, customer_name, customer_phone, customer_need, status, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      leadRows = (legacyLeads.data ?? []).map((lead) => ({
        ...lead,
        customer_address: null,
      }));
    }

    return NextResponse.json({
      mode: "supabase",
      products: (products.data ?? []).map((product) => ({
        id: String(product.item_id),
        name: product.product_name,
        category: categoryOf(product.product_name),
        brand: product.brand || "Khác",
        price: Number(product.price),
        stockQuantity: product.is_sold_out ? 0 : 100,
        imageUrl: product.image_url,
        isActive: true,
        description: product.description,
        descriptionSourceUrl: product.description_source_url,
        descriptionSourceType: product.description_source_type,
        descriptionConfidence:
          product.description_confidence === null
            ? null
            : Number(product.description_confidence),
      })),
      conversations: conversations.error ? [] : (conversations.data ?? []),
      leads: leadRows,
      faq: faq.error ? [] : (faq.data ?? []),
    });
  } catch {
    return NextResponse.json({
      mode: "demo",
      products: demoStore.products,
      conversations: [],
      leads: [],
      faq: [
        {
          id: "shipping",
          title: "Giao hàng nhanh 2H",
          content:
            "Phí giao hiển thị trước khi xác nhận; đơn từ 300.000đ được miễn phí trong bản demo.",
          document_type: "shipping",
          is_active: true,
        },
        {
          id: "returns",
          title: "Đổi trả",
          content: "Hỗ trợ khi sản phẩm lỗi, hư hỏng hoặc giao sai.",
          document_type: "returns",
          is_active: true,
        },
      ],
    });
  }
}
