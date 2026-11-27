"use client";

import { FlaskConical, Mail, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { usePrototype } from "@/lib/store/PrototypeStore";
import { formatThaiDateTime } from "@/lib/format";

function EmailOutboxDrawer() {
  const { state, user, dispatch } = usePrototype();
  if (!state) return null;
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Mail aria-hidden="true" /> กล่องอีเมลจำลอง ({state.emailLogs.length})
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>กล่องอีเมลจำลอง</SheetTitle>
          <SheetDescription>รายการแจ้งเตือนจากเหตุการณ์สำคัญในระบบต้นแบบ</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-5">
          <Label className="min-h-11">
            <Switch
              checked={state.demoConfig.simulateEmailFailure}
              onCheckedChange={(value) =>
                dispatch({ type: "config", key: "simulateEmailFailure", value })
              }
            />{" "}
            จำลองการส่งอีเมลล้มเหลว
          </Label>
          {state.emailLogs.length === 0 && <p>ยังไม่มีอีเมลจำลอง</p>}
          {state.emailLogs.map((email) => (
            <article
              key={email.id}
              className="grid gap-1 rounded-lg border bg-card p-4 [overflow-wrap:anywhere]"
            >
              <h3 className="font-semibold">{email.subject}</h3>
              <p className="text-sm">{user ? email.recipientEmail : "ผู้แจ้งในเรื่องนี้"}</p>
              <p className="text-sm">{email.bodyPreview}</p>
              <p className="text-sm text-muted-foreground">
                {formatThaiDateTime(email.createdAt)} ·{" "}
                {email.status === "SENT" ? "ส่งแล้ว" : "ส่งไม่สำเร็จ"}
              </p>
              {email.status === "FAILED" && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    const result = await dispatch({ type: "retryEmail", id: email.id });
                    if (!result.ok) toast.error(result.message);
                    else if (state.demoConfig.simulateEmailFailure)
                      toast.error("ยังเปิดโหมดจำลองการส่งล้มเหลวอยู่");
                    else toast.success("ส่งอีเมลจำลองแล้ว");
                  }}
                >
                  ลองส่งอีเมลอีกครั้ง
                </Button>
              )}
            </article>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function DemoSimulationBar({ compact = false }: { compact?: boolean }) {
  const { state, user, dispatch } = usePrototype();
  if (!state) return null;
  return (
    <aside
      className={
        compact ? "border-t bg-[var(--color-brand-soft)]" : "sticky bottom-0 z-20 border-t bg-muted"
      }
    >
      <div
        className={
          compact
            ? "mx-auto flex max-w-[1360px] justify-end px-4 py-1.5"
            : "mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-2 px-4 py-1.5"
        }
      >
        {!compact && (
          <span className="hidden items-center gap-2 text-sm font-medium sm:flex">
            <FlaskConical size={18} aria-hidden="true" /> โหมดจำลอง Prototype
          </span>
        )}
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">
                <FlaskConical aria-hidden="true" className="sm:hidden" /> โหมดจำลอง{" "}
                <span className="hidden sm:inline">· เครื่องมือทดสอบ</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>โหมดจำลอง Prototype</SheetTitle>
                <SheetDescription>สำหรับทดสอบด้วยข้อมูลจำลอง</SheetDescription>
              </SheetHeader>
              <div className="mx-auto grid w-full max-w-2xl gap-4 px-4 pb-6">
                <div className="grid gap-2">
                  <Label htmlFor="demo-persona">สลับบัญชีทดสอบ</Label>
                  <Select
                    value={user?.id ?? "visitor"}
                    onValueChange={async (id) => {
                      const result = await dispatch({
                        type: "login",
                        userId: id === "visitor" ? null : id,
                      });
                      if (!result.ok) toast.error(result.message);
                    }}
                  >
                    <SelectTrigger id="demo-persona" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectGroup>
                        <SelectItem value="visitor">ผู้เยี่ยมชม (ไม่เข้าสู่ระบบ)</SelectItem>
                        {state.users
                          .filter((item) => item.isActive)
                          .map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              @{item.username}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <Label className="min-h-11">
                  <Switch
                    checked={state.demoConfig.simulateAiFailure}
                    onCheckedChange={(value) =>
                      dispatch({ type: "config", key: "simulateAiFailure", value })
                    }
                  />{" "}
                  จำลอง AI ล้มเหลว
                </Label>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const result = await dispatch({ type: "purge" });
                    if (result.ok) toast.success(`ล้างข้อมูลครบ 30 วันแล้ว ${result.data} รายงาน`);
                    else toast.error(result.message);
                  }}
                >
                  ล้างข้อมูลครบ 30 วัน
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline">
                      <RotateCcw aria-hidden="true" /> รีเซ็ตข้อมูลจำลอง
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>รีเซ็ตข้อมูลจำลอง</AlertDialogTitle>
                      <AlertDialogDescription>
                        การเปลี่ยนแปลงในเบราว์เซอร์นี้จะถูกแทนที่ด้วยข้อมูลเริ่มต้น
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          const result = await dispatch({ type: "reset" });
                          if (result.ok) toast.success("คืนค่าข้อมูลจำลองแล้ว");
                          else toast.error(result.message);
                        }}
                      >
                        ยืนยันรีเซ็ต
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </SheetContent>
          </Sheet>
          {!compact && <EmailOutboxDrawer />}
        </div>
      </div>
    </aside>
  );
}
