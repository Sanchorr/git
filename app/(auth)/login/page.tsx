import LoginForm from "./LoginForm";

export const metadata = { title: "로그인 · 좌동사옥 식수 예측" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-navy text-2xl text-white">
            🍚
          </div>
          <h1 className="text-xl font-bold text-ink">좌동사옥 식수 예측</h1>
          <p className="mt-1 text-sm text-muted">관리자·영양사 계정으로 로그인하세요</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
