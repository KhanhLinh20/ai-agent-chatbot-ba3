import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function getDatabase() {
  const database = createAdminClient();
  if (!database) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  return database;
}

export async function GET() {
  try {
    const { data, error } = await getDatabase()
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("API GET Orders Error:", error);
    return NextResponse.json(
      { error: "Không thể tải đơn hàng từ Supabase." },
      { status: 503 },
    );
  }
}

export async function POST(request) {
  try {
    const {
      customer_name,
      customer_phone,
      customer_address,
      items,
      total_amount,
    } = await request.json();

    if (
      !customer_name ||
      !customer_phone ||
      !customer_address ||
      !items ||
      !total_amount
    ) {
      return NextResponse.json(
        { error: "Missing required order fields" },
        { status: 400 },
      );
    }

    const { data, error } = await getDatabase()
      .from("orders")
      .insert({
        customer_name,
        customer_phone,
        customer_address,
        items,
        total_amount,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("API POST Order Error:", error);
    return NextResponse.json(
      { error: "Không thể lưu đơn hàng vào Supabase." },
      { status: 503 },
    );
  }
}

export async function PUT(request) {
  try {
    const { order_id, status } = await request.json();

    if (!order_id || !status) {
      return NextResponse.json(
        { error: "order_id and status are required" },
        { status: 400 },
      );
    }

    const { data, error } = await getDatabase()
      .from("orders")
      .update({ status })
      .eq("order_id", order_id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("API PUT Order Error:", error);
    return NextResponse.json(
      { error: "Không thể cập nhật đơn hàng trên Supabase." },
      { status: 503 },
    );
  }
}
