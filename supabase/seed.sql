insert into public.products
  (name, slug, category, brand, short_description, description, price, original_price, stock_quantity, image_url, specifications, use_cases, is_featured)
values
  ('MILO bột lúa mạch 400g', 'milo-bot-400g', 'do-uong', 'MILO', 'Thức uống lúa mạch cho gia đình.', 'Bột lúa mạch pha uống dùng cho bữa sáng hoặc bữa phụ.', 82000, 90000, 42, null, '{"weight":"400g"}', array['bua-sang','tre-em'], true),
  ('MILO lốc 4 hộp 180ml', 'milo-loc-4-180ml', 'do-uong', 'MILO', 'Sữa lúa mạch tiện mang theo.', 'Lốc bốn hộp phù hợp cho trẻ đi học.', 33000, null, 68, null, '{"volume":"4 x 180ml"}', array['bua-sang','di-hoc'], true),
  ('NESCAFÉ 3in1 Đậm Đà 20 gói', 'nescafe-3in1-20-goi', 'ca-phe', 'Nescafé', 'Cà phê hòa tan vị đậm.', 'Hộp cà phê hòa tan tiện dùng tại nhà hoặc văn phòng.', 68000, 75000, 51, null, '{"pack":"20 gói"}', array['van-phong','bua-sang'], true),
  ('NESCAFÉ Café Việt 15 gói', 'nescafe-cafe-viet-15', 'ca-phe', 'Nescafé', 'Cà phê hòa tan phong cách Việt.', 'Vị cà phê mạnh, phù hợp người thích đậm vị.', 59000, null, 24, null, '{"pack":"15 gói"}', array['van-phong'], false),
  ('MAGGI nước tương đậu nành 700ml', 'maggi-nuoc-tuong-700ml', 'gia-vi', 'Maggi', 'Nước tương đậu nành đậm vị.', 'Gia vị dùng chấm, ướp và nấu món Việt.', 32000, 36000, 73, null, '{"volume":"700ml"}', array['nau-an','bep-viet'], true),
  ('MAGGI dầu hào 820g', 'maggi-dau-hao-820g', 'gia-vi', 'Maggi', 'Dầu hào dùng xào và ướp.', 'Tạo màu và vị đậm đà cho các món xào.', 42000, null, 38, null, '{"weight":"820g"}', array['nau-an','mon-xao'], false),
  ('MAGGI hạt nêm nấm hương 450g', 'maggi-hat-nem-nam-450g', 'gia-vi', 'Maggi', 'Hạt nêm vị nấm hương.', 'Phù hợp nêm canh, xào và các món chay.', 39000, 43000, 31, null, '{"weight":"450g"}', array['nau-an','mon-chay'], false),
  ('Bibica Goody bánh quy bơ 450g', 'bibica-goody-bo-450g', 'banh-keo', 'Bibica', 'Bánh quy bơ dùng cho cả gia đình.', 'Bánh giòn, đóng hộp phù hợp dùng tại nhà hoặc làm quà.', 108000, 120000, 26, null, '{"weight":"450g"}', array['an-vat','gia-dinh'], true),
  ('Bibica Quasure Light 210g', 'bibica-quasure-light-210g', 'banh-keo', 'Bibica', 'Bánh quy giảm đường.', 'Lựa chọn ăn nhẹ có kiểm soát khẩu phần.', 54000, 63000, 19, null, '{"weight":"210g"}', array['an-kieng','an-vat'], false),
  ('Bibica bánh bông lan Hura 300g', 'bibica-hura-300g', 'banh-keo', 'Bibica', 'Bánh bông lan mềm cho bữa phụ.', 'Đóng gói riêng tiện mang theo.', 47000, null, 47, null, '{"weight":"300g"}', array['bua-phu','di-hoc'], false),
  ('Nestea trà chanh 16 gói', 'nestea-tra-chanh-16-goi', 'do-uong', 'Nestea', 'Trà chanh hòa tan.', 'Pha nhanh, dùng lạnh cho gia đình.', 45000, 49000, 34, null, '{"pack":"16 gói"}', array['giai-khat'], false),
  ('KitKat socola 12 thanh', 'kitkat-12-thanh', 'banh-keo', 'KitKat', 'Socola wafer đóng gói tiện lợi.', 'Phù hợp ăn nhẹ và chia sẻ.', 62000, 69000, 29, null, '{"pack":"12 thanh"}', array['an-vat','chia-se'], true),
  ('Alpenliebe kẹo sữa 120g', 'alpenliebe-keo-sua-120g', 'banh-keo', 'Alpenliebe', 'Kẹo cứng vị sữa.', 'Gói nhỏ phù hợp gia đình và văn phòng.', 26000, null, 55, null, '{"weight":"120g"}', array['an-vat'], false),
  ('ChocoPie Orion hộp 12 bánh', 'chocopie-orion-12', 'banh-keo', 'Orion', 'Bánh ChocoPie hộp 12 chiếc.', 'Bánh phủ socola cho bữa phụ.', 72000, 79000, 44, null, '{"pack":"12 bánh"}', array['bua-phu','gia-dinh'], true),
  ('Richy bánh gạo 300g', 'richy-banh-gao-300g', 'banh-keo', 'Richy', 'Bánh gạo giòn nhẹ.', 'Phù hợp ăn nhẹ tại nhà hoặc văn phòng.', 58000, null, 23, null, '{"weight":"300g"}', array['an-vat','van-phong'], false),
  ('MILO thùng 12 hộp 180ml', 'milo-thung-12-180ml', 'do-uong', 'MILO', 'Thùng sữa lúa mạch dùng cho gia đình.', 'Quy cách thùng tiết kiệm cho nhu cầu thường xuyên.', 165000, 180000, 18, null, '{"volume":"12 x 180ml"}', array['gia-dinh','tre-em'], true),
  ('NESCAFÉ Gold Blend 100g', 'nescafe-gold-100g', 'ca-phe', 'Nescafé', 'Cà phê hòa tan nguyên chất.', 'Hũ cà phê cho người thích tự điều chỉnh độ đậm.', 145000, 159000, 12, null, '{"weight":"100g"}', array['van-phong','cao-cap'], false),
  ('MAGGI nước mắm 500ml', 'maggi-nuoc-mam-500ml', 'gia-vi', 'Maggi', 'Nước mắm dùng nêm và chấm.', 'Gia vị cơ bản cho bếp Việt.', 37000, null, 40, null, '{"volume":"500ml"}', array['nau-an','bep-viet'], false),
  ('Bibica kẹo trái cây 140g', 'bibica-keo-trai-cay-140g', 'banh-keo', 'Bibica', 'Kẹo nhiều vị trái cây.', 'Gói kẹo chia sẻ cho gia đình.', 29000, 33000, 61, null, '{"weight":"140g"}', array['chia-se','an-vat'], false),
  ('Combo bữa sáng gia đình', 'combo-bua-sang-gia-dinh', 'combo', 'SmartMart', 'MILO, Nescafé và bánh ăn sáng.', 'Combo được tạo cho kịch bản demo tư vấn bữa sáng gia đình.', 245000, 285000, 15, null, '{"items":3}', array['bua-sang','gia-dinh'], true)
on conflict (slug) do nothing;

insert into public.faq_documents (title, content, document_type)
values
  ('Giao hàng 2H', 'Đơn trong khu vực hỗ trợ được giao dự kiến trong 2 giờ sau khi xác nhận.', 'shipping'),
  ('Miễn phí vận chuyển', 'Đơn hàng từ 300.000đ được miễn phí giao hàng 2H tại khu vực hỗ trợ.', 'shipping'),
  ('Đổi trả hàng lỗi', 'Khách hàng có thể yêu cầu đổi sản phẩm lỗi hoặc sai sản phẩm trong vòng 48 giờ từ khi nhận hàng.', 'returns'),
  ('Sản phẩm hết hàng', 'Sản phẩm có stock_quantity bằng 0 không được chatbot đề xuất.', 'general'),
  ('Thanh toán', 'MVP hỗ trợ ghi nhận đơn và thông tin liên hệ; thanh toán trực tuyến chưa nằm trong phạm vi.', 'payment');
