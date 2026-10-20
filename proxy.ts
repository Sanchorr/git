// 세션 갱신과 역할별 이동 (정의서 6.1)
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_PREFIXES = ["/menus", "/analysis", "/settings"];

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

  const isAdminPath = path === "/" || ADMIN_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  if (isAdminPath || path === "/login") {
    const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", user.id).maybeSingle();
    if (!profile || !profile.active) return path === "/login" ? response : redirect("/login");
    const home = profile.role === "admin" ? "/" : "/input";
    if (path === "/login") return redirect(home);
    if (profile.role !== "admin") return redirect("/input");
  }
  return response;
}

export const config = {
  // 크론·API·정적 파일은 제외
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"],
};
