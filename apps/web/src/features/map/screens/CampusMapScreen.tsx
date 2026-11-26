"use client"

import { useState } from "react"
import Link from "next/link"
import { List, Map as MapIcon, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CampusHeading } from "@/components/shared/CampusHeading"
import { Choice, labelOptions, loginLink, namedOptions, PageFrame } from "@/components/shared/Controls"
import { EmptyState } from "@/components/shared/EmptyState"
import { severityLabels, ticketStatusLabels } from "@/components/shared/Badges"
import { allResults, matchesSearch, ResultFilters } from "@/components/shared/ResultFilters"
import { TicketCard, ticketGrid } from "@/features/public-feed"
import { CampusMap } from "../components/CampusMap"
import { isActiveTicket, isExclusiveAdmin } from "@/lib/domain/permissions"
import { usePrototype } from "@/lib/store/PrototypeStore"
import type { TicketStatus } from "@/types/domain"

export default function CampusMapScreen() {
  const { state, user } = usePrototype()
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [severity, setSeverity] = useState("all")
  const [category, setCategory] = useState("all")
  if (!state) return null
  const tickets = state.tickets.filter(ticket => isActiveTicket(ticket.status))
  const categories = new Map(state.categories.map(item => [item.id, item.name]))
  const results = tickets.filter(item =>
    (status === "all" || item.status === status) &&
    (severity === "all" || item.severity === severity) &&
    (category === "all" || item.categoryId === category) &&
    matchesSearch(query, item.ticketNumber, item.title, item.summary, item.location.locationName, categories.get(item.categoryId)),
  )
  const ticket = results.find(item => item.id === selected)
  const statuses = labelOptions(ticketStatusLabels).filter(item => isActiveTicket(item.value as TicketStatus))

  return <PageFrame wide>
    <CampusHeading title="แผนที่ปัญหาวิทยาเขตบางเขน" context="มหาวิทยาลัยเกษตรศาสตร์ · วิทยาเขตบางเขน" stats={[
      { label: "เรื่องที่เปิดอยู่บนแผนที่", value: tickets.length },
      { label: "ความรุนแรงสูงหรือวิกฤต", value: tickets.filter(item => item.severity === "HIGH" || item.severity === "CRITICAL").length },
      { label: "พื้นที่ที่พบปัญหา", value: new Set(tickets.map(item => item.location.locationId ?? `${item.location.lat},${item.location.lng}`)).size },
    ]}>
      {!isExclusiveAdmin(user) && <Button asChild><Link href={user ? "/reports/new" : loginLink("/reports/new")}><Plus aria-hidden="true" /> แจ้งปัญหา</Link></Button>}
    </CampusHeading>
    <ResultFilters label="ค้นหาเรื่องบนแผนที่" placeholder="ค้นหาเลขเรื่อง หัวข้อ หรือสถานที่…" query={query} onQuery={setQuery}
      onClear={() => { setQuery(""); setStatus("all"); setSeverity("all"); setCategory("all"); setSelected(null) }}>
      <div className="w-full sm:w-40"><Choice label="สถานะเรื่อง" value={status} options={[allResults, ...statuses]} onChange={setStatus} /></div>
      <div className="w-full sm:w-36"><Choice label="ระดับความรุนแรง" value={severity} options={[allResults, ...labelOptions(severityLabels)]} onChange={setSeverity} /></div>
      <div className="w-full sm:w-52"><Choice label="ประเภทปัญหา" value={category}
        options={[allResults, ...namedOptions(state.categories.filter(item => item.isActive || tickets.some(ticket => ticket.categoryId === item.id)))]}
        onChange={setCategory} /></div>
    </ResultFilters>
    <Tabs defaultValue="map" className="min-w-0">
      <TabsList aria-label="รูปแบบการแสดงปัญหา"><TabsTrigger value="map"><MapIcon aria-hidden="true" /> แผนที่</TabsTrigger><TabsTrigger value="list" count={results.length}><List aria-hidden="true" /> รายการ</TabsTrigger></TabsList>
      <TabsContent value="map" className="campus-panel grid min-w-0 gap-4 p-3 sm:p-5">
        <CampusMap pins={results.map(item => ({ ...item.location, id: item.id, label: item.title }))} onSelect={setSelected} />
        {ticket && <div className="max-w-3xl" aria-live="polite"><TicketCard ticket={ticket} state={state} horizontal
          action={{ href: `/tickets/${ticket.ticketNumber}`, label: "ดูรายละเอียดเรื่อง", primary: true }} /></div>}
        {!results.length && <EmptyState title="ไม่พบเรื่องที่ตรงกับตัวกรอง" />}
      </TabsContent>
      <TabsContent value="list">
        {results.length ? <div className={ticketGrid}>{results.map(item => <TicketCard key={item.id} ticket={item} state={state} />)}</div>
          : <EmptyState title="ไม่พบเรื่องที่ตรงกับตัวกรอง" />}
      </TabsContent>
    </Tabs>
  </PageFrame>
}
