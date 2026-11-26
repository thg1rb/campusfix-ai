"use client"

import { useId, type ReactNode } from "react"
import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "./EmptyState"
import { authLink, publicFeedPath, signInPath } from "@/features/auth"
import { googleSignInLabel } from "@/features/auth/authRoutes"
import { GoogleMark } from "@/features/auth/components/GoogleMark"

export type Option = { value: string; label: string }
export const namedOptions = (items: { id: string; name: string }[]): Option[] => items.map(item => ({ value: item.id, label: item.name }))
export const labelOptions = (items: Record<string, string>): Option[] => Object.entries(items).map(([value, label]) => ({ value, label }))

export function Choice({ label, value, options, onChange, disabled, placeholder = "กรุณาเลือก", error }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void; disabled?: boolean; placeholder?: string; error?: string
}) {
  const id = useId()
  return <Field className="min-w-0" data-invalid={!!error}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full min-w-0" aria-invalid={!!error} aria-describedby={error ? id + "-error" : undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper"><SelectGroup>
        {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectGroup></SelectContent>
    </Select>
    {error && <FieldError id={id + "-error"}>{error}</FieldError>}
  </Field>
}

export function ErrorNotice({ message }: { message: string }) {
  return <Alert variant="destructive" role="alert"><AlertCircle aria-hidden="true" /><AlertDescription>{message}</AlertDescription></Alert>
}

export function PageFrame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={wide ? "mx-auto grid max-w-[1360px] gap-6 px-4 py-7 sm:px-5 sm:py-9" : "mx-auto grid max-w-[1200px] gap-6 px-4 py-7 sm:px-5 sm:py-9"}>{children}</div>
}

export const loginLink = (path: string) => authLink(signInPath, path)

export function AccessNotice({ loggedIn, path }: { loggedIn: boolean; path: string }) {
  return <PageFrame><EmptyState title={loggedIn ? "คุณไม่มีสิทธิ์เข้าถึงหน้านี้" : "กรุณาเข้าสู่ระบบเพื่อดำเนินการ"}>
    <Button asChild><Link href={loggedIn ? publicFeedPath : loginLink(path)}>
      {loggedIn ? "กลับหน้าหลัก" : <><span className="grid size-7 shrink-0 place-items-center rounded-md bg-white"><GoogleMark /></span>{googleSignInLabel}</>}
    </Link></Button>
  </EmptyState></PageFrame>
}
