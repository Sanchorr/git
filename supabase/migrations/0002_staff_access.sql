-- 영양사도 관리자와 같은 화면·기능을 쓴다. 사용자 관리(profiles 쓰기)만 관리자 전용으로 남긴다.
-- 식수 입력의 '최근 7일' 제한(meal_counts)은 그대로 둔다.

-- 식단
drop policy if exists menus_admin_write on menus;
create policy menus_staff_write on menus for all to authenticated
  using (is_staff()) with check (is_staff());

-- 설정
drop policy if exists settings_admin_write on settings;
create policy settings_staff_write on settings for all to authenticated
  using (is_staff()) with check (is_staff());

-- 달력: company_closed·note 컬럼만 수정 가능 (컬럼 권한은 0001에서 설정됨)
drop policy if exists calendar_days_admin_update on calendar_days;
create policy calendar_days_staff_update on calendar_days for update to authenticated
  using (is_staff()) with check (is_staff());

-- 식단 사진
drop policy if exists menu_photos_admin_read on storage.objects;
drop policy if exists menu_photos_admin_insert on storage.objects;
drop policy if exists menu_photos_admin_update on storage.objects;
drop policy if exists menu_photos_admin_delete on storage.objects;
create policy menu_photos_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'menu-photos' and public.is_staff());
create policy menu_photos_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-photos' and public.is_staff());
create policy menu_photos_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'menu-photos' and public.is_staff());
create policy menu_photos_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'menu-photos' and public.is_staff());
