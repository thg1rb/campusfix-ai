"use client";

import { useId, type ReactNode } from "react";
import { RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const allResults = { value: "all", label: "ทั้งหมด" };

export function matchesSearch(query: string, ...fields: (string | null | undefined)[]) {
  const needle = query.trim().normalize().toLocaleLowerCase("th");
  return (
    !needle || fields.some((value) => value?.normalize().toLocaleLowerCase("th").includes(needle))
  );
}

export function ResultFilters({
  query,
  onQuery,
  onClear,
  label,
  placeholder,
  children,
}: {
  query: string;
  onQuery: (value: string) => void;
  onClear: () => void;
  label: string;
  placeholder: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      className="campus-panel flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:p-4 md:flex-nowrap md:[&>div]:min-w-0"
      aria-label={`ตัวกรอง${label}`}
    >
      <div className="grid w-full min-w-0 gap-1.5 sm:w-auto sm:flex-[1_0_10rem]">
        <Label htmlFor={id}>{label}</Label>
        <div className="relative min-w-0">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={id}
            type="search"
            name="query"
            autoComplete="off"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder={placeholder}
            className="pl-10"
          />
        </div>
      </div>
      {children}
      <Button
        type="button"
        variant="outline"
        className="w-full sm:ms-auto sm:w-auto"
        onClick={onClear}
      >
        <RotateCcw aria-hidden="true" /> ล้างตัวกรอง
      </Button>
    </section>
  );
}
