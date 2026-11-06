"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  NotebookPen,
  Stethoscope,
  Layers,
  FlaskConical,
  Lightbulb,
  BookOpen,
  Activity,
  Radar,
  Compass,
  Ruler,
  ShieldHalf,
  RefreshCw,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";

interface SidebarProps {
  user: { name?: string | null; email?: string | null; image?: string | null } | null;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

// Grouped by what the trader is doing, not by how the app is built.
const NAV_GROUPS: { title: string; items: { href: string; label: string; icon: LucideIcon }[] }[] = [
  {
    title: "Review",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/trades", label: "Journal", icon: NotebookPen },
      { href: "/review", label: "Trade review", icon: Stethoscope },
    ],
  },
  {
    title: "Research",
    items: [
      { href: "/strategies", label: "Strategies", icon: Layers },
      { href: "/backtest", label: "Backtests", icon: FlaskConical },
      { href: "/insights", label: "Backtest insights", icon: Lightbulb },
      { href: "/plan", label: "Weekly plan", icon: Compass },
      { href: "/signals", label: "Signals", icon: Radar },
      { href: "/markets", label: "Markets", icon: Activity },
      { href: "/guides", label: "Guides", icon: BookOpen },
    ],
  },
  {
    title: "Risk",
    items: [
      { href: "/risk", label: "Position size", icon: Ruler },
      { href: "/risk-calculator", label: "Account risk", icon: ShieldHalf },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/import", label: "Sync", icon: RefreshCw },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

// A tiny P&L bridge: the dashboard's signature shape, used as the mark.
function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="1" y="4" width="4" height="10" rx="1" fill="var(--gain)" />
      <rect x="6.5" y="4" width="4" height="13" rx="1" fill="var(--fees)" />
      <rect x="12" y="15" width="4" height="3" rx="1" fill="var(--funding)" />
      <rect x="17" y="12" width="4" height="7" rx="1" fill="var(--paper)" />
    </svg>
  );
}

export default function Sidebar({ user, onLogout, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-rule bg-ink px-4 py-6 transition-transform duration-300 ease-out md:translate-x-0 ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}
      aria-label="Main navigation"
    >
      <div className="mb-8 flex items-center justify-between px-2">
        <Link href="/" className="flex items-center gap-2.5 rounded-md" onClick={onClose}>
          <BrandMark />
          <span className="font-display text-[19px] font-bold tracking-[-0.02em] text-paper">AuraJournal</span>
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-fog hover:text-paper md:hidden"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex flex-grow flex-col gap-6 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="mb-1.5 px-3 text-xs font-medium text-mist">{group.title}</p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                        active ? "bg-deck text-paper" : "text-fog hover:bg-deck/60 hover:text-paper"
                      }`}
                    >
                      {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-signal" />}
                      <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-6 flex items-center gap-3 border-t border-rule px-2 pt-5">
        {user?.image ? (
          <img src={user.image} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-deck-2 text-xs font-semibold text-paper">
            {(user?.name ?? "T").slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-paper">{user?.name || "Trader"}</p>
          <button onClick={onLogout} className="text-xs text-fog hover:text-loss-ink">
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
