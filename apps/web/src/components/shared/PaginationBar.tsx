"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PageSize = 25 | 50 | 100;

export function PaginationBar({
  page,
  size,
  total,
  onPage,
  onSize,
}: {
  page: number;
  size: PageSize;
  total: number;
  onPage: (page: number) => void;
  onSize: (size: PageSize) => void;
}) {
  return (
    <nav aria-label="หน้ารายการ" className="flex flex-wrap items-center justify-between gap-3">
      <span aria-live="polite" className="text-muted-foreground">
        แสดง {total ? (page - 1) * size + 1 : 0}–{Math.min(page * size, total)} จาก {total} รายการ
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={String(size)}
          onValueChange={(value) => onSize(value === "100" ? 100 : value === "50" ? 50 : 25)}
        >
          <SelectTrigger aria-label="จำนวนรายการต่อหน้า">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {[25, 50, 100].map((count) => (
                <SelectItem key={count} value={String(count)}>
                  {count} รายการ
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="หน้าก่อนหน้า"
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={page * size >= total}
          onClick={() => onPage(page + 1)}
          aria-label="หน้าถัดไป"
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
