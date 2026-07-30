import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createLead } from "@/features/chat/repository";
import { leadInputSchema } from "@/features/chat/schemas";

export async function POST(request: Request) {
  try {
    const input = leadInputSchema.parse(await request.json());
    const lead = await createLead(input);
    return NextResponse.json({
      lead,
      message: "Đã ghi nhận. Tư vấn viên sẽ liên hệ với bạn sớm.",
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Thông tin chưa hợp lệ." },
        { status: 400 },
      );
    }
    console.error("Lead creation failed.", error);
    return NextResponse.json(
      {
        error:
          "Chưa thể lưu thông tin. Vui lòng kiểm tra cấu hình Supabase và thử lại.",
      },
      { status: 503 },
    );
  }
}
