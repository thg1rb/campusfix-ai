"use client"

import { useState } from "react"
import { Ban, Building2, CheckCircle2, MapPin, Pencil, PlusCircle, Tags } from "lucide-react"
import { toast } from "sonner"
import { ActionLabel, useActionFeedback } from "@/components/shared/ActionFeedback"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { TableCell, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { CampusHeading } from "@/components/shared/CampusHeading"
import { PaginationBar } from "@/components/shared/PaginationBar"
import { allResults, matchesSearch, ResultFilters } from "@/components/shared/ResultFilters"
import { usePagination } from "@/hooks/usePagination"
import { AccountStatus, accountStats, adminContext, AdminTable, matchesStatus, statusOptions } from "./AdminTable"
import { Choice, ErrorNotice, labelOptions } from "@/components/shared/Controls"
import { TextField } from "@/components/shared/FormControls"
import { CampusMap } from "@/features/map"
import { usePrototype } from "@/lib/store/PrototypeStore"
import type { StoreAction } from "@/lib/store/mutations"
import type { CampusLocation, CampusLocationType, Category, Department } from "@/types/domain"

type MasterAction = Extract<StoreAction, { type: "master" }>
type Collection = MasterAction["collection"]
type Item = Category | Department | CampusLocation

const nouns: Record<Collection, string> = { categories: "ประเภทปัญหา", departments: "หน่วยงาน", locations: "สถานที่" }
const locationTypes: Record<CampusLocationType, string> = {
  BUILDING: "อาคาร", COMMON_AREA: "พื้นที่ส่วนกลาง", ROAD: "ถนน", ACTIVITY_PLAZA: "ลานกิจกรรม",
  SERVICE_POINT: "จุดบริการ", LANDMARK: "จุดสังเกต",
}

function masterAction(collection: Collection, item: Item): MasterAction {
  if (collection === "categories" && "description" in item) return { type: "master", collection, item }
  if (collection === "departments" && "responsibilityScope" in item) return { type: "master", collection, item }
  if (collection === "locations" && "lat" in item) return { type: "master", collection, item }
  throw new Error("Unexpected master data collection")
}

function ItemEditor({ collection, item }: { collection: Collection; item?: Item }) {
  const { dispatch } = usePrototype()
  const action = useActionFeedback()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(item?.name ?? "")
  const [details, setDetails] = useState(item && "description" in item ? item.description : item && "responsibilityScope" in item ? item.responsibilityScope : "")
  const [type, setType] = useState<CampusLocationType>(item && "type" in item ? item.type : "BUILDING")
  const [lat, setLat] = useState(String(item && "lat" in item ? item.lat : ""))
  const [lng, setLng] = useState(String(item && "lng" in item ? item.lng : ""))
  const [error, setError] = useState("")
  const noun = nouns[collection]
  const heading = item ? `แก้ไข${noun}` : `เพิ่ม${noun}`

  function save() {
    const base = { id: item?.id ?? crypto.randomUUID(), name, isActive: item?.isActive ?? true }
    const next = collection === "locations" ? { ...base, type, lat: Number(lat), lng: Number(lng) } :
      collection === "categories" ? { ...base, description: details.trim() } : { ...base, responsibilityScope: details.trim() }
    void action.run(() => dispatch(masterAction(collection, next)), result => {
      if (!result.ok) { setError(result.message); return }
      setOpen(false); setError(""); toast.success(`บันทึก${noun}แล้ว`)
      if (!item) { setName(""); setDetails(""); setType("BUILDING"); setLat(""); setLng("") }
    })
  }

  return <Dialog open={open} onOpenChange={value => { setOpen(value); setError("") }}>
    <DialogTrigger asChild><Button variant={item ? "outline" : "default"} aria-label={item ? `แก้ไข ${item.name}` : heading}>{item ? <Pencil aria-hidden="true" /> : <PlusCircle aria-hidden="true" />}{item ? "แก้ไข" : heading}</Button></DialogTrigger>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>{heading}</DialogTitle><DialogDescription>{item ? item.name : `บันทึก${noun}สำหรับการทำงานในวิทยาเขตบางเขน`}</DialogDescription></DialogHeader>
      <TextField label={`ชื่อ${noun}`} value={name} onChange={setName} required />
      {collection === "locations" ? <>
        <Choice label="ประเภทสถานที่" value={type} onChange={value => setType(value as CampusLocationType)} options={labelOptions(locationTypes)} />
        <div className="grid gap-3 sm:grid-cols-2"><TextField label="ละติจูด" value={lat} onChange={setLat} required /><TextField label="ลองจิจูด" value={lng} onChange={setLng} required /></div>
        <CampusMap point={lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : undefined}
          onPoint={point => { setLat(point.lat.toFixed(6)); setLng(point.lng.toFixed(6)) }} />
      </> : <TextField label={collection === "categories" ? "คำอธิบาย" : "ขอบเขตความรับผิดชอบ"} value={details} onChange={setDetails} multiline />}
      {error && <ErrorNotice message={error} />}
      <DialogFooter><Button onClick={save} disabled={action.pending}><ActionLabel pending={action.pending}>บันทึก{noun}</ActionLabel></Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

function ToggleItem({ item, collection }: { item: Item; collection: Collection }) {
  const { dispatch } = usePrototype()
  const label = item.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"
  return <AlertDialog>
    <AlertDialogTrigger asChild><Button variant={item.isActive ? "destructive" : "outline"} aria-label={`${label} ${item.name}`}>{item.isActive ? <Ban aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}{label}</Button></AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{label}{nouns[collection]}</AlertDialogTitle>
        <AlertDialogDescription>{item.name} · ประวัติที่อ้างถึงรายการนี้จะยังแสดงได้</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>กลับ</AlertDialogCancel><AlertDialogAction onClick={async () => {
        const result = await dispatch(masterAction(collection, { ...item, isActive: !item.isActive }))
        if (result.ok) toast.success(`${label}แล้ว`); else toast.error(result.message)
      }}>ยืนยัน{label}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}

const collectionIcons = { categories: Tags, departments: Building2, locations: MapPin }

export function MasterDataScreen({ collection }: { collection: Collection }) {
  const { state } = usePrototype()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [type, setType] = useState("all")
  const pager = usePagination()
  const noun = nouns[collection]
  if (!state) return null
  const items: Item[] = state[collection]
  const staff = new Map<string, string[]>()
  if (collection === "departments") {
    for (const user of state.users) {
      if (user.departmentId) {
        const names = staff.get(user.departmentId) ?? []
        names.push(user.username)
        staff.set(user.departmentId, names)
      }
    }
  }
  const page = pager.current(items.filter(item => matchesStatus(status, item.isActive) &&
    (type === "all" || ("type" in item && item.type === type)) &&
    matchesSearch(query, item.name, "description" in item ? item.description : undefined,
      "responsibilityScope" in item ? item.responsibilityScope : undefined,
      "type" in item ? locationTypes[item.type] : undefined, ...(staff.get(item.id) ?? []).map(name => `@${name}`))))
  return <>
    <CampusHeading title={`จัดการ${noun}`} context={adminContext} stats={accountStats(items)} icon={collectionIcons[collection]}>
      <ItemEditor collection={collection} />
    </CampusHeading>
    <ResultFilters label={`ค้นหา${noun}`} placeholder={`ค้นหาชื่อ${noun}…`} query={query}
      onQuery={value => { setQuery(value); pager.reset() }}
      onClear={() => { setQuery(""); setStatus("all"); setType("all"); pager.reset() }}>
      <div className="w-full sm:w-48"><Choice label="สถานะการใช้งาน" value={status} options={statusOptions}
        onChange={value => { setStatus(value); pager.reset() }} /></div>
      {collection === "locations" && <div className="w-full sm:w-48"><Choice label="ประเภทสถานที่" value={type} options={[allResults, ...labelOptions(locationTypes)]}
        onChange={value => { setType(value); pager.reset() }} /></div>}
    </ResultFilters>
    <AdminTable label={noun} headings={[noun, "รายละเอียด", "สถานะ", "จัดการ"]}
      empty={!page.items.length ? `ไม่พบ${noun}ที่ตรงกับตัวกรอง` : undefined}>
      {page.items.map(item => <TableRow key={item.id}>
        <TableCell className="min-w-36 whitespace-normal font-medium">{item.name}</TableCell>
        <TableCell className="min-w-44 whitespace-normal">
          {"description" in item ? item.description :
            "responsibilityScope" in item ? <div className="grid gap-1.5">
              <p>{item.responsibilityScope}</p>
              <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                <span>เจ้าหน้าที่</span>
                {(staff.get(item.id) ?? []).map(name => <Badge key={name} variant="outline" data-tone="teal">@{name}</Badge>)}
                {!staff.get(item.id)?.length && <span>—</span>}
              </div>
            </div> : <div className="grid gap-1.5">
              <Badge variant="outline" data-tone="info">{locationTypes[item.type]}</Badge>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                <MapPin size={16} aria-hidden="true" />{item.lat.toFixed(4)}, {item.lng.toFixed(4)}
              </span>
            </div>}
        </TableCell>
        <TableCell><AccountStatus active={item.isActive} /></TableCell>
        <TableCell><div className="flex gap-2"><ItemEditor key={`${item.id}:${item.name}`} collection={collection} item={item} /><ToggleItem collection={collection} item={item} /></div></TableCell>
      </TableRow>)}
    </AdminTable>
    <PaginationBar {...page.controls} />
  </>
}
