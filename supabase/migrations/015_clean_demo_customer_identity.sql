begin;

update public.orders
set
  customer_name = 'Nguyễn Minh Khoa',
  customer_address = '30 Đường Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP.HCM.',
  updated_at = now()
where customer_name = 'Nguyễn Minh Codex';

update public.conversations
set
  customer_name = 'Nguyễn Minh Khoa',
  updated_at = now()
where customer_name = 'Nguyễn Minh Codex';

update public.leads
set
  customer_name = 'Nguyễn Minh Khoa',
  customer_address = '30 Đường Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP.HCM.',
  updated_at = now()
where customer_name = 'Nguyễn Minh Codex';

commit;
