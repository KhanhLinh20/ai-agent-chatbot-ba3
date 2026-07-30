# Milestone 2 — Product Search

## API

`POST /api/tools/search-products`

### Input

```json
{
  "query": "Milo cho bé ăn sáng dưới 100 nghìn",
  "category": "do-uong",
  "budgetMin": 0,
  "budgetMax": 100000,
  "inStockOnly": true,
  "limit": 3
}
```

`query` là bắt buộc. `limit` luôn nằm trong 1–3. Zod từ chối ngân sách âm, `budgetMin > budgetMax`, query quá ngắn và JSON không hợp lệ.

### Output

```json
{
  "products": [
    {
      "id": "16081861365",
      "name": "Thức uống lúa mạch Nestlé Milo nguyên chất 400g",
      "category": "do-uong",
      "brand": "MILO",
      "price": 85500,
      "stockQuantity": null,
      "inStock": true,
      "similarity": 0.5,
      "finalScore": 0.671,
      "reason": "Tên, thương hiệu hoặc mục đích sử dụng khớp nhu cầu. Đang còn hàng. Nằm trong ngân sách đã chọn.",
      "consideration": null
    }
  ],
  "retrievalMode": "fallback",
  "appliedFilters": {
    "category": "do-uong",
    "budgetMin": 0,
    "budgetMax": 100000,
    "inStockOnly": true
  }
}
```

`stockQuantity: null` có nghĩa catalog nguồn chỉ xác nhận còn/hết hàng, không có số lượng chính xác. API không tự bịa số tồn kho.

## Hai chế độ retrieval

### Semantic

Khi có `OPENAI_API_KEY`, API tạo vector 1536 chiều bằng `text-embedding-3-small`, sau đó gọi `match_products`. Category, ngân sách và tồn kho được truyền vào RPC để hard filter xảy ra trước khi limit.

### Fallback

Nếu API key, migration, RPC hoặc embedding chưa sẵn sàng, hệ thống dùng catalog FMCG cục bộ. Ranking vẫn áp dụng hard filters và công thức 60/20/10/10, nhưng `similarity` là keyword overlap có thể giải thích được. Response luôn cho biết `retrievalMode`.

## Tạo embedding cho catalog

Sau khi chạy migration và seed:

```bash
npm run embeddings:products
```

Script cần:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Service role chỉ được dùng trong script/server. Script lấy từng batch 50 sản phẩm chưa có embedding, tạo vector và cập nhật Supabase.

## Kiểm tra

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```
