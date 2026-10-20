"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "주간 예측" },
  { href: "/menus/upload", label: "식단 업로드" },
  { href: "/analysis", label: "분석" },
  { href: "/settings", label: "설정" },
  { href: "/input", label: "식수 입력" },
];

export default function NavLinks() {
  const path = usePathname();
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto text-sm">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium ${
              active ? "bg-flame-soft text-navy" : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
