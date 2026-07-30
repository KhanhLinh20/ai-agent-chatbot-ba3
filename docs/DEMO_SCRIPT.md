# Kịch bản demo Marty

## Chuẩn bị 2 phút trước khi trình bày

1. Mở `/` và `/admin` ở hai tab.
2. Kiểm tra thanh trạng thái dashboard: `Supabase` nếu dùng DB thật, `demo` nếu dùng catalog dự phòng.
3. Nhấn “Làm mới chat”.
4. Nếu demo semantic search, xác nhận embedding đã được tạo bằng `npm run embeddings:products`.

## Luồng trình diễn 5 tình huống

### 1. Nhu cầu cụ thể và có ngân sách

Nhập: `Milo cho bé dưới 100 nghìn`

Kỳ vọng: Marty nhận ra nhóm đồ uống và ngân sách, trả tối đa 3 thẻ sản phẩm còn hàng, kèm lý do và cảnh báo kiểm tra thành phần khi dùng cho trẻ.

### 2. Nhu cầu mơ hồ

Nhập: `Tư vấn`

Kỳ vọng: Marty không đoán bừa; chỉ hỏi nhóm sản phẩm và ngân sách.

### 3. So sánh

Nhập: `So sánh cà phê Nescafé`

Kỳ vọng: Có tối đa 3 sản phẩm và nút so sánh. Mở bảng so sánh giá, tình trạng và mức phù hợp.

### 4. FAQ có kiểm soát

Nhập: `Chính sách giao hàng 2H thế nào?`

Kỳ vọng: Marty trả lời chính sách đã cấu hình, không gọi tìm kiếm sản phẩm và không bịa ưu đãi.

### 5. Chuyển đổi thành lead

Nhập: `Tôi cần báo giá số lượng lớn, hãy liên hệ lại`

Kỳ vọng: Biểu mẫu họ tên, điện thoại và nhu cầu xuất hiện. Khi Supabase đã kết nối, lead được lưu và xuất hiện ở tab Khách hàng tiềm năng.

## Điểm nhấn khi thuyết trình

- AI không truy cập DB trực tiếp; orchestration chỉ cho phép dữ liệu đã được tool/repository xác minh.
- Ranking kết hợp ngữ nghĩa, ngân sách, tồn kho và sản phẩm nổi bật.
- Mất OpenAI vẫn có deterministic fallback để demo không bị gián đoạn.
- Giao diện khách hàng và vận hành dùng chung một nguồn dữ liệu.
