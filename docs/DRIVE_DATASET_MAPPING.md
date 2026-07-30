# Mapping database Google Drive

Nguồn dữ liệu:

`https://drive.google.com/drive/folders/1wgZ4c_3aF7CEdKH7ZmjxSXYH1WBDc7Ro`

Snapshot local đang dùng: `2026-07-03`.

## Tổng quan

- 10 shop.
- 668 dòng sản phẩm trong `src/lib/shopee_fallback.json`.
- 22 dòng có dấu hiệu quà tặng, mẫu thử hoặc “không bán”; repository loại các dòng này khỏi kết quả tư vấn.
- Ngành hàng chính: đồ uống/sữa, cà phê–trà, gia vị và bánh kẹo.
- Không phải catalog skincare.

## Các dataset

| Dataset Drive | Mục đích |
| --- | --- |
| `dataset=products` | Giá, tên, ảnh, tình trạng bán, rating, doanh số, voucher và thương hiệu |
| `dataset=product_categories` | Quan hệ sản phẩm với danh mục của shop |
| `dataset=shop_info` | Thông tin và độ uy tín của shop |
| `dataset=category_list` | Cây danh mục cha–con theo shop |
| `dataset=category_platform` | Danh mục chuẩn hóa của nền tảng |

## Mapping vào bảng `products`

| CSV nguồn | Supabase / domain |
| --- | --- |
| `item_id` | Khóa nguồn; lưu trong `specifications.source_item_id` |
| `product_name` | `name` |
| `brand` | `brand` |
| `price` | `price` |
| `price_original` | `original_price` |
| `image_url` | `image_url` |
| `is_sold_out` | Suy ra `stock_quantity`/`inStock` |
| `rating`, `rating_count` | `specifications` |
| `monthly_sold_value`, `history_sold_value` | `specifications` và tín hiệu featured |
| `shop_id`, `shop_name`, `url` | `specifications` |
| `catid`, `global_catids` | Suy ra `category` |
| `date` | Ngày snapshot nguồn |

## Quy tắc làm sạch

1. Chỉ giữ bản ghi của ngày snapshot mới nhất cho từng `shop_id + item_id`.
2. Loại tên chứa “quà tặng”, “không bán” hoặc “mẫu thử”.
3. Chuẩn hóa boolean dạng chuỗi như `True`/`False`.
4. Chuyển giá và doanh số sang số trước khi ranking.
5. Chuẩn hóa category thành `do-uong`, `ca-phe`, `gia-vi`, `banh-keo`.
6. Không đưa voucher hết hạn vào nội dung tư vấn.
7. Tạo lại embedding khi tên, mô tả, thương hiệu hoặc category thay đổi.
