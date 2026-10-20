/** 정산 총식수 = 일반식 + 간편식. 계약 보장인원 미달 판정은 이 값으로 한다. */
export function totalMeals(regular: number, takeout: number | null | undefined): number {
  return regular + (takeout ?? 0);
}
