"use client";

import { useActionState } from "react";
import { signIn } from "@/app/actions/auth";
import { btn, input } from "@/components/ui";

export default function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">이메일</span>
        <input name="email" type="email" autoComplete="username" required className={input} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">비밀번호</span>
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      {state?.message && <p className="text-sm text-bad">{state.message}</p>}
      <button type="submit" disabled={pending} className={`${btn.primary} w-full`}>
        {pending ? "로그인 중…" : "로그인"}
      </button>
    </form>
  );
}
