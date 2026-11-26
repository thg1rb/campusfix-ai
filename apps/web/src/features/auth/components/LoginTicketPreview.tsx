"use client"

import Image from "next/image"
import { useEffect, useId, useRef, useState, useSyncExternalStore, type PointerEvent } from "react"
import { Images, MapPin } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { loginPreviewMocks } from "../data/loginPreviewMocks"

const interval = 4_500
const swipeThreshold = 56
const maxDrag = 22
const cardCount = loginPreviewMocks.length
const motionQuery = "(prefers-reduced-motion: reduce)"

type Direction = 1 | -1
type Deck = { index: number; outgoing: number | null; direction: Direction; announcement: string }
type Gesture = { id: number; x: number; y: number; axis?: "horizontal" | "vertical" }

function subscribeToMotionPreference(callback: () => void) {
  const query = window.matchMedia(motionQuery)
  query.addEventListener("change", callback)
  return () => query.removeEventListener("change", callback)
}

function readReducedMotion() {
  return window.matchMedia(motionQuery).matches
}

function selectCard(deck: Deck, offset: number, manual: boolean): Deck {
  const index = (deck.index + offset + cardCount) % cardCount
  if (index === deck.index) return deck

  return {
    index,
    outgoing: deck.index,
    direction: offset < 0 ? -1 : 1,
    announcement: manual ? `ตัวอย่างที่ ${index + 1} จาก ${cardCount} · ${loginPreviewMocks[index].title}` : "",
  }
}

export function LoginTicketPreview() {
  const [deck, setDeck] = useState<Deck>({ index: 0, outgoing: null, direction: 1, announcement: "" })
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [held, setHeld] = useState(false)
  const gesture = useRef<Gesture | null>(null)
  const hintId = useId()
  const reducedMotion = useSyncExternalStore(subscribeToMotionPreference, readReducedMotion, () => true)
  const autoAdvance = !reducedMotion && !hovered && !focused && !held

  useEffect(() => {
    if (!autoAdvance) return
    const timer = window.setTimeout(() => {
      if (!gesture.current) setDeck(current => selectCard(current, 1, false))
    }, interval)
    return () => window.clearTimeout(timer)
  }, [autoAdvance, deck.index])

  function hold(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0 || gesture.current) return
    if (event.pointerType === "mouse") event.preventDefault()
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
    setHeld(true)
  }

  function drag(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current
    if (!start || event.pointerId !== start.id) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!start.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 6) {
      start.axis = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical"
    }
    if (start.axis !== "horizontal" || reducedMotion) return

    const travel = maxDrag * Math.tanh(dx / (maxDrag * 2))
    event.currentTarget.style.setProperty("--preview-drag", `${travel}px`)
    event.currentTarget.style.setProperty("--preview-tilt", `${travel * .065}deg`)
  }

  function release(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current
    if (!start || event.pointerId !== start.id) return
    gesture.current = null
    const dx = event.clientX - start.x
    if (event.type === "pointerup" && start.axis === "horizontal" && Math.abs(dx) >= swipeThreshold) {
      const direction = dx < 0 ? 1 : -1
      setDeck(current => selectCard(current, direction, true))
    }
    setHeld(false)
    event.currentTarget.style.removeProperty("--preview-drag")
    event.currentTarget.style.removeProperty("--preview-tilt")
  }

  return (
    <section aria-label="ตัวอย่างรายงานปัญหาในวิทยาเขต · ข้อมูลจำลอง" aria-describedby={hintId} tabIndex={0}
      className="campus-preview-region grid min-w-0 gap-2 rounded-xl outline-offset-4"
      onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true) }}
      onPointerLeave={event => { if (event.pointerType === "mouse") setHovered(false) }}
      onFocusCapture={event => { setFocused(event.target.matches(":focus-visible")) }}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}
      onKeyDown={event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
        event.preventDefault()
        const direction = event.key === "ArrowLeft" ? -1 : 1
        setDeck(current => selectCard(current, direction, true))
      }}>
      <h2 className="flex items-start gap-2 text-sm font-semibold lg:text-white">
        <Images size={17} aria-hidden="true" className="mt-0.5 shrink-0" />
        ตัวอย่างรายงานปัญหาในวิทยาเขต · ข้อมูลจำลอง
      </h2>
      <div className="campus-preview-deck grid min-w-0 touch-pan-y cursor-grab select-none active:cursor-grabbing"
        data-direction={deck.direction} data-held={held || undefined} onPointerDown={hold} onPointerMove={drag}
        onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
        <div aria-hidden="true" className="campus-preview-backplates rounded-2xl" />
        {loginPreviewMocks.map((example, index) => {
          const active = index === deck.index
          return <Card key={example.id} data-active={active || undefined} data-outgoing={deck.outgoing === index || undefined}
            aria-hidden={!active || undefined}
            onTransitionEnd={event => {
              if (event.target === event.currentTarget && event.propertyName === "opacity") {
                setDeck(current => current.outgoing === index ? { ...current, outgoing: null } : current)
              }
            }}
            className="campus-preview-card min-w-0 gap-0 rounded-2xl border border-[var(--color-brand-border)] py-0 text-foreground shadow-md ring-0">
            <div className="relative aspect-video bg-muted">
              <Image src={example.image} fill unoptimized draggable={false} alt={example.alt}
                sizes="(min-width: 1024px) 540px, (min-width: 480px) 400px, 85vw"
                loading={index === 0 ? "eager" : "lazy"} className="object-cover" />
            </div>
            <div className="grid gap-1.5 p-3 sm:p-4">
              <p className="text-sm leading-relaxed font-semibold sm:text-base">{example.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{example.description}</p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                <p className="flex items-start gap-1 text-xs font-medium leading-relaxed text-muted-foreground">
                  <MapPin size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />{example.location}
                </p>
                <Badge variant="outline" data-tone={example.categoryTone} className="max-w-full whitespace-normal">{example.category}</Badge>
              </div>
            </div>
          </Card>
        })}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-2 lg:justify-between">
        <div className="flex" role="group" aria-label="เลือกตัวอย่างรายงาน">
          {loginPreviewMocks.map((example, index) => <Button key={example.id} type="button" variant="ghost" size="icon"
            aria-label={`แสดงตัวอย่างที่ ${index + 1}`} aria-current={deck.index === index ? "true" : undefined}
            className="campus-preview-dot hover:bg-transparent"
            onClick={() => setDeck(current => selectCard(current, index - current.index, true))}>
            <span aria-hidden="true" className="rounded-full" />
          </Button>)}
        </div>
        <p id={hintId} className="text-center text-xs leading-relaxed text-muted-foreground lg:text-white">
          ลากซ้าย-ขวาเพื่อสลับการ์ด · แตะค้างเพื่อหยุดชั่วคราว
          <span className="sr-only"> ใช้แป้นลูกศรซ้ายหรือขวาเพื่อเปลี่ยนตัวอย่าง</span>
        </p>
      </div>
      <p aria-live="polite" aria-atomic="true" className="sr-only">{deck.announcement}</p>
    </section>
  )
}
