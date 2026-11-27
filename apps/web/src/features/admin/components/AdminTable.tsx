import type { ReactNode } from "react";
import { Ban, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { allResults } from "@/components/shared/ResultFilters";

export const adminContext = "การจัดการระบบ · มหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตบางเขน";
export const statusOptions = [
  allResults,
  { value: "active", label: "เปิดใช้งาน" },
  { value: "inactive", label: "ปิดใช้งาน" },
];
export const matchesStatus = (status: string, active: boolean) =>
  status === "all" || (status === "active") === active;

export function accountStats(items: { isActive: boolean }[]) {
  const active = items.filter((item) => item.isActive).length;
  return [
    { label: "ทั้งหมด", value: items.length },
    { label: "เปิดใช้งาน", value: active },
    { label: "ปิดใช้งาน", value: items.length - active },
  ];
}

export function AccountStatus({ active }: { active: boolean }) {
  const Icon = active ? CheckCircle2 : Ban;
  return (
    <Badge variant="outline" data-tone={active ? "success" : "disabled"}>
      <Icon aria-hidden="true" /> {active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
    </Badge>
  );
}

export function AdminTable({
  label,
  headings,
  children,
  empty,
}: {
  label: string;
  headings: string[];
  children?: ReactNode;
  empty?: string;
}) {
  return (
    <div className="campus-panel min-w-0 overflow-hidden">
      <Table
        aria-label={label}
        scrollLabel={`เลื่อนตาราง${label}`}
        className="[&_td]:px-4 [&_td]:py-3 [&_th]:h-12 [&_th]:px-4"
      >
        <TableHeader className="bg-muted/60">
          <TableRow>
            {headings.map((heading) => (
              <TableHead key={heading} scope="col">
                {heading}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {empty ? (
            <TableRow>
              <TableCell
                colSpan={headings.length}
                className="whitespace-normal text-muted-foreground"
              >
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            children
          )}
        </TableBody>
      </Table>
    </div>
  );
}
