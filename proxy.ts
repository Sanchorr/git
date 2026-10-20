// 세션 갱신과 역할별 이동 (정의서 6.1)
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (!user) {
    return path === "/login" ? response : redirect("/login");
  }

  // 관리자·영양사 모두 같은 화면을 쓴다 (사용자 관리만 관리자 전용, 서버 액션에서 막음)
  const { data: profile } = await supabase.from("profiles").select("active").eq("id", user.id).maybeSingle();
  if (!profile || !profile.active) return path === "/login" ? response : redirect("/login");
  if (path === "/login") return redirect("/");
  return response;
}

export const config = {
  // 크론·API·정적 파일은 제외
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"],
};
