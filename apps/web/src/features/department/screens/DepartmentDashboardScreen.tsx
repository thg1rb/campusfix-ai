"use client"

import { useState } from "react"
import Link from "next/link"
import { BarChart3, LockKeyhole } from "lucide-react"
import { CampusHeading } from "@/components/shared/CampusHeading"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AccessNotice, Choice, labelOptions, namedOptions, PageFrame } from "@/components/shared/Controls"
import { EmptyState } from "@/components/shared/EmptyState"
import { ResultFilters } from "@/components/shared/ResultFilters"
import { SeverityBadge, severityLabels, StatusBadge } from "@/components/shared/Badges"
import { canOperateAsDepartmentOnTicket, isActiveTicket, isExclusiveAdmin, isFinalTicket } from "@/lib/domain/permissions"
import { usePrototype } from "@/lib/store/PrototypeStore"
import type { Ticket } from "@/types/domain"

const all = { value: "any", label: "ทั้งหมด" }

export default function DepartmentDashboardScreen() {
  const { state, user } = usePrototype()
  const [query, setQuery] = useState("")
  const [severity, setSeverity] = useState("any")
  const [category, setCategory] = useState("any")
  const [location, setLocation] = useState("any")
  if (!state || !user?.roles.includes("DEPARTMENT_STAFF") || !user.departmentId || isExclusiveAdmin(user)) return <AccessNotice loggedIn={!!user} path="/department" />
  const department = state.departments.find(item => item.id === user.departmentId)
  const tickets = state.tickets.filter(ticket => ticket.departments.some(item => item.departmentId === user.departmentId))
    .filter(ticket => (severity === "any" || ticket.severity === severity) && (category === "any" || ticket.categoryId === category) &&
      (location === "any" || ticket.location.locationId === location) &&
      `${ticket.ticketNumber} ${ticket.title} ${ticket.summary} ${ticket.location.locationName}`.toLowerCase().includes(query.trim().toLowerCase()))
    .toSorted((a, b) => b.confirmedAt.localeCompare(a.confirmedAt))
  const active = tickets.filter(ticket => isActiveTicket(ticket.status))
  const resolved = tickets.filter(ticket => isFinalTicket(ticket.status))

  function list(items: Ticket[]) {
    return items.length ? <ul className="grid gap-3">{items.map(ticket => <li key={ticket.id} className="campus-panel grid gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{ticket.ticketNumber}
        <StatusBadge status={ticket.status} /><SeverityBadge level={ticket.severity} />
        {!canOperateAsDepartmentOnTicket(user, ticket, state!.reports).allowed && <Badge variant="secondary"><LockKeyhole aria-hidden="true" /> คุณเป็นผู้แจ้งเรื่องนี้</Badge>}
      </div>
      <h2>{ticket.title}</h2><p className="text-sm text-muted-foreground">{ticket.location.locationName}</p>
      <Button asChild variant="outline" className="justify-self-start"><Link href={`/department/tickets/${ticket.ticketNumber}`}>เปิดงาน {ticket.ticketNumber}</Link></Button>
    </li>)}</ul> : <EmptyState title="ไม่พบงานที่ตรงกับเงื่อนไข" />
  }

  return <PageFrame>
    <CampusHeading title="รายการงานของหน่วยงาน" context={department?.name} stats={[
      { label: "เรื่องที่เปิดอยู่", value: active.length },
      { label: "แก้ไขเสร็จแล้ว", value: resolved.length },
      { label: "เรื่องตามตัวกรอง", value: tickets.length },
    ]}>
      <Button asChild variant="outline"><Link href="/department/analytics"><BarChart3 aria-hidden="true" /> สถิติหน่วยงาน</Link></Button>
    </CampusHeading>
    <ResultFilters label="ค้นหางาน" placeholder="ค้นหาเลขเรื่อง หัวข้อ หรือสถานที่…" query={query} onQuery={setQuery}
      onClear={() => { setQuery(""); setSeverity("any"); setCategory("any"); setLocation("any") }}>
      <div className="w-full sm:w-40"><Choice label="ระดับความรุนแรง" value={severity} onChange={setSeverity} options={[all, ...labelOptions(severityLabels)]} /></div>
      <div className="w-full sm:w-48"><Choice label="ประเภทปัญหา" value={category} onChange={setCategory} options={[all, ...namedOptions(state.categories)]} /></div>
      <div className="w-full sm:w-48"><Choice label="สถานที่" value={location} onChange={setLocation} options={[all, ...namedOptions(state.locations)]} /></div>
    </ResultFilters>
    <Tabs defaultValue="active">
      <TabsList aria-label="กลุ่มสถานะเรื่อง"><TabsTrigger value="active" count={active.length}>เรื่องที่เปิดอยู่</TabsTrigger><TabsTrigger value="final" count={resolved.length}>แก้ไขเสร็จแล้ว</TabsTrigger></TabsList>
      <TabsContent value="active">{list(active)}</TabsContent>
      <TabsContent value="final">{list(resolved)}</TabsContent>
    </Tabs>
  </PageFrame>
}
