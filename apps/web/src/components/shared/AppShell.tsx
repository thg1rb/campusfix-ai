"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  Building2,
  ChevronDown,
  ClipboardCheck,
  FileText,
  LayoutGrid,
  LogOut,
  Map,
  MapPin,
  MapPinned,
  Menu,
  PlusCircle,
  ShieldCheck,
  Tags,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { DemoSimulationBar } from "@/features/demo/components/DemoSimulationBar";
import { publicFeedPath, signInPath } from "@/features/auth";
import { googleSignInLabel } from "@/features/auth/authRoutes";
import { GoogleMark } from "@/features/auth/components/GoogleMark";
import { usePrototype } from "@/lib/store/PrototypeStore";
import { platformName } from "@/lib/brand";
import { isExclusiveAdmin } from "@/lib/domain/permissions";
import type { User } from "@/types/domain";
import { useLiveSession } from "@/features/auth/LiveSession";
import { identityErrorMessage } from "@/features/auth/authErrors";
import { PageFrame } from "./Controls";
import { getRouteMode } from "./routeMode";

type NavUser = Pick<User, "username" | "roles">;

type NavLink = { href: string; label: string; icon: LucideIcon };
const publicLinks: NavLink[] = [
  { href: publicFeedPath, label: "หน้าหลัก", icon: LayoutGrid },
  { href: "/map", label: "แผนที่ปัญหา", icon: Map },
];
const adminLinks: NavLink[] = [
  { href: "/admin", label: "ภาพรวมระบบ", icon: BarChart3 },
  { href: "/admin/users", label: "ผู้ใช้และสิทธิ์", icon: Users },
  { href: "/admin/categories", label: "ประเภทปัญหา", icon: Tags },
  { href: "/admin/departments", label: "หน่วยงาน", icon: Building2 },
  { href: "/admin/locations", label: "สถานที่", icon: MapPin },
];
const reportLink = { href: "/reports/new", label: "แจ้งปัญหา", icon: PlusCircle };
const profileLink = { href: "/settings/profile", label: "ตั้งค่าโปรไฟล์", icon: UserCog };
const activeClass = "bg-[var(--color-brand-soft)] text-primary font-medium";

function workspaceLinks(user: NavUser | null): NavLink[] {
  if (!user || isExclusiveAdmin(user)) return [];
  const links: NavLink[] = [{ href: "/my-reports", label: "รายงานของฉัน", icon: FileText }];
  if (user.roles.includes("REVIEWER"))
    links.push({ href: "/reviewer", label: "คิวตรวจสอบ", icon: ClipboardCheck });
  if (user.roles.includes("DEPARTMENT_STAFF"))
    links.push({ href: "/department", label: "งานหน่วยงาน", icon: Wrench });
  return links;
}

function isCurrent(path: string, href: string) {
  return path === href || (href !== "/admin" && path.startsWith(href + "/"));
}

function NavAction({
  link,
  path,
  mobile = false,
}: {
  link: NavLink;
  path: string;
  mobile?: boolean;
}) {
  const current = isCurrent(path, link.href);
  const primary = link === reportLink && !current;
  const Icon = link.icon;
  const element = (
    <Button
      asChild
      variant={primary ? "default" : "ghost"}
      className={cn("whitespace-nowrap", mobile && "w-full justify-start", current && activeClass)}
    >
      <Link href={link.href} aria-current={current ? "page" : undefined}>
        <Icon size={18} className="size-[18px]" aria-hidden="true" />
        {link.label}
      </Link>
    </Button>
  );
  return mobile ? <SheetClose asChild>{element}</SheetClose> : element;
}

function MobileNav({
  user,
  path,
  logout,
  demoAvailable,
}: {
  user: NavUser | null;
  demoAvailable: boolean;
  path: string;
  logout: () => void;
}) {
  const admin = isExclusiveAdmin(user);
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="เปิดเมนู">
          <Menu size={18} className="size-[18px]" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-xs overflow-y-auto">
        <SheetHeader>
          <SheetTitle>เมนูหลัก</SheetTitle>
          <SheetDescription>ไปยังส่วนต่าง ๆ ของ {platformName}</SheetDescription>
        </SheetHeader>
        <nav aria-label="เมนูมือถือ" className="grid gap-2 px-4 pb-5">
          <div className="grid gap-1">
            {publicLinks.map((link) => (
              <NavAction key={link.href} link={link} path={path} mobile />
            ))}
          </div>
          <Separator />
          {admin ? (
            <section aria-labelledby="mobile-admin-title" className="grid gap-1">
              <h2
                id="mobile-admin-title"
                className="flex items-center gap-2 px-2 py-2 text-sm font-semibold text-primary"
              >
                <ShieldCheck size={18} className="size-[18px]" aria-hidden="true" /> ผู้ดูแลระบบ
              </h2>
              {adminLinks.map((link) => (
                <NavAction key={link.href} link={link} path={path} mobile />
              ))}
            </section>
          ) : (
            <div className="grid gap-1">
              {workspaceLinks(demoAvailable ? user : null).map((link) => (
                <NavAction key={link.href} link={link} path={path} mobile />
              ))}
              {demoAvailable && <NavAction link={reportLink} path={path} mobile />}
            </div>
          )}
          <Separator />
          {user ? (
            <div className="grid gap-1">
              <NavAction link={profileLink} path={path} mobile />
              <SheetClose asChild>
                <Button variant="ghost" className="justify-start" onClick={logout}>
                  <LogOut size={18} className="size-[18px]" aria-hidden="true" /> ออกจากระบบ
                </Button>
              </SheetClose>
            </div>
          ) : (
            <SheetClose asChild>
              <Button asChild variant="ghost" className="w-full justify-start">
                <Link href={signInPath}>
                  <GoogleMark />
                  {googleSignInLabel}
                </Link>
              </Button>
            </SheetClose>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function TopNav({ user }: { user: NavUser | null }) {
  const path = usePathname();
  const router = useRouter();
  const { dispatch, demoAvailable } = usePrototype();
  const { session, signOut } = useLiveSession();
  const admin = isExclusiveAdmin(user);
  const logout = async () => {
    try {
      if (session.user) {
        if (process.env.NODE_ENV === "development") await dispatch({ type: "login", userId: null });
        await signOut();
      } else {
        const result = await dispatch({ type: "login", userId: null });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
      }
      router.push(publicFeedPath);
    } catch (error) {
      toast.error(identityErrorMessage(error));
    }
  };
  return (
    <header className="sticky top-0 z-30 border-b bg-white/95 shadow-xs backdrop-blur-sm">
      <div className="mx-auto flex min-h-16 max-w-[1360px] items-center justify-between gap-1.5 px-2 min-[360px]:gap-2 min-[360px]:px-3 sm:px-5">
        <Link
          href={publicFeedPath}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-foreground min-[360px]:gap-2 min-[360px]:text-base"
        >
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-white shadow-xs min-[360px]:size-8">
            <MapPinned size={19} aria-hidden="true" />
          </span>
          <span className="whitespace-nowrap" translate="no">
            {platformName}
          </span>
        </Link>
        <nav aria-label="เมนูหลัก" className="hidden items-center gap-1 lg:flex">
          {[...publicLinks, ...workspaceLinks(demoAvailable ? user : null)].map((link) => (
            <NavAction key={link.href} link={link} path={path} />
          ))}
          {admin ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className={cn(path.startsWith("/admin") && activeClass)}>
                  <ShieldCheck size={18} className="size-[18px]" aria-hidden="true" /> ผู้ดูแลระบบ{" "}
                  <ChevronDown size={18} className="size-[18px]" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-52">
                <DropdownMenuGroup>
                  {adminLinks.map(({ href, label, icon: Icon }) => {
                    const current = isCurrent(path, href);
                    return (
                      <DropdownMenuItem asChild key={href} className={cn(current && activeClass)}>
                        <Link href={href} aria-current={current ? "page" : undefined}>
                          <Icon size={18} className="size-[18px]" aria-hidden="true" />
                          {label}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            demoAvailable && <NavAction link={reportLink} path={path} />
          )}
        </nav>
        <div className="flex min-w-0 items-center gap-1">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="shrink min-[400px]:shrink-0">
                  <span className="max-w-20 truncate min-[400px]:max-w-40">@{user.username}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link
                      href={profileLink.href}
                      aria-current={isCurrent(path, profileLink.href) ? "page" : undefined}
                    >
                      <UserCog size={18} className="size-[18px]" aria-hidden="true" />
                      ตั้งค่าโปรไฟล์
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={logout}>
                    <LogOut size={18} className="size-[18px]" aria-hidden="true" />
                    ออกจากระบบ
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="outline">
              <Link href={signInPath} aria-label={googleSignInLabel}>
                <GoogleMark />
                <span className="hidden sm:inline">{googleSignInLabel}</span>
                <span className="sm:hidden">เข้าสู่ระบบ</span>
              </Link>
            </Button>
          )}
          <div className="lg:hidden">
            <MobileNav user={user} path={path} logout={logout} demoAvailable={demoAvailable} />
          </div>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, state, demoAvailable } = usePrototype();
  const { session } = useLiveSession();
  const path = usePathname();
  const mode = getRouteMode(path);
  const portal = mode === "login" || mode === "demo-login";
  const loading = (
    <div className="mx-auto grid max-w-[1200px] gap-4 px-4 py-10" role="status">
      <span className="sr-only">กำลังโหลดข้อมูล…</span>
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-44 w-full" />
    </div>
  );
  let content: ReactNode = loading;
  if (mode === "prototype-only" && !demoAvailable) {
    if (process.env.NODE_ENV !== "development" || session.status !== "loading") {
      content = (
        <PageFrame>
          <p className="campus-panel p-4">ส่วนนี้อยู่ระหว่างเชื่อมต่อกับระบบจริง</p>
        </PageFrame>
      );
    }
  } else if (mode === "login" || mode === "live" || state) {
    content = children;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:p-3"
      >
        ข้ามไปยังเนื้อหา
      </a>
      {!portal && <TopNav user={session.user ?? user} />}
      {mode === "prototype-public" && (
        <p className="border-b bg-muted px-4 py-2 text-center text-sm text-muted-foreground">
          ตัวอย่างข้อมูลปัญหาในวิทยาเขต
        </p>
      )}
      <main id="main" tabIndex={-1} className={cn("flex-1", portal && "grid")}>
        {content}
      </main>
      {demoAvailable && <DemoSimulationBar compact={portal} />}
    </div>
  );
}
