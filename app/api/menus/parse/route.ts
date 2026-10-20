// 식단 사진 인식 (정의서 4.5). 사진 한 장씩 따로 호출해 결과를 합친다.
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { getProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSystemPrompt, USER_PROMPT } from "@/lib/menus/parsePrompt";
import { parseRequest, parseResult, stripFences, type ParsedDay } from "@/lib/menus/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MEDIA: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export interface PhotoResult {
  path: string;
  ok: boolean;
  days: ParsedDay[];
  error?: string;
}

async function parseOne(client: Anthropic, model: string, system: string, path: string): Promise<PhotoResult> {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const mediaType = MEDIA[ext];
  if (!mediaType) return { path, ok: false, days: [], error: "jpg·png 사진만 읽을 수 있어요 (HEIC는 변환 후 올려 주세요)" };

  const { data: blob, error } = await createAdminClient().storage.from("menu-photos").download(path);
  if (error || !blob) return { path, ok: false, days: [], error: "사진을 불러오지 못했어요" };
  const data = Buffer.from(await blob.arrayBuffer()).toString("base64");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 4096,
        system,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data } },
              { type: "text", text: USER_PROMPT },
            ],
          },
        ],
      });
      const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const parsed = parseResult.safeParse(JSON.parse(stripFences(text)));
      if (parsed.success) return { path, ok: true, days: parsed.data.days };
    } catch (e) {
      console.log(JSON.stringify({ job: "menus-parse", path, attempt, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  return { path, ok: false, days: [], error: "이 사진을 읽지 못했어요" };
}

export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 403 });

  const input = parseRequest.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "입력이 올바르지 않아요" }, { status: 400 });

  const model = process.env.CLAUDE_MODEL;
  if (!process.env.ANTHROPIC_API_KEY || !model)
    return NextResponse.json({ error: "ANTHROPIC_API_KEY·CLAUDE_MODEL 환경변수가 필요해요" }, { status: 500 });

  const [year, month] = input.data.month.split("-").map(Number);
  const client = new Anthropic();
  const system = buildSystemPrompt(year, month);
  const photos = await Promise.all(input.data.photoPaths.map((p) => parseOne(client, model, system, p)));

  // 같은 날짜가 여러 사진에 있으면 먼저 읽은 것을 쓴다
  const byDate = new Map<string, ParsedDay & { photo_path: string }>();
  for (const ph of photos) for (const d of ph.days) if (!byDate.has(d.date)) byDate.set(d.date, { ...d, photo_path: ph.path });
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ days, photos });
}
