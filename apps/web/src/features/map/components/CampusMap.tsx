"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { campusBounds, inCampus } from "@/lib/domain/validation";
import "leaflet/dist/leaflet.css";

type Point = { lat: number; lng: number };
type Pin = Point & { id: string; label: string };

export interface CanvasProps {
  pins: Pin[];
  point?: Point;
  onPoint?: (point: Point) => void;
  onSelect?: (id: string) => void;
  onOffline: () => void;
}

const LeafletCanvas = dynamic(() => import("./LeafletCanvas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-muted text-muted-foreground" role="status">
      กำลังโหลดแผนที่…
    </div>
  ),
});
const { south, north, west, east } = campusBounds;
const position = (point: Point) => ({
  left: `${((point.lng - west) / (east - west)) * 100}%`,
  top: `${((north - point.lat) / (north - south)) * 100}%`,
});

export function CampusMap({
  pins = [],
  point,
  onPoint,
  onSelect,
}: Omit<CanvasProps, "onOffline" | "pins"> & { pins?: Pin[] }) {
  const [fallback, setFallback] = useState(false);
  const schematic = fallback || (typeof navigator !== "undefined" && !navigator.onLine);
  const addPoint = onPoint
    ? (value: Point) => {
        if (inCampus(value)) onPoint(value);
      }
    : undefined;
  return (
    <div className="grid min-w-0 gap-2">
      <div className="relative isolate h-64 w-full overflow-hidden rounded-xl border bg-muted sm:h-80">
        {schematic ? (
          <div className="relative h-full w-full">
            <svg
              viewBox="0 0 600 350"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full"
              aria-hidden="true"
            >
              <path fill="#e1f0e4" d="M0 0h600v350H0z" />
              <path
                stroke="#fff"
                strokeWidth="20"
                fill="none"
                d="M0 106h600M0 268h600M136 0v350M384 0v350M570 0v350M220 0l80 350"
              />
              <path
                fill="#86b8a1"
                d="M151 125h73v47h-73zm146 29h67v46h-67zm106-32h119v62H403zm-241 86h44v43h-44zm237-9h85v50h-85zm-77-166h43v52h-43zM39 121h64v112H39z"
              />
            </svg>
            {addPoint && (
              <Button
                variant="ghost"
                className="absolute inset-0 size-full rounded-none hover:bg-transparent"
                aria-label="ปักหมุดในแผนผัง"
                onClick={(event) => {
                  if (event.detail === 0) {
                    addPoint({ lat: 13.8476, lng: 100.5696 });
                    return;
                  }
                  const box = event.currentTarget.getBoundingClientRect();
                  addPoint({
                    lat: north - ((event.clientY - box.top) / box.height) * (north - south),
                    lng: west + ((event.clientX - box.left) / box.width) * (east - west),
                  });
                }}
              />
            )}
            {pins.map((pin) =>
              onSelect ? (
                <Button
                  key={pin.id}
                  variant="outline"
                  size="icon"
                  style={position(pin)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                  aria-label={pin.label}
                  onClick={() => onSelect(pin.id)}
                >
                  <MapPin aria-hidden="true" />
                </Button>
              ) : null,
            )}
            {point && (
              <MapPin
                style={position(point)}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-primary"
                aria-hidden="true"
              />
            )}
            <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-card px-2 py-1 text-xs">
              แผนผังวิทยาเขตบางเขน
            </span>
          </div>
        ) : (
          <LeafletCanvas
            pins={pins}
            point={point}
            onPoint={addPoint}
            onSelect={onSelect}
            onOffline={() => setFallback(true)}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3">
        <Button variant="outline" onClick={() => setFallback(!schematic)}>
          {schematic ? "ลองโหลดแผนที่ออนไลน์" : "ใช้แผนผังสำรอง"}
        </Button>
        {!schematic && (
          <a
            className="inline-flex min-h-11 items-center text-xs hover:underline"
            href="https://www.openstreetmap.org/copyright"
          >
            © OpenStreetMap
          </a>
        )}
      </div>
    </div>
  );
}
