"use client";

import { useState, type ReactNode } from "react";
import { ChartNoAxesColumnIncreasing, Table2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Pie,
  PieChart,
  usePlotArea,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/EmptyState";
import { ticketStatusLabels } from "@/components/shared/Badges";
import { AdminTable } from "./AdminTable";

type BreakdownRow = { id: string; label: string; count: number; reports?: number };

const statusColors: Record<string, string> = {
  CONFIRMED: "var(--chart-confirmed)",
  IN_PROGRESS: "var(--chart-in-progress)",
  WAITING_INFORMATION: "var(--chart-waiting)",
  RESOLVED: "var(--chart-resolved)",
};
const severityColors: Record<string, string> = {
  CRITICAL: "var(--chart-danger)",
  HIGH: "var(--chart-waiting)",
  MEDIUM: "var(--chart-medium)",
  LOW: "var(--chart-low)",
};
const countConfig = {
  count: { label: "จำนวนเรื่อง", color: "var(--chart-primary)" },
} satisfies ChartConfig;
const comparisonConfig = {
  ...countConfig,
  reports: { label: "จำนวนรายงาน", color: "var(--chart-secondary)" },
} satisfies ChartConfig;
const locationConfig = {
  count: { label: "จำนวนรายงาน", color: "var(--chart-location)" },
} satisfies ChartConfig;
const statusConfig: ChartConfig = Object.fromEntries(
  Object.entries(ticketStatusLabels).map(([id, label]) => [id, { label, color: statusColors[id] }]),
);
const thaiGraphemes = new Intl.Segmenter("th", { granularity: "grapheme" });
const number = new Intl.NumberFormat("th-TH-u-nu-latn");
const chartClass = "aspect-auto h-[280px] w-full min-w-0";
const tooltipClass = "max-w-52 whitespace-normal border-border bg-card";
const cursor = { fill: "#F1F5F9", radius: 4 };

function shorten(label: string, max: number) {
  const parts = [...thaiGraphemes.segment(label)].map((item) => item.segment);
  return parts.length <= max ? label : parts.slice(0, max).join("") + "…";
}

function DonutTotal({ total }: { total: number }) {
  const plot = usePlotArea();
  if (!plot) return null;
  const x = plot.x + plot.width / 2;
  const y = plot.y + plot.height / 2;
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      className="pointer-events-none"
    >
      <tspan x={x} y={y - 8} className="fill-foreground text-3xl font-semibold tabular-nums">
        {number.format(total)}
      </tspan>
      <tspan x={x} y={y + 16} className="fill-muted-foreground text-xs">
        เรื่องทั้งหมด
      </tspan>
    </text>
  );
}

function StatusChart({ rows }: { rows: BreakdownRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const data = rows.map((row) => ({ ...row, fill: statusColors[row.id] }));
  return (
    <ChartContainer
      config={statusConfig}
      className={chartClass + " [&_.recharts-sector]:stroke-white!"}
    >
      <PieChart accessibilityLayer aria-label="จำนวนเรื่องแยกตามสถานะ">
        <ChartTooltip
          content={<ChartTooltipContent className={tooltipClass} nameKey="id" hideLabel />}
        />
        <Pie
          data={data}
          dataKey="count"
          nameKey="id"
          innerRadius="55%"
          outerRadius="82%"
          paddingAngle={1}
          stroke="#FFFFFF"
          strokeWidth={2}
          isAnimationActive={false}
        />
        <DonutTotal total={total} />
        <ChartLegend
          content={
            <ChartLegendContent className="flex-wrap gap-x-3 gap-y-1 text-muted-foreground" />
          }
        />
      </PieChart>
    </ChartContainer>
  );
}

function CategoryChart({ rows }: { rows: BreakdownRow[] }) {
  return (
    <ChartContainer config={comparisonConfig} className={chartClass}>
      <BarChart
        accessibilityLayer
        aria-label="เปรียบเทียบจำนวนเรื่องและจำนวนรายงานตามประเภท"
        data={rows}
        margin={{ top: 12, right: 8, bottom: 2, left: 0 }}
      >
        <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={9}
          minTickGap={5}
          tickFormatter={(label) => shorten(label, 6)}
        />
        <YAxis width={32} allowDecimals={false} tickLine={false} axisLine={false} />
        <ChartTooltip cursor={cursor} content={<ChartTooltipContent className={tooltipClass} />} />
        <ChartLegend
          content={
            <ChartLegendContent className="flex-wrap gap-x-4 gap-y-1 text-muted-foreground" />
          }
        />
        <Bar
          dataKey="count"
          fill="var(--chart-primary)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          isAnimationActive={false}
        />
        <Bar
          dataKey="reports"
          fill="var(--chart-secondary)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  );
}

function RankingChart({ rows, location = false }: { rows: BreakdownRow[]; location?: boolean }) {
  const data = rows.map((row) => ({
    ...row,
    fill: location ? "var(--chart-location)" : severityColors[row.id],
  }));
  const max = Math.max(0, ...rows.map((row) => row.count));
  return (
    <ChartContainer config={location ? locationConfig : countConfig} className={chartClass}>
      <BarChart
        accessibilityLayer
        aria-label={location ? "จำนวนรายงานแยกตามสถานที่" : "จำนวนเรื่องแยกตามความรุนแรง"}
        data={data}
        layout="vertical"
        margin={{ top: 6, right: 15, bottom: 2, left: 0 }}
      >
        <CartesianGrid horizontal={false} stroke="#E2E8F0" strokeDasharray="3 3" />
        <XAxis
          type="number"
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          domain={[0, max + Math.max(1, Math.ceil(max * 0.12))]}
        />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={location ? 119 : 62}
          interval={0}
          tickFormatter={(label) => (location ? shorten(label, 16) : label)}
        />
        <ChartTooltip cursor={cursor} content={<ChartTooltipContent className={tooltipClass} />} />
        <Bar dataKey="count" radius={[0, 5, 5, 0]} maxBarSize={26} isAnimationActive={false}>
          <LabelList
            dataKey="count"
            position="right"
            className="fill-foreground text-xs tabular-nums"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function Breakdown({
  title,
  rows,
  empty,
  table,
  children,
  comparison = false,
  countLabel = "จำนวนเรื่อง",
}: {
  title: string;
  rows: BreakdownRow[];
  empty: boolean;
  table: boolean;
  children: ReactNode;
  comparison?: boolean;
  countLabel?: string;
}) {
  const headings = ["กลุ่ม", countLabel, ...(comparison ? ["จำนวนรายงาน"] : [])];
  return (
    <section className="campus-panel grid min-w-0 content-start gap-3 p-4 sm:p-5">
      <h3 className="text-lg leading-relaxed font-semibold">{title}</h3>
      {empty ? (
        <EmptyState title="ไม่มีข้อมูลในช่วงเวลานี้" />
      ) : table ? (
        <AdminTable label={title} headings={headings}>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-normal">{row.label}</TableCell>
              <TableCell className="tabular-nums">{row.count}</TableCell>
              {comparison && <TableCell className="tabular-nums">{row.reports ?? 0}</TableCell>}
            </TableRow>
          ))}
        </AdminTable>
      ) : (
        children
      )}
    </section>
  );
}

export function AdminBreakdowns({
  statuses,
  categories,
  severities,
  locations,
}: {
  statuses: BreakdownRow[];
  categories: BreakdownRow[];
  severities: BreakdownRow[];
  locations: BreakdownRow[];
}) {
  const [view, setView] = useState("chart");
  const table = view === "table";
  const noTickets = !statuses.some((row) => row.count > 0);
  const rankedLocations = locations.filter((row) => row.count > 0).slice(0, 7);
  return (
    <Tabs
      value={view}
      onValueChange={setView}
      className="grid min-w-0 gap-3"
      aria-label="รายละเอียดสถิติ"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>รายละเอียดสถิติ</h2>
        <TabsList aria-label="รูปแบบการแสดงสถิติ">
          <TabsTrigger value="chart">
            <ChartNoAxesColumnIncreasing size={18} aria-hidden="true" /> กราฟ
          </TabsTrigger>
          <TabsTrigger value="table">
            <Table2 size={18} aria-hidden="true" /> ตาราง
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value={view} key={view} className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Breakdown title="เรื่องแยกตามสถานะ" rows={statuses} empty={noTickets} table={table}>
          <StatusChart rows={statuses} />
        </Breakdown>
        <Breakdown
          title="เรื่องและรายงานแยกตามประเภท"
          rows={categories}
          empty={noTickets}
          table={table}
          comparison
        >
          <CategoryChart rows={categories} />
        </Breakdown>
        <Breakdown title="เรื่องแยกตามความรุนแรง" rows={severities} empty={noTickets} table={table}>
          <RankingChart rows={severities} />
        </Breakdown>
        <Breakdown
          title="รายงานแยกตามสถานที่"
          rows={locations}
          empty={!rankedLocations.length}
          table={table}
          countLabel="จำนวนรายงาน"
        >
          {locations.filter((row) => row.count > 0).length > rankedLocations.length && (
            <p className="text-sm text-muted-foreground">แสดง 7 สถานที่ที่มีรายงานมากที่สุด</p>
          )}
          <RankingChart rows={rankedLocations} location />
        </Breakdown>
      </TabsContent>
    </Tabs>
  );
}
