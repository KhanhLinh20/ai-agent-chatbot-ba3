import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { searchProducts } from "@/features/catalog/repository";
import { searchProductsInputSchema } from "@/features/catalog/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = searchProductsInputSchema.parse(await request.json());
    const result = await searchProducts(payload);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "INVALID_SEARCH_REQUEST",
          message: "Yêu cầu tìm kiếm không hợp lệ.",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: "INVALID_JSON",
          message: "Request body phải là JSON hợp lệ.",
        },
        { status: 400 },
      );
    }

    console.error("search_products failed", error);
    return NextResponse.json(
      {
        error: "SEARCH_PRODUCTS_FAILED",
        message: "Không thể tìm sản phẩm vào lúc này.",
      },
      { status: 500 },
    );
  }
}
