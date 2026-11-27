"use client";

import { useState } from "react";
import Link from "next/link";
import { ListFilter, Map, Plus, Search } from "lucide-react";
import { CampusHeading } from "@/components/shared/CampusHeading";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Choice,
  labelOptions,
  loginLink,
  namedOptions,
  PageFrame,
} from "@/components/shared/Controls";
import { EmptyState } from "@/components/shared/EmptyState";
import { PaginationBar, type PageSize } from "@/components/shared/PaginationBar";
import { severityLabels, ticketStatusLabels } from "@/components/shared/Badges";
import { usePrototype } from "@/lib/store/PrototypeStore";
import { isExclusiveAdmin } from "@/lib/domain/permissions";
import type { PrototypeState } from "@/data/seed";
import { TicketCard, ticketGrid } from "../components/TicketCard";

const active = ["CONFIRMED", "IN_PROGRESS", "WAITING_INFORMATION"];
const blank = {
  statuses: active,
  severity: "any",
  category: "any",
  department: "any",
  location: "any",
  from: "",
  to: "",
};
type Filters = typeof blank;
const anyOption = { value: "any", label: "ทั้งหมด" };

function FilterFields({
  state,
  value,
  onChange,
}: {
  state: PrototypeState;
  value: Filters;
  onChange: (item: Filters) => void;
}) {
  return (
    <div className="grid gap-4">
      <fieldset className="flex flex-wrap gap-x-4">
        <legend className="mb-1 text-sm font-medium">สถานะเรื่อง</legend>
        {labelOptions(ticketStatusLabels).map(({ value: id, label }) => (
          <Label key={id} className="min-h-11">
            <Checkbox
              checked={value.statuses.includes(id)}
              onCheckedChange={(checked) =>
                onChange({
                  ...value,
                  statuses: checked
                    ? [...value.statuses, id]
                    : value.statuses.filter((status) => status !== id),
                })
              }
            />
            {label}
          </Label>
        ))}
      </fieldset>
      <div className="grid gap-3 min-[600px]:grid-cols-2 lg:grid-cols-3">
        <Choice
          label="ระดับความรุนแรง"
          options={[anyOption, ...labelOptions(severityLabels)]}
          value={value.severity}
          onChange={(severity) => onChange({ ...value, severity })}
        />
        <Choice
          label="ประเภทปัญหา"
          options={[anyOption, ...namedOptions(state.categories)]}
          value={value.category}
          onChange={(category) => onChange({ ...value, category })}
        />
        <Choice
          label="หน่วยงาน"
          options={[anyOption, ...namedOptions(state.departments)]}
          value={value.department}
          onChange={(department) => onChange({ ...value, department })}
        />
        <Choice
          label="สถานที่"
          options={[anyOption, ...namedOptions(state.locations)]}
          value={value.location}
          onChange={(location) => onChange({ ...value, location })}
        />
        <Label className="grid gap-2">
          ตั้งแต่วันที่
          <Input
            type="date"
            value={value.from}
            onChange={(event) => onChange({ ...value, from: event.target.value })}
          />
        </Label>
        <Label className="grid gap-2">
          ถึงวันที่
          <Input
            type="date"
            value={value.to}
            onChange={(event) => onChange({ ...value, to: event.target.value })}
          />
        </Label>
      </div>
    </div>
  );
}

export default function PublicFeedScreen() {
  const { state, user } = usePrototype();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(blank);
  const [desktopFilters, setDesktopFilters] = useState(false);
  const [size, setSize] = useState<PageSize>(25);
  const [page, setPage] = useState(1);
  if (!state) return null;

  const count =
    [filters.severity, filters.category, filters.department, filters.location].filter(
      (item) => item !== "any",
    ).length +
    Number(!!filters.from || !!filters.to) +
    Number(
      filters.statuses.length !== active.length ||
        !active.every((item) => filters.statuses.includes(item)),
    );
  const queryText = query.trim().toLowerCase();
  const results = state.tickets
    .filter((ticket) => {
      if (!filters.statuses.includes(ticket.status)) return false;
      if (filters.severity !== "any" && ticket.severity !== filters.severity) return false;
      if (filters.category !== "any" && ticket.categoryId !== filters.category) return false;
      if (
        filters.department !== "any" &&
        !ticket.departments.some((item) => item.departmentId === filters.department)
      )
        return false;
      if (filters.location !== "any" && ticket.location.locationId !== filters.location)
        return false;
      if (
        filters.from &&
        Date.parse(ticket.confirmedAt) < Date.parse(filters.from + "T00:00:00+07:00")
      )
        return false;
      if (
        filters.to &&
        Date.parse(ticket.confirmedAt) > Date.parse(filters.to + "T23:59:59.999+07:00")
      )
        return false;
      const category = state.categories.find((item) => item.id === ticket.categoryId)?.name ?? "";
      const departments = state.departments
        .filter((item) => ticket.departments.some((dept) => dept.departmentId === item.id))
        .map((item) => item.name);
      const descriptions = state.reports
        .filter((item) => item.status === "CONFIRMED" && item.ticketId === ticket.id)
        .map((item) => item.description);
      return [
        ticket.ticketNumber,
        ticket.title,
        ticket.summary,
        ticket.location.locationName,
        category,
        ...departments,
        ...descriptions,
      ].some((field) => field.toLowerCase().includes(queryText));
    })
    .toSorted((a, b) => b.confirmedAt.localeCompare(a.confirmedAt));
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(results.length / size)));
  function update(value: Filters) {
    setFilters(value);
    setPage(1);
  }
  function clear() {
    setQuery("");
    update(blank);
  }

  return (
    <PageFrame wide>
      <CampusHeading
        title="รายการปัญหาในมหาวิทยาลัย"
        context="มหาวิทยาลัยเกษตรศาสตร์ · วิทยาเขตบางเขน"
        stats={[
          {
            label: "เรื่องที่เปิดอยู่",
            value: state.tickets.filter((ticket) => active.includes(ticket.status)).length,
          },
          {
            label: "แก้ไขเสร็จแล้ว",
            value: state.tickets.filter((ticket) => ticket.status === "RESOLVED").length,
          },
          {
            label: "รายงานที่ยืนยันแล้ว",
            value: state.reports.filter((report) => report.status === "CONFIRMED").length,
          },
        ]}
      >
        <Button variant="outline" asChild>
          <Link href="/map">
            <Map aria-hidden="true" /> แผนที่ปัญหา
          </Link>
        </Button>
        {!isExclusiveAdmin(user) && (
          <Button asChild>
            <Link href={user ? "/reports/new" : loginLink("/reports/new")}>
              <Plus aria-hidden="true" /> แจ้งปัญหา
            </Link>
          </Button>
        )}
      </CampusHeading>
      <section className="campus-panel grid gap-4 p-3 sm:p-4" aria-label="ค้นหาและกรองรายการ">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full min-w-0 sm:flex-1">
            <Search
              size={19}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="ค้นหาปัญหา"
              placeholder="ค้นหาเลขเรื่อง หัวข้อ หรือสถานที่…"
              className="pl-10"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <Button
            variant="outline"
            className="hidden md:inline-flex"
            aria-expanded={desktopFilters}
            onClick={() => setDesktopFilters(!desktopFilters)}
          >
            <ListFilter aria-hidden="true" /> ตัวกรอง{count ? ` (${count})` : ""}
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto md:hidden">
                <ListFilter aria-hidden="true" /> ตัวกรอง{count ? ` (${count})` : ""}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>ตัวกรองรายการปัญหา</SheetTitle>
                <SheetDescription>รายการอัปเดตตามตัวกรองที่เลือก</SheetDescription>
              </SheetHeader>
              <div className="grid gap-4 px-4 pb-4">
                <FilterFields state={state} value={filters} onChange={update} />
                <Button variant="outline" className="w-full" onClick={clear}>
                  ล้างตัวกรอง
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        {desktopFilters && (
          <div className="hidden gap-4 md:grid">
            <FilterFields state={state} value={filters} onChange={update} />
            <Button variant="outline" className="justify-self-start" onClick={clear}>
              ล้างตัวกรอง
            </Button>
          </div>
        )}
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>
          {count ? "ผลการค้นหา" : "เรื่องที่เปิดอยู่"}{" "}
          <span className="text-sm text-muted-foreground">({results.length})</span>
        </h2>
        <p className="text-sm text-muted-foreground">เรียงตามเวลาที่ยืนยันล่าสุด</p>
      </div>
      {results.length ? (
        <div className={ticketGrid}>
          {results.slice((visiblePage - 1) * size, visiblePage * size).map((ticket, index) => (
            <TicketCard key={ticket.id} ticket={ticket} state={state} eager={index < 5} />
          ))}
        </div>
      ) : (
        <EmptyState title="ไม่พบรายการที่ตรงกับเงื่อนไข">
          <Button variant="outline" onClick={clear}>
            ล้างตัวกรอง
          </Button>
        </EmptyState>
      )}
      <PaginationBar
        page={visiblePage}
        size={size}
        total={results.length}
        onPage={setPage}
        onSize={(value) => {
          setSize(value);
          setPage(1);
        }}
      />
    </PageFrame>
  );
}
