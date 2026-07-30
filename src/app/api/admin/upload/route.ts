import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Chưa chọn ảnh." }, { status: 400 });
    }
    if (!allowedTypes.has(file.type) || file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Chỉ nhận JPG, PNG, WebP tối đa 5MB." },
        { status: 400 },
      );
    }
    const extension = file.name.split(".").pop()?.toLowerCase() || "webp";
    const path = `${crypto.randomUUID()}.${extension}`;
    const supabase = await createClient();
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Không thể tải ảnh lên Supabase.",
      },
      { status: 503 },
    );
  }
}
