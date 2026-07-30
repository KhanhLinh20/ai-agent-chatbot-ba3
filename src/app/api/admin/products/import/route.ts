import { NextResponse } from "next/server";
import { z } from "zod";
import { demoStore } from "@/features/admin/demo-store";

const rowSchema = z.object({
  name: z.string().trim().min(2),
  category: z.string().trim().min(2),
  brand: z.string().trim().default("Khác"),
  price: z.coerce.number().nonnegative(),
  stockQuantity: z.coerce.number().int().nonnegative(),
  imageUrl: z.string().url().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const rows = z.array(rowSchema).min(1).max(500).parse(await request.json());
    const products = rows.map((row, index) => ({
      ...row,
      imageUrl: row.imageUrl ?? null,
      id: `csv-${Date.now()}-${index}`,
      isActive: true,
    }));
    demoStore.products.unshift(...products);
    return NextResponse.json({
      mode: "demo",
      imported: products.length,
      message:
        "Đã nhập vào bộ dữ liệu demo. Khi kết nối Supabase, hãy dùng import server-side có quyền admin.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues[0]?.message
            : "Tệp CSV không hợp lệ.",
      },
      { status: 400 },
    );
  }
}
