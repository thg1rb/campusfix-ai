"use client"

import { useEffect } from "react"
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet"
import { campusBounds } from "@/lib/domain/validation"
import type { CanvasProps } from "./CampusMap"

const center = { lat: 13.8476, lng: 100.5696 }
const bounds = [[campusBounds.south, campusBounds.west], [campusBounds.north, campusBounds.east]] as [[number, number], [number, number]]

function Interaction({ point, onPoint }: Pick<CanvasProps, "point" | "onPoint">) {
  const map = useMap()
  useEffect(() => { if (point) map.panTo(point, { animate: false }) }, [map, point])
  useEffect(() => {
    const controls = map.getContainer()
    for (const [selector, label] of [[".leaflet-control-zoom-in", "ขยายแผนที่"], [".leaflet-control-zoom-out", "ย่อแผนที่"]]) {
      const button = controls.querySelector(selector)
      button?.setAttribute("aria-label", label)
      button?.setAttribute("title", label)
    }
  }, [map])
  useMapEvents({ click: event => onPoint?.(event.latlng) })
  return null
}

export default function LeafletCanvas({ pins, point, onPoint, onSelect, onOffline }: CanvasProps) {
  return <MapContainer center={point ?? center} zoom={16} minZoom={14} maxBounds={bounds} scrollWheelZoom={false} attributionControl={false} className="h-full w-full">
    <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      eventHandlers={{ tileerror: onOffline }} />
    <Interaction point={point} onPoint={onPoint} />
    {pins.map(pin => <CircleMarker key={pin.id} center={pin} radius={8} pathOptions={{ color: "var(--color-brand)", fillColor: "var(--color-brand)", fillOpacity: 0.85 }}
      eventHandlers={{ click: () => onSelect?.(pin.id) }}><Tooltip>{pin.label}</Tooltip></CircleMarker>)}
    {point && <CircleMarker center={point} radius={9} pathOptions={{ color: "var(--color-brand)", fillColor: "var(--color-brand)", fillOpacity: 0.85 }} />}
  </MapContainer>
}
