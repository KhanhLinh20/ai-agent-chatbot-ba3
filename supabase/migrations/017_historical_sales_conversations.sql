begin;

create temporary table historical_chat_seed (
  session_id uuid primary key,
  occurred_at timestamptz not null,
  outcome text not null check (outcome in ('order', 'lead', 'browse')),
  customer_name text,
  customer_phone text,
  customer_address text,
  need text not null,
  detail text not null,
  product_id text not null,
  quantity integer not null default 1
) on commit drop;

insert into historical_chat_seed (
  session_id,
  occurred_at,
  outcome,
  customer_name,
  customer_phone,
  customer_address,
  need,
  detail,
  product_id,
  quantity
)
values
  ('a7000000-0000-4000-8000-000000000001', '2026-07-29 09:12:00+07', 'order', 'Lê Thị Mai', '0938452716', '18 Nguyễn Văn Trỗi, Phường 8, Phú Nhuận, TP.HCM', 'cà phê đậm để uống mỗi sáng', 'ngân sách dưới 100.000đ, thích vị nguyên bản', '1759126901', 2),
  ('a7000000-0000-4000-8000-000000000002', '2026-07-28 14:25:00+07', 'order', 'Hoàng Minh Tuấn', '0972635418', '72 Lê Duẩn, Hải Châu, Đà Nẵng', 'sữa lúa mạch ít đường cho cả gia đình', 'ưu tiên thùng hộp nhỏ, dễ bảo quản', '2260506115', 1),
  ('a7000000-0000-4000-8000-000000000003', '2026-07-27 20:08:00+07', 'order', 'Võ Ngọc Lan', '0917562843', '31 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội', 'bánh ăn sáng tiện mang đi làm', 'muốn loại mềm, không quá ngọt', '22243784219', 3),
  ('a7000000-0000-4000-8000-000000000004', '2026-07-26 10:40:00+07', 'order', 'Bùi Quốc Huy', '0984176352', '96 Phan Đình Phùng, Ba Đình, Hà Nội', 'cà phê đen hòa tan tiện pha ở văn phòng', 'cần túi nhiều gói để dùng trong tháng', '28079281911', 1),
  ('a7000000-0000-4000-8000-000000000005', '2026-07-25 16:18:00+07', 'order', 'Nguyễn Thanh Trúc', '0905847261', '45 Võ Thị Sáu, Quận 3, TP.HCM', 'bánh quy dành cho người ăn kiêng', 'ưu tiên vị nhẹ, dùng cùng trà chiều', '19079649512', 2),
  ('a7000000-0000-4000-8000-000000000006', '2026-07-24 08:35:00+07', 'order', 'Phan Gia Bảo', '0963728154', '11 Nguyễn Trãi, Ninh Kiều, Cần Thơ', 'thức uống lúa mạch dùng buổi sáng', 'muốn mua dạng hũ để pha tại nhà', '17483738735', 1),
  ('a7000000-0000-4000-8000-000000000007', '2026-07-15 19:22:00+07', 'order', 'Trần Mỹ Linh', '0945183276', '83 Điện Biên Phủ, Bình Thạnh, TP.HCM', 'cà phê sữa vị đậm nhưng không quá ngọt', 'cần hộp 20 gói, ngân sách khoảng 100.000đ', '3075288173', 2),
  ('a7000000-0000-4000-8000-000000000008', '2026-07-08 11:05:00+07', 'order', 'Đỗ Anh Khoa', '0927614385', '26 Hai Bà Trưng, Thành phố Huế', 'bánh quy để dùng trong giờ nghỉ tại công ty', 'ưu tiên combo tiết kiệm cho nhiều người', '24553391588', 1),
  ('a7000000-0000-4000-8000-000000000009', '2026-06-24 15:48:00+07', 'order', 'Hồ Thu Trang', '0886352147', '57 Quang Trung, Hải Châu, Đà Nẵng', 'kẹo dẻo trái cây cho buổi liên hoan', 'cần nhiều vị để chia cho trẻ nhỏ', '54661236695', 2),
  ('a7000000-0000-4000-8000-000000000010', '2026-06-10 09:30:00+07', 'order', 'Lý Minh Quân', '0834726519', '102 Cách Mạng Tháng Tám, Quận 10, TP.HCM', 'cà phê hòa tan dùng hàng ngày', 'thích vị hài hòa, dễ uống', '1759126901', 3),
  ('a7000000-0000-4000-8000-000000000011', '2026-05-24 17:15:00+07', 'order', 'Dương Bảo Ngọc', '0895267314', '39 Nguyễn Du, Hai Bà Trưng, Hà Nội', 'bánh ăn sáng dự trữ cho gia đình', 'muốn sản phẩm đóng gói riêng tiện mang theo', '49212426528', 1),
  ('a7000000-0000-4000-8000-000000000012', '2026-05-08 13:42:00+07', 'order', 'Mai Đức Long', '0873614259', '64 Hùng Vương, Nha Trang, Khánh Hòa', 'sữa lúa mạch cho con mang đi học', 'ưu tiên ít đường và đóng thùng', '2260506115', 1),

  ('a7000000-0000-4000-8000-000000000013', '2026-07-23 09:45:00+07', 'lead', 'Cao Thùy Dương', '0936172845', '21 Nguyễn Gia Thiều, Quận 3, TP.HCM', 'tìm quà bánh cho đồng nghiệp', 'cần shop tư vấn combo khoảng 300.000đ', '24553391588', 1),
  ('a7000000-0000-4000-8000-000000000014', '2026-07-20 18:32:00+07', 'lead', 'Trịnh Khánh An', '0968254137', '88 Láng Hạ, Đống Đa, Hà Nội', 'cà phê cho phòng họp khoảng 15 người', 'cần báo giá khi mua số lượng lớn', '28079281911', 4),
  ('a7000000-0000-4000-8000-000000000015', '2026-07-12 08:50:00+07', 'lead', 'Nguyễn Phương Thảo', '0914387265', '16 Bạch Đằng, Bình Thạnh, TP.HCM', 'bánh ít đường cho bố mẹ', 'muốn nhân viên tư vấn kỹ thành phần', '19079649512', 1),
  ('a7000000-0000-4000-8000-000000000016', '2026-07-03 21:10:00+07', 'lead', 'Lê Hoàng Nam', '0985362147', '47 Trần Phú, Thành phố Vinh, Nghệ An', 'thức uống lúa mạch cho người tập thể thao', 'đang cân nhắc dạng hộp và dạng hũ', '17483738735', 1),
  ('a7000000-0000-4000-8000-000000000017', '2026-06-28 10:20:00+07', 'lead', 'Vũ Hồng Nhung', '0942637185', '29 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội', 'kẹo trái cây dùng làm quà sinh nhật', 'cần giao vào cuối tuần', '49607284576', 2),
  ('a7000000-0000-4000-8000-000000000018', '2026-06-18 14:05:00+07', 'lead', 'Trần Quốc Bảo', '0907364258', '54 Nguyễn Thị Minh Khai, Quận 1, TP.HCM', 'cà phê đậm cho nhóm làm ca đêm', 'muốn được tư vấn loại tiết kiệm nhất', '3075288173', 3),
  ('a7000000-0000-4000-8000-000000000019', '2026-06-05 11:28:00+07', 'lead', 'Phạm Minh Châu', '0924836175', '77 Tôn Đức Thắng, Đống Đa, Hà Nội', 'bánh mềm dùng cho bữa sáng', 'cần shop gọi lại sau giờ làm', '56761249618', 1),
  ('a7000000-0000-4000-8000-000000000020', '2026-05-29 16:55:00+07', 'lead', 'Đặng Gia Hân', '0887142635', '33 Hoàng Diệu, Hải Châu, Đà Nẵng', 'bánh quy ăn kiêng dùng tại văn phòng', 'đang hỏi thêm về hạn sử dụng', '19079649512', 2),
  ('a7000000-0000-4000-8000-000000000021', '2026-05-17 09:18:00+07', 'lead', 'Hồ Đức Anh', '0836254719', '91 Nguyễn Văn Cừ, Long Biên, Hà Nội', 'mua cà phê làm quà cho khách hàng', 'cần tư vấn bao bì và số lượng phù hợp', '28079281911', 2),
  ('a7000000-0000-4000-8000-000000000022', '2026-05-04 20:36:00+07', 'lead', 'Nguyễn Quỳnh Chi', '0974158263', '12 Phạm Văn Đồng, Thủ Đức, TP.HCM', 'sữa lúa mạch ít đường cho gia đình', 'muốn kiểm tra phí giao hàng trước', '2260506115', 1),

  ('a7000000-0000-4000-8000-000000000023', '2026-07-22 12:15:00+07', 'browse', null, null, null, 'tìm đồ ăn nhẹ dưới 100.000đ', 'ưu tiên bánh không quá ngọt', '19079649512', 1),
  ('a7000000-0000-4000-8000-000000000024', '2026-07-18 07:42:00+07', 'browse', null, null, null, 'so sánh cà phê đen và cà phê sữa', 'dùng mỗi sáng trước khi đi làm', '28079281911', 1),
  ('a7000000-0000-4000-8000-000000000025', '2026-07-10 19:05:00+07', 'browse', null, null, null, 'tìm kẹo dẻo nhiều vị', 'mua cho buổi dã ngoại của trẻ nhỏ', '54661236695', 1),
  ('a7000000-0000-4000-8000-000000000026', '2026-07-01 13:27:00+07', 'browse', null, null, null, 'hỏi loại sữa lúa mạch ít đường', 'muốn biết quy cách đóng thùng', '2260506115', 1),
  ('a7000000-0000-4000-8000-000000000027', '2026-06-26 08:18:00+07', 'browse', null, null, null, 'tìm cà phê hòa tan vị hài hòa', 'ngân sách khoảng 80.000đ', '1759126901', 1),
  ('a7000000-0000-4000-8000-000000000028', '2026-06-20 16:40:00+07', 'browse', null, null, null, 'xem bánh ăn sáng tiện mang theo', 'chưa xác định ngân sách', '49212426528', 1),
  ('a7000000-0000-4000-8000-000000000029', '2026-06-13 10:12:00+07', 'browse', null, null, null, 'tìm thức uống cho cả nhà', 'ưu tiên sản phẩm dễ pha', '17483738735', 1),
  ('a7000000-0000-4000-8000-000000000030', '2026-06-02 21:24:00+07', 'browse', null, null, null, 'hỏi giá cà phê rang đậm', 'đang cân nhắc hộp 20 gói', '3075288173', 1),
  ('a7000000-0000-4000-8000-000000000031', '2026-05-26 15:33:00+07', 'browse', null, null, null, 'tìm bánh quy cho người lớn tuổi', 'muốn vị nhẹ và ít ngọt', '19079649512', 1),
  ('a7000000-0000-4000-8000-000000000032', '2026-05-20 11:46:00+07', 'browse', null, null, null, 'xem combo bánh cho phòng làm việc', 'khoảng 10 người dùng', '24553391588', 1),
  ('a7000000-0000-4000-8000-000000000033', '2026-05-14 18:05:00+07', 'browse', null, null, null, 'tìm kẹo trái cây mềm dẻo', 'ưu tiên nhiều hương vị', '49607284576', 1),
  ('a7000000-0000-4000-8000-000000000034', '2026-05-10 08:22:00+07', 'browse', null, null, null, 'hỏi cà phê nào tiện mang đi du lịch', 'muốn gói nhỏ dễ pha', '28079281911', 1),
  ('a7000000-0000-4000-8000-000000000035', '2026-05-06 14:38:00+07', 'browse', null, null, null, 'tìm đồ uống cho học sinh', 'ưu tiên ít đường', '2260506115', 1),
  ('a7000000-0000-4000-8000-000000000036', '2026-05-02 19:52:00+07', 'browse', null, null, null, 'xem bánh mềm cho bữa sáng', 'muốn tham khảo vài lựa chọn trước', '56761249618', 1);

insert into public.conversations (
  session_id,
  customer_name,
  customer_phone,
  status,
  summary,
  created_at,
  updated_at
)
select
  session_id,
  customer_name,
  customer_phone,
  case
    when outcome = 'order' then 'closed'
    when outcome = 'lead' then 'qualified'
    else 'active'
  end,
  case
    when outcome = 'order' then 'Khách đã xác nhận sản phẩm và hoàn tất thông tin chốt đơn.'
    when outcome = 'lead' then 'Khách đã để lại thông tin để người bán tiếp tục tư vấn.'
    else 'Khách đã xem tư vấn sản phẩm nhưng chưa để lại thông tin liên hệ.'
  end,
  occurred_at,
  occurred_at + interval '9 minutes'
from historical_chat_seed
on conflict (session_id) do update
set
  customer_name = excluded.customer_name,
  customer_phone = excluded.customer_phone,
  status = excluded.status,
  summary = excluded.summary,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

delete from public.messages m
using public.conversations c, historical_chat_seed s
where m.conversation_id = c.id
  and c.session_id = s.session_id;

insert into public.messages (
  conversation_id,
  role,
  content,
  metadata,
  created_at
)
select
  c.id,
  message.role,
  message.content,
  message.metadata,
  s.occurred_at + message.offset_time
from historical_chat_seed s
join public.conversations c on c.session_id = s.session_id
join public.products p on p.item_id = s.product_id
cross join lateral (
  values
    (
      interval '0 minutes',
      'user'::text,
      'Mình cần tư vấn ' || s.need || '.',
      '{}'::jsonb
    ),
    (
      interval '2 minutes',
      'assistant'::text,
      'Mình hiểu nhu cầu của bạn. Bạn cho Marty biết thêm ngân sách, mục đích sử dụng hoặc khẩu vị ưu tiên nhé.',
      jsonb_build_object(
        'intent', 'discover',
        'sales_intent', 'product_discovery',
        'conversation_state', 'DISCOVERING'
      )
    ),
    (
      interval '5 minutes',
      'user'::text,
      case
        when s.outcome = 'order' then
          'Mình thấy “' || p.product_name || '” phù hợp. Mình chốt ' ||
          s.quantity || ' sản phẩm. Người nhận ' || s.customer_name ||
          '; ' || s.customer_phone || '; giao đến ' || s.customer_address || '.'
        when s.outcome = 'lead' then
          'Mình ' || s.detail || '. Shop liên hệ ' || s.customer_name ||
          ' qua số ' || s.customer_phone || ', địa chỉ ' || s.customer_address || ' nhé.'
        else
          'Mình ' || s.detail || '. Cho mình xem thông tin của “' ||
          p.product_name || '” trước nhé.'
      end,
      jsonb_build_object('product_ids', jsonb_build_array(s.product_id))
    ),
    (
      interval '9 minutes',
      'assistant'::text,
      case
        when s.outcome = 'order' then
          'Marty đã nhận đủ thông tin. Đơn gồm “' || p.product_name || '” × ' ||
          s.quantity || ', tạm tính ' ||
          to_char(p.price * s.quantity, 'FM999G999G999') ||
          'đ. Thông tin đã được chuyển cho người bán xác nhận.'
        when s.outcome = 'lead' then
          'Marty đã lưu thông tin. Người bán sẽ liên hệ để tư vấn tiếp về “' ||
          p.product_name || '” và xác nhận các chi tiết phù hợp.'
        else
          '“' || p.product_name || '” có giá ' ||
          to_char(p.price, 'FM999G999G999') ||
          'đ và hiện còn hàng. Khi bạn muốn chốt, Marty sẽ giúp xác nhận sản phẩm và thu thập thông tin giao hàng.'
      end,
      jsonb_build_object(
        'intent', case when s.outcome = 'browse' then 'recommend' else 'lead' end,
        'sales_intent', case when s.outcome = 'order' then 'purchase_intent' else 'recommendation' end,
        'conversation_state', case when s.outcome = 'browse' then 'RECOMMENDING' else 'CLOSING' end,
        'product_ids', jsonb_build_array(s.product_id)
      )
    )
) as message(offset_time, role, content, metadata);

delete from public.leads l
using public.conversations c, historical_chat_seed s
where l.conversation_id = c.id
  and c.session_id = s.session_id;

insert into public.leads (
  conversation_id,
  customer_name,
  customer_phone,
  customer_address,
  interested_product_ids,
  customer_need,
  status,
  created_at,
  updated_at
)
select
  c.id,
  s.customer_name,
  s.customer_phone,
  s.customer_address,
  array[s.product_id::bigint],
  s.need || '. ' || s.detail,
  case when s.outcome = 'order' then 'closed' else 'qualified' end,
  s.occurred_at + interval '6 minutes',
  s.occurred_at + interval '9 minutes'
from historical_chat_seed s
join public.conversations c on c.session_id = s.session_id
where s.outcome in ('order', 'lead');

insert into public.orders (
  conversation_id,
  customer_name,
  customer_phone,
  customer_address,
  items,
  total_amount,
  status,
  created_at,
  updated_at
)
select
  c.id,
  s.customer_name,
  s.customer_phone,
  s.customer_address,
  jsonb_build_array(
    jsonb_build_object(
      'id', p.item_id,
      'name', p.product_name,
      'price', p.price,
      'quantity', s.quantity
    )
  ),
  p.price * s.quantity,
  case
    when s.occurred_at >= '2026-07-24 00:00:00+07'::timestamptz then 'Confirmed'
    else 'Completed'
  end,
  (s.occurred_at + interval '9 minutes')::timestamp,
  s.occurred_at + interval '9 minutes'
from historical_chat_seed s
join public.conversations c on c.session_id = s.session_id
join public.products p on p.item_id = s.product_id
where s.outcome = 'order'
on conflict (conversation_id)
  where conversation_id is not null
do update
set
  customer_name = excluded.customer_name,
  customer_phone = excluded.customer_phone,
  customer_address = excluded.customer_address,
  items = excluded.items,
  total_amount = excluded.total_amount,
  status = excluded.status,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

commit;
