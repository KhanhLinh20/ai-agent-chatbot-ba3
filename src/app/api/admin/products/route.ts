import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { demoStore } from "@/features/admin/demo-store";

const productSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(200),
  category: z.string().trim().min(2).max(80),
  brand: z.string().trim().max(100).default("Khác"),
  price: z.coerce.number().nonnegative(),
  stockQuantity: z.coerce.number().int().nonnegative(),
  imageUrl: z.string().url().nullable().default(null),
  isActive: z.boolean().default(true),
});

async function writeSupabase(
  method: "POST" | "PATCH" | "DELETE",
  body: z.infer<typeof productSchema>,
) {
  const supabase = await createClient();
  if (method === "POST") {
    return supabase
      .from("products")
      .insert({
        item_id: String(Date.now()),
        shop_id: "0",
        product_name: body.name,
        brand: body.brand,
        price: body.price,
        image_url: body.imageUrl,
        is_sold_out: body.stockQuantity === 0,
        monthly_sold_value: 0,
      })
      .select()
      .single();
  }
  if (method === "PATCH") {
    return supabase
      .from("products")
      .update({
        product_name: body.name,
        brand: body.brand,
        price: body.price,
        image_url: body.imageUrl,
        is_sold_out: body.stockQuantity === 0,
      })
      .eq("item_id", body.id)
      .select()
      .single();
  }
  return supabase.from("products").delete().eq("item_id", body.id);
}

async function mutate(request: Request, method: "POST" | "PATCH" | "DELETE") {
  try {
    const body = productSchema.parse(await request.json());
    try {
      const result = await writeSupabase(method, body);
      if (result.error) throw result.error;
      return NextResponse.json({ mode: "supabase", product: result.data });
    } catch {
      if (method === "POST") {
        const product = { ...body, id: `demo-${Date.now()}` };
        demoStore.products.unshift(product);
        return NextResponse.json({ mode: "demo", product });
      }
      const index = demoStore.products.findIndex(
        (product) => product.id === body.id,
      );
      if (index < 0)
        return NextResponse.json(
          { error: "Không tìm thấy sản phẩm." },
          { status: 404 },
        );
      if (method === "DELETE") {
        demoStore.products.splice(index, 1);
      } else {
        demoStore.products[index] = {
          ...body,
          id: body.id!,
        };
      }
      return NextResponse.json({ mode: "demo", product: body });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues[0]?.message
            : "Không thể cập nhật sản phẩm.",
      },
      { status: 400 },
    );
  }
}

export const POST = (request: Request) => mutate(request, "POST");
export const PATCH = (request: Request) => mutate(request, "PATCH");
export const DELETE = (request: Request) => mutate(request, "DELETE");
