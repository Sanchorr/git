import { requireStaffPage } from "@/lib/auth";
import { signOut } from "@/app/actions/auth";
import NavLinks from "./NavLinks";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaffPage();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy text-white">🍚</span>
            <span className="font-bold text-ink">좌동사옥 식수 예측</span>
          </div>
          <NavLinks />
          <div className="ml-auto flex items-center gap-2 text-sm text-muted">
            <span>{profile.name} 님</span>
            <form action={signOut}>
              <button className="rounded-lg px-2 py-1 hover:bg-surface-2 hover:text-ink">로그아웃</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
