-- 좌동사옥 식수 예측 시스템 초기 스키마 (정의서 3장)

create type user_role as enum ('admin', 'nutritionist');
create type menu_type as enum ('고기', '국·찌개·탕', '면', '생선', '밥·덮밥', '기타');
create type weather_cat as enum ('맑음', '흐림', '비', '눈');
create type prep_result as enum ('부족', '적정', '남음');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  role user_role not null default 'nutritionist',
  active boolean not null default true,            -- 설정 화면의 '비활성화'
  email text,
  created_at timestamptz not null default now()
);

create table menus (
  date date primary key,
  main_dish text not null,
  sides text[] not null default '{}',
  menu_type menu_type not null,
  is_theme_day boolean not null default false,
  theme_label text,                 -- 예: '중식DAY', 'Happy Birthday'
  photo_path text,                  -- Storage 경로
  updated_by uuid references profiles,
  updated_at timestamptz not null default now()
);

create table meal_counts (
  date date primary key,
  regular_count int not null check (regular_count >= 0),   -- 일반식(배식) 인원, 예측 대상
  takeout_count int check (takeout_count >= 0),            -- 간편식(테이크아웃)
  prepared_count int check (prepared_count >= 0),          -- 실제 준비량(선택)
  result prep_result,                                      -- 준비량 대비
  note text,
  entered_by uuid references profiles,
  entered_at timestamptz not null default now()
);

create table weather_forecasts (
  id bigserial primary key,
  target_date date not null,
  source text not null check (source in ('short', 'mid')),
  issued_at timestamptz not null,
  category weather_cat not null,
  pop int check (pop between 0 and 100),   -- 점심 전후 최대 강수확률
  rain_mm numeric,                          -- 단기예보만
  snow_cm numeric,                          -- 단기예보만
  tmin numeric, tmax numeric,
  raw jsonb,
  unique (target_date, source, issued_at)
);
create index on weather_forecasts (target_date, issued_at desc);

create table weather_observed (
  date date primary key,
  rain_mm numeric,
  snow_cm numeric,
  avg_temp numeric,
  category weather_cat not null,
  raw jsonb
);

create table calendar_days (
  date date primary key,
  is_workday boolean not null,
  holiday_name text,
  holiday_adjacent boolean not null default false,  -- 3일 이상 연휴 바로 앞뒤 근무일
  bridge_day boolean not null default false,        -- 징검다리 근무일
  year_end boolean not null default false,          -- 연말 연차 소진 기간
  summer_vacation boolean not null default false,   -- 여름 휴가철
  company_closed boolean not null default false,    -- 사내 휴무(관리자 입력)
  note text
);

create table predictions (
  id bigserial primary key,
  target_date date not null,
  run_date date not null,                 -- 계산한 한국 날짜
  run_at timestamptz not null default now(),
  lead_days int not null,                 -- 영업일 기준 며칠 전 계산인지
  expected numeric not null,
  recommended int not null,
  low int not null,
  high int not null,
  weather_basis text not null check (weather_basis in ('short', 'mid', 'none')),
  contributions jsonb not null,           -- [{key,label,value,source,n}]
  model_run_id bigint,
  unique (target_date, run_date)
);
create index on predictions (target_date, run_date desc);

create table model_runs (
  id bigserial primary key,
  run_at timestamptz not null default now(),
  n_days int not null,
  overall numeric not null,
  sigma numeric not null,
  effects jsonb not null,                 -- 요인별 {eff, n}
  version text not null
);
alter table predictions add foreign key (model_run_id) references model_runs(id);

create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ───────────── 권한 (RLS) ─────────────

create function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active);
$$;
create function is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active);
$$;
-- 한국 날짜 기준 오늘
create function kst_today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Seoul')::date;
$$;

alter table profiles enable row level security;
alter table menus enable row level security;
alter table meal_counts enable row level security;
alter table weather_forecasts enable row level security;
alter table weather_observed enable row level security;
alter table calendar_days enable row level security;
alter table predictions enable row level security;
alter table model_runs enable row level security;
alter table settings enable row level security;

-- profiles: 본인, 관리자는 전체 / 쓰기는 관리자
create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or is_admin());
create policy profiles_admin_write on profiles for all to authenticated
  using (is_admin()) with check (is_admin());

-- menus: 로그인 사용자 읽기 / 관리자 쓰기
create policy menus_read on menus for select to authenticated using (is_staff());
create policy menus_admin_write on menus for all to authenticated
  using (is_admin()) with check (is_admin());

-- meal_counts: 관리자 전체, 영양사는 최근 7일 insert·update (delete 불가)
create policy meal_counts_read on meal_counts for select to authenticated using (is_staff());
create policy meal_counts_admin_all on meal_counts for all to authenticated
  using (is_admin()) with check (is_admin());
create policy meal_counts_staff_insert on meal_counts for insert to authenticated
  with check (is_staff() and date >= kst_today() - 7 and date <= kst_today());
create policy meal_counts_staff_update on meal_counts for update to authenticated
  using (is_staff() and date >= kst_today() - 7)
  with check (is_staff() and date >= kst_today() - 7 and date <= kst_today());

-- 크론이 쓰는 테이블: 읽기만 (쓰기는 서비스 롤이 RLS를 우회)
create policy weather_forecasts_read on weather_forecasts for select to authenticated using (is_staff());
create policy weather_observed_read on weather_observed for select to authenticated using (is_staff());
create policy predictions_read on predictions for select to authenticated using (is_staff());
create policy model_runs_read on model_runs for select to authenticated using (is_staff());

-- calendar_days: 읽기는 로그인 사용자, 관리자는 company_closed·note 컬럼만 수정
create policy calendar_days_read on calendar_days for select to authenticated using (is_staff());
create policy calendar_days_admin_update on calendar_days for update to authenticated
  using (is_admin()) with check (is_admin());
revoke insert, update, delete on calendar_days from authenticated, anon;
grant update (company_closed, note) on calendar_days to authenticated;

-- settings: 로그인 사용자 읽기 / 관리자 쓰기
create policy settings_read on settings for select to authenticated using (is_staff());
create policy settings_admin_write on settings for all to authenticated
  using (is_admin()) with check (is_admin());

-- ───────────── Storage ─────────────
insert into storage.buckets (id, name, public) values ('menu-photos', 'menu-photos', false)
  on conflict (id) do nothing;

create policy menu_photos_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'menu-photos' and public.is_admin());
create policy menu_photos_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-photos' and public.is_admin());
create policy menu_photos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'menu-photos' and public.is_admin());
create policy menu_photos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'menu-photos' and public.is_admin());
