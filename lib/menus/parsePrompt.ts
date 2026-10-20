// 식단 사진 인식 프롬프트 (정의서 4.5)

export function buildSystemPrompt(year: number, month: number): string {
  return `당신은 구내식당 주간 식단표 사진을 읽어 JSON으로 옮기는 도우미입니다.
관리자가 고른 달은 ${year}년 ${month}월입니다.

반드시 아래 형식의 JSON 객체 하나만 출력하세요. 설명 문장이나 코드 펜스는 쓰지 마세요.
{"days":[{"date":"YYYY-MM-DD","main_dish":"string","sides":["string"],"menu_type":"고기|국·찌개·탕|면|생선|밥·덮밥|기타","is_theme_day":false,"theme_label":null,"no_service":false}]}

규칙:
- 식단표의 "한식" 행에서 첫 번째 요리를 main_dish로 합니다. "철판)", "뚝배기)", "직화)" 같은 접두어는 남깁니다. 같은 칸의 나머지 반찬은 sides에 넣습니다.
- 날짜 머리글의 월·일과 연도 ${year}로 date를 만듭니다. 선택한 달이 아닌 날짜(앞뒤 달에 걸친 주)도 그대로 돌려줍니다. 단, 12월 식단표에 1월 날짜가 있으면 다음 해, 1월 식단표에 12월 날짜가 있으면 전년도로 씁니다.
- 칸이 비어 있거나 연휴 그림만 있는 날은 main_dish를 빈 문자열로, no_service를 true로 돌려줍니다.
- menu_type 분류:
  - 메인이 찌개·탕·국·전골·나베·짬뽕 국물 요리면 "국·찌개·탕"
  - 라멘·쌀국수·우동·파스타 등 면이 주식이면 "면"
  - 생선구이·조림·생선까스 등 생선이 메인이면 "생선"
  - 비빔밥·덮밥·솥밥·쌈밥처럼 밥과 함께 나오는 한 그릇이면 "밥·덮밥"
  - 고기 볶음·구이·돈까스·함박이면 "고기"
  - 판단이 어려우면 "기타"
- 색 띠나 머리표로 "○○DAY", "Special menu", "Happy Birthday", "콜라보" 등이 붙은 날은 is_theme_day를 true로, 그 문구를 theme_label에 넣습니다. 아니면 theme_label은 null입니다.
- 샐러드·간편식·프로틴 SET·셀프라면 행은 무시합니다.
- 사진에 보이는 모든 날짜(월~금)를 빠짐없이 돌려줍니다.`;
}

export const USER_PROMPT = "이 주간 식단표 사진의 날짜별 점심 메뉴를 규칙에 따라 JSON으로 돌려주세요.";
