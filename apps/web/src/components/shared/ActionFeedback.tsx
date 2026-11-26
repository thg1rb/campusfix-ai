"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { LoaderCircle } from "lucide-react"
import type { ReactNode } from "react"

export function useActionFeedback() {
  const running = useRef(false)
  const [pending, setPending] = useState(false)

  async function run<T>(action: () => T | Promise<T>, finish: (result: T) => void, announce = false) {
    if (running.current) return
    running.current = true
    setPending(true)
    const notice = announce ? toast.loading("กำลังบันทึก…") : undefined
    try {
      const result = await action()
      await new Promise(resolve => setTimeout(resolve, 170))
      if (notice !== undefined) toast.dismiss(notice)
      finish(result)
    } finally {
      if (notice !== undefined) toast.dismiss(notice)
      running.current = false
      setPending(false)
    }
  }

  return { pending, run }
}

export function ActionLabel({ pending, children }: { pending: boolean; children: ReactNode }) {
  if (!pending) return children
  return <><LoaderCircle className="campus-spinner animate-spin" aria-hidden="true" /><span role="status">กำลังบันทึก…</span></>
}
