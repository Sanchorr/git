import { addMonths, todayKST } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import UploadClient from "./UploadClient";

export const dynamic = "force-dynamic";

export default function MenuUploadPage() {
  const thisMonth = todayKST().slice(0, 7);
  const options = [-2, -1, 0, 1, 2].map((n) => addMonths(thisMonth, n));
  return (
    <>
      <PageHeader title="식단 업로드" sub="주간 식단표 사진(보통 4~5장)을 올리면 날짜별 메인 메뉴와 유형을 읽어요." />
      <UploadClient defaultMonth={addMonths(thisMonth, 1)} monthOptions={options} />
    </>
  );
}
