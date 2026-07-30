# Marty — AI Sales Advisor

Marty là chatbot AI tư vấn bán hàng FMCG bằng tiếng Việt, được xây cho một bài thi sản phẩm. Ứng dụng hiểu nhu cầu và ngân sách, tìm tối đa ba sản phẩm từ catalog, giải thích lý do, so sánh, trả lời FAQ, thu lead và lưu hội thoại.

## Công nghệ

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS v4 và shadcn/ui
- Supabase PostgreSQL, Auth, Storage, RLS và pgvector
- OpenAI `gpt-4.1-mini` (Structured Outputs) và `text-embedding-3-small`
- Zod cho validation; Node test runner cho unit tests

## Chạy local

```powershell
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

Mở:

- Chatbot: `http://localhost:3000`
- Dashboard: `http://localhost:3000/admin`

Nếu chưa cấu hình Supabase/OpenAI, chatbot vẫn dùng catalog fallback và dashboard chạy ở chế độ demo. Không cần khóa API để trình diễn giao diện và các luồng cốt lõi.

## Kết nối Supabase và OpenAI

1. Tạo project Supabase và đồng bộ catalog bằng `npm run products:sync`.
2. Chạy lần lượt các migration phù hợp; với database Shopee hiện tại cần tối thiểu `003` đến `006`.
3. Điền biến môi trường trong `.env.local`.
4. Đặt `SUPABASE_SERVICE_ROLE_KEY` chỉ ở môi trường server.
5. Chạy `npm run embeddings:products` để nạp vector cho catalog. Script hiện dùng đúng schema `item_id/product_name/description`.
6. Với tài khoản admin, đặt `app_metadata.role = "admin"` trong Supabase Auth.

Migration `006_hybrid_product_rag.sql` thêm pgvector, chỉ mục HNSW/trigram và RPC tìm kiếm hybrid. Nếu migration hoặc embedding chưa sẵn sàng, chatbot tự chuyển về ranking từ khóa trong database, không làm gián đoạn tư vấn.

`SUPABASE_SERVICE_ROLE_KEY` chỉ được đặt ở server hoặc Vercel, không đưa vào Client Component hay commit lên git.

## Lệnh kiểm tra

```powershell
npm run test
npm run lint
npm run typecheck
npm run build
```

## API chính

- `POST /api/v2/chat`: điều phối tư vấn, FAQ, so sánh và lead intent.
- `POST /api/tools/search-products`: tìm sản phẩm có hard filter và semantic ranking.
- `POST /api/leads`: validate và tạo lead.
- `GET /api/admin/overview`: dữ liệu dashboard.
- `POST|PATCH|DELETE /api/admin/products`: CRUD sản phẩm.
- `POST /api/admin/products/import`: nhập danh sách đã parse từ CSV.

## Trạng thái

Pipeline tư vấn hiện gồm structured intent/slot extraction, state machine, bộ nhớ hội thoại có cấu trúc, query rewriting, hybrid RAG và grounded response. Bot chỉ gợi ý sau khi đủ nhóm hàng, mục đích sử dụng, ngân sách và sở thích bắt buộc của từng danh mục.

Xem thêm:

- [Kiến trúc MVP](docs/PROJECT_BLUEPRINT.md)
- [Tìm kiếm sản phẩm](docs/MILESTONE_2_PRODUCT_SEARCH.md)
- [Kịch bản trình diễn](docs/DEMO_SCRIPT.md)
- [Triển khai production](docs/DEPLOYMENT.md)
- [Mapping database Google Drive](docs/DRIVE_DATASET_MAPPING.md)
