"use client"

import { useState } from "react"
import { UserCog, Users } from "lucide-react"
import { toast } from "sonner"
import { ActionLabel, useActionFeedback } from "@/components/shared/ActionFeedback"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { TableCell, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { CampusHeading } from "@/components/shared/CampusHeading"
import { PaginationBar } from "@/components/shared/PaginationBar"
import { allResults, matchesSearch, ResultFilters } from "@/components/shared/ResultFilters"
import { usePagination } from "@/hooks/usePagination"
import { AccountStatus, accountStats, adminContext, AdminTable, matchesStatus, statusOptions } from "../components/AdminTable"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Choice, ErrorNotice, labelOptions, namedOptions } from "@/components/shared/Controls"
import { MultiChoice } from "@/components/shared/FormControls"
import { RoleBadge, roleLabels } from "@/features/auth"
import { usePrototype } from "@/lib/store/PrototypeStore"
import type { Role, User } from "@/types/domain"

const noDepartment = { value: "none", label: "ไม่สังกัดหน่วยงาน" }

function UserDialog({ person }: { person: User }) {
  const { state, dispatch } = usePrototype()
  const action = useActionFeedback()
  const [open, setOpen] = useState(false)
  const [roles, setRoles] = useState<string[]>(person.roles)
  const [departmentId, setDepartmentId] = useState(person.departmentId ?? "none")
  const [isActive, setActive] = useState(person.isActive)
  const [error, setError] = useState("")
  return <Dialog open={open} onOpenChange={value => {
    setOpen(value)
    if (value) { setRoles(person.roles); setDepartmentId(person.departmentId ?? "none"); setActive(person.isActive); setError("") }
  }}>
    <DialogTrigger asChild><Button variant="outline" aria-label={`แก้ไขสิทธิ์ @${person.username}`}><UserCog aria-hidden="true" /> แก้ไขสิทธิ์</Button></DialogTrigger>
    <DialogContent className="max-h-[85dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>แก้ไขสิทธิ์ @{person.username}</DialogTitle><DialogDescription>กำหนดบทบาท สถานะบัญชี และหน่วยงานที่สังกัด</DialogDescription></DialogHeader>
      <MultiChoice legend="บทบาท" options={labelOptions(roleLabels)} selected={roles} onChange={setRoles} />
      <Choice label="หน่วยงานที่สังกัด" options={[noDepartment, ...namedOptions(state?.departments.filter(item => item.isActive || item.id === person.departmentId) ?? [])]}
        value={departmentId} onChange={setDepartmentId} />
      <Label className="min-h-11"><Switch checked={isActive} onCheckedChange={setActive} /> เปิดใช้งานบัญชี</Label>
      {error && <ErrorNotice message={error} />}
      <DialogFooter><Button disabled={action.pending} onClick={() => {
        void action.run(() => dispatch({ type: "user", id: person.id, roles: roles as Role[], departmentId: departmentId === "none" ? null : departmentId, isActive }), result => {
          if (result.ok) { setOpen(false); toast.success("บันทึกสิทธิ์ผู้ใช้แล้ว") } else setError(result.message)
        })
      }}><ActionLabel pending={action.pending}>บันทึกสิทธิ์</ActionLabel></Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

export default function AdminUsersScreen() {
  const { state } = usePrototype()
  const [query, setQuery] = useState("")
  const [role, setRole] = useState("all")
  const [status, setStatus] = useState("all")
  const pager = usePagination()
  const users = state?.users ?? []
  const departments = new Map(state?.departments.map(item => [item.id, item.name]))
  const page = pager.current(users.filter(person => matchesStatus(status, person.isActive) &&
    (role === "all" || person.roles.some(value => value === role)) &&
    matchesSearch(query, `@${person.username}`, person.realName, person.roles.map(value => roleLabels[value]).join(" "),
      departments.get(person.departmentId ?? ""))))
  return <>
    <CampusHeading title="จัดการผู้ใช้และสิทธิ์" context={adminContext} stats={accountStats(users)} icon={Users} />
    <ResultFilters label="ค้นหาผู้ใช้" placeholder="ค้นหาชื่อผู้ใช้ ชื่อจริง หรือหน่วยงาน…" query={query}
      onQuery={value => { setQuery(value); pager.reset() }}
      onClear={() => { setQuery(""); setRole("all"); setStatus("all"); pager.reset() }}>
      <div className="w-full sm:w-52"><Choice label="บทบาท" value={role} options={[allResults, ...labelOptions(roleLabels)]}
        onChange={value => { setRole(value); pager.reset() }} /></div>
      <div className="w-full sm:w-48"><Choice label="สถานะบัญชี" value={status} options={statusOptions}
        onChange={value => { setStatus(value); pager.reset() }} /></div>
    </ResultFilters>
    <AdminTable label="ผู้ใช้และสิทธิ์" headings={["บัญชีผู้ใช้", "บทบาท", "หน่วยงาน", "สถานะ", "จัดการ"]}
      empty={!page.items.length ? "ไม่พบผู้ใช้ที่ตรงกับตัวกรอง" : undefined}>
      {page.items.map(person => <TableRow key={person.id}>
        <TableCell><div className="flex items-center gap-3 font-medium">
          <Avatar aria-hidden="true"><AvatarFallback className="bg-accent text-primary">{person.username.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
          <span>@{person.username}</span>
        </div></TableCell>
        <TableCell className="min-w-44 whitespace-normal"><div className="flex flex-wrap gap-1.5">
          {person.roles.map(role => <RoleBadge key={role} role={role} />)}
        </div></TableCell>
        <TableCell className="min-w-32 whitespace-normal">{departments.get(person.departmentId ?? "") ?? "—"}</TableCell>
        <TableCell><AccountStatus active={person.isActive} /></TableCell>
        <TableCell><UserDialog person={person} /></TableCell>
      </TableRow>)}
    </AdminTable>
    <PaginationBar {...page.controls} />
  </>
}
