import {
  Activity,
  ChartNoAxesColumnIncreasing,
  ClipboardList,
  Clock,
  MapPinned,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const metricStyles = [
  { Icon: ClipboardList, tone: "info" },
  { Icon: Activity, tone: "teal" },
  { Icon: ChartNoAxesColumnIncreasing, tone: "success" },
  { Icon: MapPinned, tone: "violet" },
];

export function MetricGrid({ metrics }: { metrics: { label: string; value: string | number }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map(({ label, value }, index) => {
        const { Icon, tone } =
          typeof value === "string"
            ? { Icon: Clock, tone: "warning" }
            : metricStyles[index % metricStyles.length];
        return (
          <Card className="min-w-0 gap-3 rounded-2xl border py-4 shadow-xs ring-0" key={label}>
            <CardHeader className="px-4">
              <CardTitle className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground">
                <span
                  data-tone={tone}
                  className="grid size-9 shrink-0 place-items-center rounded-lg"
                >
                  <Icon size={17} aria-hidden="true" />
                </span>
                <dt>{label}</dt>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <dd className="text-2xl font-bold tabular-nums">{value}</dd>
            </CardContent>
          </Card>
        );
      })}
    </dl>
  );
}
