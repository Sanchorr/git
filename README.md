# 좌동사옥 식수 예측 시스템

`좌동사옥 식수 예측 시스템 정의서.md`를 구현한 Next.js(App Router) + Supabase + Vercel 앱입니다.

## 설치와 실행

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev
```

| 명령 | 내용 |
| --- | --- |
| `npm test` | 단위 테스트 (예측 모델, 달력 플래그, 격자·예보 변환, 화면 계산) |
| `npm run typecheck` | 타입 검사 |
| `npm run build` | 프로덕션 빌드 |
| `npx tsx --env-file=.env.local scripts/backfill.ts` | 시드 후 1회: 특일정보·관측 날씨 백필 + 예측 계산 |

## Supabase 준비

1. 서울 리전(ap-northeast-2)에 프로젝트를 만든다.
2. SQL Editor에서 `supabase/migrations/0001_init.sql` → `0002_staff_access.sql` → `supabase/seed.sql` 순서로 실행한다.
   (Supabase CLI를 쓰면 `supabase db push` 후 seed 실행)
3. 대시보드 Authentication에서 관리자 사용자를 만들고, `profiles`에 직접 넣는다.
   ```sql
   insert into profiles (id, name, role, email)
   values ('<auth.users의 id>', '관리자', 'admin', '<이메일>');
   ```
4. `.env.local`을 채우고 백필 스크립트를 1회 실행한다. 출력에서 9/23, 9/28이 `holiday_adjacent: true`인지 확인한다.

## Vercel 배포

- 환경변수 7개(`.env.example`)를 등록한다. `CRON_SECRET`은 Vercel 크론이 `Authorization: Bearer` 헤더로 자동 전송한다.
- `vercel.json`에 크론 8개(UTC)가 있다. 요금제의 크론 횟수 제한이 부족하면 `vercel.json`을
  `{ "path": "/api/cron/daily", "schedule": "40 21 * * *" }` 하나로 바꾼다 (달력 → 단기 → 중기 → 관측 → 예측 순서 실행).

## 구조

```
app/(auth)/login            로그인
app/(admin)/                주간 예측(/), 식단 업로드, 분석, 설정 — 관리자
app/input                   식수 입력 — 영양사·관리자, 모바일 우선
app/api/cron/*              예약 작업 (CRON_SECRET 필요)
app/api/menus/parse         식단 사진 인식 (Claude API)
app/actions/*               서버 액션 (saveMealCount, saveMenus, updateSettings, ...)
lib/model                   덧셈 모델 additive-v1 (학습·예측)
lib/holidays                특일정보, 달력 플래그
lib/kma                     기상청 단기·중기·ASOS, 격자 변환
lib/recompute.ts            recomputePredictions
lib/jobs.ts                 크론 작업 본체
lib/views                   주간 예측·분석 화면 계산 (순수 함수)
proxy.ts                    세션 갱신·역할별 이동 (Next 16의 middleware)
```

## 정의서와 다르게 정한 점

- **영양사도 관리자와 같은 화면을 본다.** 주간 예측·식단 업로드·분석·설정을 모두 쓰고, 로그인하면 둘 다 `/`로 간다.
  관리자 전용은 사용자 관리(계정 만들기·비활성화)뿐이다. 식수 입력의 '최근 7일' 제한은 영양사에게 그대로 적용된다.
  (`0002_staff_access.sql`)

- **보장인원 미달일**은 정산 총식수(일반식 + 간편식) 기준으로 센다. 일반식만으로 세면 9/29(104명)가 포함돼
  정의서 8장의 기대값(5일)과 맞지 않는다. 주간 예측 화면의 "권장 준비량 < 보장인원" 알림은 정의서대로 권장량 기준이다.
- **격자 좌표**: 35.17, 129.18 → nx=100, ny=76 (정의서의 "대략 99, 75 근처" 범위 안). 테스트로 고정했다.
- `profiles`에 `active`(비활성화), `email` 컬럼을 추가했다. 비활성 계정은 RLS·로그인 모두 막힌다.
- 지난 날짜는 이미 예측이 있으면 다시 계산하지 않는다 (실적을 본 뒤의 예측으로 "2일 전 예측"이 오염되지 않도록).
- 식단 사진은 브라우저에서 긴 변 2000px JPEG로 변환해 올린다. 브라우저가 열지 못하는 HEIC는 원본을 올리며, 이 경우
  Claude API가 HEIC를 받지 않으므로 "jpg·png 사진만 읽을 수 있어요"를 표시한다.
- "어제 식수 입력 없음" 알림은 주말·공휴일을 건너 **직전 근무일** 기준으로 본다 (월요일엔 금요일).
