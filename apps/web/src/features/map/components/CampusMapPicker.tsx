"use client";

import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Choice, namedOptions } from "@/components/shared/Controls";
import { CampusMap } from "./CampusMap";
import { inCampus } from "@/lib/domain/validation";
import type { CampusLocation, ReportLocation } from "@/types/domain";

export function CampusMapPicker({
  locations,
  value,
  onChange,
  error,
  clearUnavailable = false,
}: {
  locations: CampusLocation[];
  value: ReportLocation | null;
  onChange: (value: ReportLocation) => void;
  error?: string;
  clearUnavailable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const options = locations.filter(
    (item) => (item.isActive && item.name.includes(query.trim())) || item.id === value?.locationId,
  );
  const label = value?.locationName ?? "";
  function pick(point: { lat: number; lng: number }) {
    const locationId = value?.locationId ?? null;
    const unavailable =
      clearUnavailable &&
      locationId &&
      !locations.some((item) => item.id === locationId && item.isActive);
    onChange({
      locationId: unavailable ? null : locationId,
      locationName: label || "จุดที่ปักหมุดในวิทยาเขตบางเขน",
      detailNote: value?.detailNote,
      lat: point.lat,
      lng: point.lng,
    });
  }
  return (
    <div className="grid gap-3">
      <Field>
        <FieldLabel htmlFor="campus-search">ค้นหาสถานที่ในวิทยาเขต</FieldLabel>
        <Input
          type="search"
          id="campus-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Field>
      <Choice
        label="สถานที่เกิดเหตุ"
        options={namedOptions(options)}
        value={value?.locationId ?? ""}
        onChange={(id) => {
          const item = locations.find((location) => location.id === id);
          if (item)
            onChange({
              locationId: id,
              locationName: item.name,
              lat: item.lat,
              lng: item.lng,
              detailNote: value?.detailNote,
            });
        }}
        error={error}
      />
      <CampusMap point={value && inCampus(value) ? value : undefined} onPoint={pick} />
      <Field>
        <FieldLabel htmlFor="place-note">จุดสังเกต ห้อง หรือชั้น (ถ้ามี)</FieldLabel>
        <Input
          id="place-note"
          value={value?.detailNote ?? ""}
          onChange={(event) =>
            onChange({
              locationId: value?.locationId ?? null,
              locationName: label,
              lat: value?.lat ?? 0,
              lng: value?.lng ?? 0,
              detailNote: event.target.value,
            })
          }
        />
        <FieldDescription aria-live="polite">
          {value && inCampus(value) ? (
            <Badge
              variant="outline"
              data-tone="success"
              className="max-w-full whitespace-normal tabular-nums"
            >
              <MapPin aria-hidden="true" /> พิกัด {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            </Badge>
          ) : (
            "เลือกสถานที่หรือปักหมุดในแผนที่"
          )}
        </FieldDescription>
      </Field>
    </div>
  );
}
