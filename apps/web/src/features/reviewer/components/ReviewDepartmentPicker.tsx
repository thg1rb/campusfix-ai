import { useId, useRef, useState } from "react"
import { ChevronsUpDown, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import type { Department } from "@/types/domain"

export function ReviewDepartmentPicker({ options, selected, onChange, disabled }: {
  options: Department[]
  selected: string[]
  onChange: (ids: string[]) => void
  disabled: boolean
}) {
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [query, setQuery] = useState("")
  const matches = options.filter(item => item.name.toLowerCase().includes(query.trim().toLowerCase()))
  const chosen = options.filter(item => selected.includes(item.id))

  function remove(departmentId: string) {
    onChange(selected.filter(id => id !== departmentId))
  }

  return <Field className="min-w-0" data-disabled={disabled}>
    <FieldLabel id={`${id}-label`} htmlFor={id}>หน่วยงานที่แนะนำ</FieldLabel>
    <Popover onOpenChange={open => { if (!open) setQuery("") }}>
      <PopoverTrigger asChild>
        <Button ref={triggerRef} id={id} type="button" variant="outline" disabled={disabled}
          aria-labelledby={`${id}-label ${id}-count`} className="w-full min-w-0 justify-between text-start">
          <span id={`${id}-count`}>{chosen.length ? `เลือกแล้ว ${chosen.length} หน่วยงาน` : "เลือกหน่วยงาน"}</span>
          <ChevronsUpDown data-icon="inline-end" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" aria-labelledby={`${id}-title`}
        className="w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-content-available-width)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto">
        <PopoverTitle id={`${id}-title`}>เลือกหน่วยงาน</PopoverTitle>
        <Field>
          <FieldLabel htmlFor={`${id}-search`}>ค้นหาหน่วยงาน</FieldLabel>
          <Input id={`${id}-search`} type="search" name="department-search" autoComplete="off"
            value={query} onChange={event => setQuery(event.target.value)} placeholder="เช่น กองอาคารสถานที่…" />
        </Field>
        <div className="grid min-w-0 gap-2">
          {matches.map(item => <Label key={item.id} className="min-h-11 cursor-pointer rounded-lg border bg-card px-3 py-2 [overflow-wrap:anywhere]">
            <Checkbox checked={selected.includes(item.id)} onCheckedChange={checked =>
              checked ? onChange([...selected, item.id]) : remove(item.id)} />
            {item.name}
          </Label>)}
          {matches.length === 0 && <p role="status" className="text-muted-foreground">ไม่พบหน่วยงาน ลองใช้คำค้นอื่น</p>}
        </div>
      </PopoverContent>
    </Popover>
    {chosen.length > 0 && <ul aria-label="หน่วยงานที่เลือก" className="flex min-w-0 flex-wrap gap-2">
      {chosen.map(item => <li className="min-w-0 max-w-full" key={item.id}>
        <Badge variant="outline" data-tone="neutral" className="max-w-full gap-1.5 py-1 pl-3 pr-1 whitespace-normal">
          <span className="min-w-0 [overflow-wrap:anywhere]">{item.name}</span>
          <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`นำ ${item.name} ออก`}
            onClick={() => { remove(item.id); triggerRef.current?.focus() }}>
            <X aria-hidden="true" />
          </Button>
        </Badge>
      </li>)}
    </ul>}
  </Field>
}
