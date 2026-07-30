"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { LockKeyhole, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const [status, setStatus] = useState("");

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus("Đang đăng nhập…");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (error) throw error;
      window.location.href = "/admin";
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Không thể đăng nhập. Kiểm tra cấu hình Supabase.",
      );
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f3f7f4] p-4">
      <section className="w-full max-w-sm rounded-2xl border bg-white p-7 shadow-sm">
        <Link
          href="/"
          className="mb-7 flex items-center gap-3 text-emerald-800 no-underline"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-emerald-700 text-white">
            <ShoppingBag className="size-5" />
          </span>
          <b>Marty Admin</b>
        </Link>
        <LockKeyhole className="mb-3 size-6 text-emerald-700" />
        <h1 className="text-xl font-bold">Đăng nhập quản trị</h1>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Tài khoản cần có <code>app_metadata.role = admin</code>.
        </p>
        <form className="mt-6 grid gap-4" onSubmit={login}>
          <label className="grid gap-1.5 text-xs font-semibold">
            Email
            <Input name="email" type="email" required />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold">
            Mật khẩu
            <Input name="password" type="password" required />
          </label>
          {status && <p className="m-0 text-xs text-emerald-800">{status}</p>}
          <Button className="bg-emerald-700 hover:bg-emerald-800">
            Đăng nhập
          </Button>
        </form>
      </section>
    </main>
  );
}
