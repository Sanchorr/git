import { z } from "zod";
import { MENU_TYPES } from "@/lib/model/types";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식이어야 해요");
export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "연월은 YYYY-MM 형식이어야 해요");

export const parsedDay = z.object({
  date: isoDate,
  main_dish: z.string(),
  sides: z.array(z.string()).default([]),
  menu_type: z.enum(MENU_TYPES),
  is_theme_day: z.boolean().default(false),
  theme_label: z.string().nullable().default(null),
  no_service: z.boolean().default(false),
});
export type ParsedDay = z.infer<typeof parsedDay>;

export const parseResult = z.object({ days: z.array(parsedDay) });

export const parseRequest = z.object({
  month,
  photoPaths: z.array(z.string().min(1)).min(1).max(6),
});

export const saveMenusInput = z.object({
  month,
  days: z
    .array(
      z.object({
        date: isoDate,
        main_dish: z.string().trim().min(1),
        sides: z.array(z.string()).default([]),
        menu_type: z.enum(MENU_TYPES),
        is_theme_day: z.boolean(),
        theme_label: z.string().nullable(),
        photo_path: z.string().nullable().optional(),
      }),
    )
    .min(1),
});
export type SaveMenusInput = z.infer<typeof saveMenusInput>;

/** 응답에서 코드 펜스를 지우고 JSON 객체만 꺼낸다 */
export function stripFences(text: string): string {
  let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return t;
}
