"use client"

import { useId, useRef, useState } from "react"
import { ImagePlus, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { demoImage } from "@/data/seed"
import { imageError } from "@/lib/domain/validation"
import type { ReportImage } from "@/types/domain"
import { EvidenceGallery } from "./EvidenceGallery"

async function compactImage(file: File) {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Canvas unavailable")
    context.fillStyle = "#FFFFFF"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", 0.69)
  } finally { bitmap.close() }
}

export function ImageUploader({ images, onChange, error, optional = false }: {
  images: ReportImage[]; onChange: (images: ReportImage[]) => void; error?: string; optional?: boolean
}) {
  const id = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const pickButton = useRef<HTMLButtonElement>(null)
  const [localError, setLocalError] = useState("")
  const [busy, setBusy] = useState(false)
  const message = localError || error
  return <Field data-invalid={!!message}>
    <FieldLabel htmlFor={id}>รูปภาพประกอบ{optional ? " (ถ้ามี)" : ""}</FieldLabel>
    <FieldDescription id={id + "-hint"} className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" data-tone="neutral">.png / .jpg / .jpeg</Badge>
      <Badge variant="outline" data-tone="neutral">ไม่เกิน 10 MB ต่อภาพ</Badge>
      <span>สูงสุด 5 ภาพ</span>
    </FieldDescription>
    <Input ref={fileInput} id={id} type="file" hidden tabIndex={-1} accept="image/png,image/jpeg,.jpg,.jpeg,.png" multiple disabled={busy}
      aria-required={!optional} aria-invalid={!!message} aria-describedby={id + "-hint" + (message ? " " + id + "-error" : "")}
      onChange={async event => {
        const files = Array.from(event.target.files ?? [])
        event.target.value = ""
        if (!files.length) return
        const failure = files.map(file => imageError({ fileName: file.name, mimeType: file.type as ReportImage["mimeType"], sizeBytes: file.size })).find(Boolean)
        if (failure || files.length + images.length > 5) { setLocalError(failure ?? "แนบรูปภาพได้สูงสุด 5 ภาพ"); return }
        setBusy(true)
        setLocalError("")
        try {
          const additions = await Promise.all(files.map(async file => ({
            id: crypto.randomUUID(), fileName: file.name, mimeType: file.type as ReportImage["mimeType"], sizeBytes: file.size,
            url: await compactImage(file), alt: file.name,
          })))
          onChange([...images, ...additions])
        } catch { setLocalError("ไม่สามารถเปิดรูปภาพนี้ได้ กรุณาเลือกไฟล์ภาพใหม่") }
        finally { setBusy(false) }
      }} />
    {message && <FieldError id={id + "-error"} aria-live="polite">{message}</FieldError>}
    <div className="flex flex-wrap gap-2">
      <Button ref={pickButton} type="button" variant="outline" disabled={busy || images.length >= 5}
        aria-invalid={!!message} aria-describedby={id + "-hint" + (message ? " " + id + "-error" : "")}
        onClick={() => fileInput.current?.click()}><ImagePlus aria-hidden="true" /> เลือกรูปภาพ</Button>
      <Button type="button" variant="outline" disabled={busy || images.length >= 5} onClick={() => {
        setLocalError("")
        onChange([...images, { ...demoImage("walkway-light", "ภาพตัวอย่างเสาไฟทางเดิน"), id: crypto.randomUUID() }])
      }}>เพิ่มรูปตัวอย่างจำลอง</Button>
    </div>
    {busy && <p role="status" className="text-sm text-muted-foreground">กำลังเตรียมรูปภาพ…</p>}
    <p aria-live="polite" className="text-sm tabular-nums text-muted-foreground">แนบแล้ว {images.length} / 5 ภาพ</p>
    {images.length > 0 && <EvidenceGallery images={images} thumbnailAction={(image, index) =>
      <Button type="button" variant="outline" size="icon" aria-label={`ลบรูปภาพที่ ${index + 1}`} disabled={busy}
        className="absolute right-1.5 top-1.5 z-10 rounded-full"
        onClick={event => {
          event.stopPropagation()
          const restoreFocus = event.currentTarget.matches(":focus-visible")
          setLocalError("")
          onChange(images.filter(item => item.id !== image.id))
          if (restoreFocus) requestAnimationFrame(() => pickButton.current?.focus())
        }}>
        <X aria-hidden="true" />
      </Button>
    } />}
  </Field>
}
