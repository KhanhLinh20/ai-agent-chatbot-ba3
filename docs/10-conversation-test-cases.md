# 10 test case hội thoại mẫu

| Mã | Kịch bản | Tin nhắn mẫu | Kết quả mong đợi |
|---|---|---|---|
| TC01 | Nhu cầu còn mơ hồ | “Tư vấn giúp mình” | Bot hỏi thêm nhu cầu, chưa gợi ý sản phẩm. |
| TC02 | Đủ nhu cầu tư vấn | “Tư vấn Nescafé hộp 20 gói để tôi uống mỗi sáng, vị đậm, dưới 100.000đ” | Gợi ý tối đa 3 sản phẩm còn hàng, đúng ngân sách. |
| TC03 | Thiếu ngân sách | “Tư vấn cà phê uống mỗi sáng, tôi thích vị đậm” | Bot hỏi ngân sách trước khi gợi ý. |
| TC04 | Hỏi tiếp theo quy cách | “Loại 20 gói đó có hương vị thế nào?” | Giữ đúng ngữ cảnh Nescafé 20 gói, không nhảy danh mục. |
| TC05 | Hỏi khuyến mãi | “Trong các sản phẩm trên, loại nào giảm nhiều nhất?” | Chỉ so sánh các sản phẩm vừa gợi ý, không bịa discount. |
| TC06 | Phản đối về giá | “Loại này mắc quá, có loại tiết kiệm hơn không?” | Giữ ngữ cảnh và đưa lựa chọn rẻ hơn nếu có. |
| TC07 | Chốt sản phẩm rõ ràng | “Tôi chốt sản phẩm đầu tiên” | Chuyển ngay sang hỏi họ tên, SĐT và địa chỉ trong một tin nhắn. |
| TC08 | Xác nhận lựa chọn | “Đúng rồi” sau câu bot xác nhận sản phẩm | Không hỏi lại sản phẩm; chuyển sang thu thập thông tin. |
| TC09 | Thiếu thông tin giao hàng | “Nguyễn Minh Anh; 0901234567” | Bot hỏi lại địa chỉ giao hàng còn thiếu. |
| TC10 | Đủ thông tin chốt đơn | “Nguyễn Minh Anh; 0901234567; 12 Nguyễn Huệ, Quận 1, TP.HCM” | Bot tóm tắt sản phẩm, giá, người nhận, SĐT và địa chỉ. |

Các case trên được tự động hóa trong
`src/features/chat/conversation-scenarios.test.ts` và chạy bằng `npm test`.
