import { ErrorNotice } from "@/components/shared/Controls";
import { Button } from "@/components/ui/button";
import { identityErrorMessage } from "@/features/auth/authErrors";

export function AdminRequestStatus({
  request,
  retry,
}: {
  request: { status: "error"; error: unknown } | { status: "loading" };
  retry: () => void;
}) {
  if (request.status === "loading") return <p role="status">กำลังโหลดข้อมูล…</p>;
  return (
    <div className="grid justify-items-start gap-3">
      <ErrorNotice message={identityErrorMessage(request.error)} />
      <Button variant="outline" onClick={retry}>
        ลองอีกครั้ง
      </Button>
    </div>
  );
}
