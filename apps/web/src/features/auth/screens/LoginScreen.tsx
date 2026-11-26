"use client"

import Link from "next/link"
import { ArrowRight, ClipboardCheck, LayoutGrid, LockKeyhole, MapPinned, Network, ShieldCheck, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { platformName } from "@/lib/brand"
import { usePrototype } from "@/lib/store/PrototypeStore"
import { cn } from "@/lib/utils"
import { accountChooserPath, authLink, googleSignInLabel, publicFeedPath } from "../authRoutes"
import { CampusPlan, CampusPortalBrand } from "../components/CampusPortalBrand"
import { GoogleMark } from "../components/GoogleMark"
import { LoginTicketPreview } from "../components/LoginTicketPreview"
import { useAuthRedirect } from "../useAuthRedirect"

const highlights = [
  { icon: Sparkles, title: "AI ช่วยจัดกลุ่ม", text: "รวมรายงานเรื่องเดียวกัน" },
  { icon: ClipboardCheck, title: "เห็นความคืบหน้า", text: "ติดตามได้ทุกขั้นตอน" },
  { icon: Network, title: "ประสานหลายหน่วยงาน", text: "ร่วมแก้ไขในเรื่องเดียว" },
]

const glass = "min-w-0 rounded-xl border border-white/20 bg-white/10 shadow-sm backdrop-blur-sm"
const overview = [
  { label: "ขอบเขตการใช้งาน", value: "มก. บางเขน" },
  { label: "ติดตามความคืบหน้า", value: "4 สถานะของเรื่อง" },
]

export default function LoginScreen({ next }: { next?: string }) {
  const { user } = usePrototype()
  useAuthRedirect(user, next)
  if (user) return null

  return <div className="relative isolate grid min-w-0 grid-rows-[auto_auto_1fr] lg:grid-cols-2 lg:grid-rows-[1fr_auto_auto_1fr]">
    <div aria-hidden="true" className="campus-portal-showcase relative -z-10 col-start-1 row-start-1 overflow-hidden lg:row-[1/5]">
      <CampusPlan />
    </div>
    <div aria-hidden="true" className="campus-portal-canvas -z-10 col-start-1 row-[2/4] lg:col-start-2 lg:row-[1/5]" />
    <section aria-label={`เกี่ยวกับ ${platformName}`} className="col-start-1 row-start-1 px-5 py-6 text-white sm:px-9 sm:py-9 lg:row-start-2 lg:px-10 lg:pt-8 lg:pb-4 xl:px-13">
      <div className="relative mx-auto grid w-full max-w-xl gap-4 lg:gap-5">
        <div className="campus-portal-enter"><CampusPortalBrand /></div>
        <div className="campus-portal-enter [--portal-delay:70ms]">
          <p className="text-[1.65rem] leading-[1.28] font-bold sm:text-4xl xl:text-[clamp(2.5rem,3.45vw,4rem)]">
            แจ้งปัญหาในวิทยาเขต<br /><span className="text-[#A7F3D0]">ติดตามได้ในที่เดียว</span>
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed lg:mt-3 lg:text-base">แพลตฟอร์มรับแจ้งและติดตามปัญหาภายในมหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตบางเขน</p>
        </div>
        <ul className="campus-portal-enter hidden grid-cols-3 gap-2.5 [--portal-delay:140ms] lg:grid">
          {highlights.map(({ icon: Icon, title, text }) => <li key={title} className={cn(glass, "grid content-start gap-1.5 px-3 py-3")}>
            <Icon size={19} aria-hidden="true" className="text-[#A7F3D0]" />
            <span className="text-sm leading-snug font-semibold">{title}</span>
            <span className="text-xs leading-relaxed">{text}</span>
          </li>)}
        </ul>
        <dl className="campus-portal-enter hidden grid-cols-2 gap-2.5 [--portal-delay:190ms] lg:grid">
          {overview.map(({ label, value }) => <div key={label} className={cn(glass, "grid gap-1 px-3.5 py-2")}>
            <dt className="text-xs">{label}</dt>
            <dd className="text-sm leading-snug font-semibold">{value}</dd>
          </div>)}
        </dl>
      </div>
    </section>
    <div className="col-start-1 row-start-2 grid min-w-0 content-center justify-items-center px-4 py-6 sm:px-8 sm:py-10 lg:col-start-2 lg:row-[1/5] lg:p-10">
      <Card className="campus-portal-card campus-portal-enter w-full max-w-md gap-5 rounded-2xl border border-border pt-7 shadow-xl shadow-emerald-950/5 ring-0 [--card-spacing:--spacing(5)] [--portal-delay:110ms] sm:gap-6 sm:pt-9 sm:[--card-spacing:--spacing(8)]">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md"><MapPinned size={23} aria-hidden="true" /></span>
            <Badge variant="outline" data-tone="success"><ShieldCheck aria-hidden="true" /> บัญชีมหาวิทยาลัย @ku.th</Badge>
          </div>
          <h1 className="text-2xl leading-snug sm:text-3xl">เข้าสู่ระบบ {platformName}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">สำหรับนิสิตและบุคลากรมหาวิทยาลัยเกษตรศาสตร์ รองรับเฉพาะบัญชี Google (@ku.th)</p>
        </CardHeader>
        <CardContent className="grid gap-3.5">
          <Button asChild className="group/sign-in min-h-12 w-full gap-2.5 hover:shadow-lg hover:shadow-emerald-900/20">
            <Link href={authLink(accountChooserPath, next)} prefetch={false}>
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-white"><GoogleMark /></span>
              <span>{googleSignInLabel}</span>
              <ArrowRight aria-hidden="true" className="hidden transition-transform duration-150 motion-safe:group-hover/sign-in:translate-x-0.5 sm:block" />
            </Link>
          </Button>
          <ul className="flex flex-wrap gap-1.5">
            <li><Badge variant="outline" data-tone="neutral" className="max-w-full whitespace-normal"><ShieldCheck aria-hidden="true" /> ยืนยันตัวตนด้วย @ku.th</Badge></li>
            <li><Badge variant="outline" data-tone="neutral" className="max-w-full whitespace-normal"><LockKeyhole aria-hidden="true" /> ปกปิดข้อมูลส่วนตัวต่อสาธารณะ</Badge></li>
          </ul>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Separator className="flex-1" /> <span>หรือ</span> <Separator className="flex-1" />
          </div>
          <Button asChild variant="outline" className="min-h-12 w-full">
            <Link href={publicFeedPath} prefetch={false}><LayoutGrid aria-hidden="true" /><span>เข้าชมรายการปัญหาสาธารณะ (ไม่ต้องเข้าสู่ระบบ)</span></Link>
          </Button>
          <p className="mt-1 text-center text-xs leading-relaxed text-muted-foreground">ต้นแบบจำลองระบบยืนยันตัวตนด้วยบัญชี Google (@ku.th)</p>
        </CardContent>
      </Card>
    </div>
    <div className="campus-portal-enter col-start-1 row-start-3 mx-auto w-full max-w-md px-4 pb-6 [--portal-delay:200ms] lg:max-w-[45rem] lg:px-10 lg:pb-8 xl:px-13">
      <div className="mx-auto max-w-xl"><LoginTicketPreview /></div>
    </div>
  </div>
}
