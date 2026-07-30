# Triển khai Marty

## Supabase

1. Tạo project gần khu vực người dùng.
2. Chạy migration và seed trong SQL Editor.
3. Tạo người dùng admin, đặt `app_metadata.role = "admin"`.
4. Tạo bucket `product-images` nếu muốn tải ảnh nội bộ.
5. Chạy backfill embedding từ máy tin cậy: `npm run embeddings:products`.
6. Kiểm tra RLS bằng cả phiên anon và admin.

## Vercel

1. Import repository vào Vercel.
2. Đặt các biến trong `.env.local.example` cho Production và Preview.
3. Không expose `SUPABASE_SERVICE_ROLE_KEY` qua biến bắt đầu bằng `NEXT_PUBLIC_`.
4. Build command: `npm run build`.
5. Sau deploy, kiểm tra `/`, `/admin`, `/api/admin/overview` và năm kịch bản demo.

## Checklist production

- Bật xác thực admin trước khi cho phép CRUD thực tế.
- Thêm rate limit cho `/api/v2/chat` và `/api/leads`.
- Thêm CAPTCHA hoặc honeypot cho form lead công khai.
- Dùng parser CSV chuẩn ở server nếu nhập dữ liệu có dấu phẩy trong nội dung.
- Không log nội dung nhạy cảm hoặc khóa API.
- Thiết lập cảnh báo lỗi, theo dõi latency và chi phí OpenAI.
- Thêm consent/privacy copy phù hợp quy định áp dụng.
- Chạy `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`.

## Biến môi trường

| Biến | Nơi dùng | Bắt buộc |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client/server Supabase | Khi dùng DB thật |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client/server Supabase | Khi dùng DB thật |
| `SUPABASE_SERVICE_ROLE_KEY` | Tác vụ server đặc quyền | Production admin/import |
| `OPENAI_API_KEY` | Embedding và viết lại câu trả lời | Không bắt buộc cho demo fallback |
| `OPENAI_CHAT_MODEL` | Model chat | Mặc định `chat-latest` |
| `OPENAI_EMBEDDING_MODEL` | Model embedding | Mặc định `text-embedding-3-small` |
