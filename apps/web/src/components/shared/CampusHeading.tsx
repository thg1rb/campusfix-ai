import { BarChart3, ClipboardList, MapPinned, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

const statIcons = [ClipboardList, MapPinned, BarChart3];

export function CampusHeading({
  title,
  context,
  subtitle,
  stats = [],
  badges,
  meta,
  children,
  announceStats,
  icon: Icon = MapPinned,
}: {
  title: string;
  context?: string;
  subtitle?: string;
  stats?: { label: string; value: number; icon?: LucideIcon }[];
  badges?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  announceStats?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <header className="campus-band grid min-w-0 gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-md shadow-emerald-950/10 sm:gap-5 sm:p-6 lg:p-7">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <div className="grid min-w-0 flex-[1_1_23rem] items-start gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white text-primary shadow-sm">
            <Icon size={25} aria-hidden="true" />
          </span>
          <div className="grid min-w-0 gap-2 [overflow-wrap:anywhere]">
            {context && (
              <p className="justify-self-start rounded-full border border-white/25 bg-white/15 px-3 py-0.5 text-xs font-medium text-emerald-100">
                {context}
              </p>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
            {badges && <div className="flex min-w-0 flex-wrap items-center gap-2">{badges}</div>}
            {subtitle && (
              <p className="max-w-prose text-sm leading-relaxed text-white/90 sm:text-base">
                {subtitle}
              </p>
            )}
            {meta && <div className="text-sm text-white/90">{meta}</div>}
          </div>
        </div>
        {children && <div className="flex min-w-0 flex-wrap gap-2">{children}</div>}
      </div>
      {stats.length > 0 && (
        <dl
          aria-live={announceStats ? "polite" : undefined}
          className={
            stats.length === 4
              ? "grid grid-cols-2 gap-2 md:grid-cols-4"
              : stats.length === 2
                ? "grid gap-2 sm:grid-cols-2"
                : "grid gap-2 min-[450px]:grid-cols-2 md:grid-cols-3"
          }
        >
          {stats.map(({ label, value, icon }, index) => {
            const StatIcon = icon ?? statIcons[index % statIcons.length];
            return (
              <div
                key={label}
                className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-sm backdrop-blur-xs"
              >
                <StatIcon size={17} className="shrink-0 text-emerald-100" aria-hidden="true" />
                <dt className="min-w-0 [overflow-wrap:anywhere]">{label}</dt>
                <dd className="ms-auto shrink-0 text-lg font-bold tabular-nums">{value}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </header>
  );
}
