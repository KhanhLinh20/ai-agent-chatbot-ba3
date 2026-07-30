import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marty — Trợ lý AI tư vấn bán hàng",
  description:
    "Chatbot tư vấn sản phẩm FMCG, so sánh lựa chọn và hỗ trợ chốt đơn.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
