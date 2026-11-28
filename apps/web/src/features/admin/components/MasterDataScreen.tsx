"use client";

import { useCallback, useState } from "react";
import { Ban, Building2, CheckCircle2, MapPin, Pencil, PlusCircle, Tags } from "lucide-react";
import { toast } from "sonner";
import { ActionLabel, useActionFeedback } from "@/components/shared/ActionFeedback";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CampusHeading } from "@/components/shared/CampusHeading";
import { PaginationBar } from "@/components/shared/PaginationBar";
import { allResults, matchesSearch, ResultFilters } from "@/components/shared/ResultFilters";
import { usePagination } from "@/hooks/usePagination";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useLiveSession } from "@/features/auth/LiveSession";
import { identityErrorMessage } from "@/features/auth/authErrors";
import { ApiError } from "@/lib/api/client";
import { useApiResource } from "@/lib/api/useApiResource";
import {
  createAdminCategory,
  createAdminDepartment,
  createAdminLocation,
  listAdminCategories,
  listAdminDepartmentsPage,
  listAdminLocations,
  updateAdminCategory,
  updateAdminDepartment,
  updateAdminLocation,
} from "@/lib/api/masterdata";
import { AdminRequestStatus } from "./AdminRequestStatus";
import {
  AccountStatus,
  accountStats,
  adminContext,
  AdminTable,
  matchesStatus,
  statusOptions,
} from "./AdminTable";
import { Choice, ErrorNotice, labelOptions } from "@/components/shared/Controls";
import { TextField } from "@/components/shared/FormControls";
import { CampusMap } from "@/features/map";
import { usePrototype } from "@/lib/store/PrototypeStore";
import type { StoreAction } from "@/lib/store/mutations";
import type { CampusLocation, CampusLocationType, Category, Department } from "@/types/domain";

type MasterAction = Extract<StoreAction, { type: "master" }>;
type Collection = MasterAction["collection"];
type Item = Category | (Department & { staffUsernames?: string[] }) | CampusLocation;
type SaveResult = { ok: true } | { ok: false; message: string };
type SaveItem = (action: MasterAction, previous?: Item) => Promise<SaveResult>;

const listItems = {
  categories: listAdminCategories,
  departments: listAdminDepartmentsPage,
  locations: listAdminLocations,
};

function masterDataError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "NAME_TAKEN":
        return "ชื่อนี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น";
      case "COORDINATES_OUT_OF_BOUNDS":
        return "กรุณาระบุพิกัดภายในวิทยาเขตบางเขน";
      case "NOT_FOUND":
        return "ไม่พบรายการนี้ กรุณาโหลดข้อมูลใหม่";
    }
  }
  return identityErrorMessage(error);
}

function changedFields<T extends object>(input: T, previous: Partial<T>): Partial<T> {
  return Object.fromEntries(
    (Object.keys(input) as (keyof T)[])
      .filter((key) => input[key] !== previous[key])
      .map((key) => [key, input[key]]),
  ) as Partial<T>;
}

async function saveLive(action: MasterAction, previous?: Item) {
  const { item } = action;
  const status = previous && item.isActive !== previous.isActive ? { isActive: item.isActive } : {};
  switch (action.collection) {
    case "categories": {
      const input = { name: item.name, description: action.item.description };
      if (!previous) return createAdminCategory(input);
      const patch = { ...changedFields(input, previous), ...status };
      if (Object.keys(patch).length) return updateAdminCategory(item.id, patch);
      return;
    }
    case "departments": {
      const input = { name: item.name, responsibilityScope: action.item.responsibilityScope };
      if (!previous) return createAdminDepartment(input);
      const patch = { ...changedFields(input, previous), ...status };
      if (Object.keys(patch).length) return updateAdminDepartment(item.id, patch);
      return;
    }
    case "locations": {
      const { name, type, lat, lng } = action.item;
      const input = { name, type, lat, lng };
      if (!previous) return createAdminLocation(input);
      const patch = { ...changedFields(input, previous), ...status };
      if (Object.keys(patch).length) return updateAdminLocation(item.id, patch);
    }
  }
}

const nouns: Record<Collection, string> = {
  categories: "ประเภทปัญหา",
  departments: "หน่วยงาน",
  locations: "สถานที่",
};
const locationTypes: Record<CampusLocationType, string> = {
  BUILDING: "อาคาร",
  COMMON_AREA: "พื้นที่ส่วนกลาง",
  ROAD: "ถนน",
  ACTIVITY_PLAZA: "ลานกิจกรรม",
  SERVICE_POINT: "จุดบริการ",
  LANDMARK: "จุดสังเกต",
};

function masterAction(collection: Collection, item: Item): MasterAction {
  if (collection === "categories" && "description" in item)
    return { type: "master", collection, item };
  if (collection === "departments" && "responsibilityScope" in item)
    return { type: "master", collection, item };
  if (collection === "locations" && "lat" in item) return { type: "master", collection, item };
  throw new Error("Unexpected master data collection");
}

function ItemEditor({
  collection,
  item,
  saveItem,
  disabled,
}: {
  collection: Collection;
  item?: Item;
  saveItem: SaveItem;
  disabled?: boolean;
}) {
  const action = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [details, setDetails] = useState("");
  const [type, setType] = useState<CampusLocationType>("BUILDING");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [error, setError] = useState("");
  const noun = nouns[collection];
  const heading = item ? `แก้ไข${noun}` : `เพิ่ม${noun}`;

  function save() {
    if (
      collection === "locations" &&
      (!lat.trim() || !lng.trim() || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)))
    ) {
      setError("กรุณาระบุละติจูดและลองจิจูดเป็นตัวเลข");
      return;
    }
    const base = { id: item?.id ?? "", name: name.trim(), isActive: item?.isActive ?? true };
    const next =
      collection === "locations"
        ? { ...base, type, lat: Number(lat), lng: Number(lng) }
        : collection === "categories"
          ? { ...base, description: details.trim() }
          : { ...base, responsibilityScope: details.trim() };
    void action.run(
      () => saveItem(masterAction(collection, next), item),
      (result) => {
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setOpen(false);
        setError("");
        toast.success(`บันทึก${noun}แล้ว`);
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (action.pending) return;
        if (value) {
          setName(item?.name ?? "");
          setDetails(
            item && "description" in item
              ? item.description
              : item && "responsibilityScope" in item
                ? item.responsibilityScope
                : "",
          );
          setType(item && "type" in item ? item.type : "BUILDING");
          setLat(item && "lat" in item ? String(item.lat) : "");
          setLng(item && "lng" in item ? String(item.lng) : "");
        }
        setOpen(value);
        setError("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={item ? "outline" : "default"}
          disabled={disabled}
          aria-label={item ? `แก้ไข ${item.name}` : heading}
        >
          {item ? <Pencil aria-hidden="true" /> : <PlusCircle aria-hidden="true" />}
          {item ? "แก้ไข" : heading}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            {item ? item.name : `บันทึก${noun}สำหรับการทำงานในวิทยาเขตบางเขน`}
          </DialogDescription>
        </DialogHeader>
        <TextField label={`ชื่อ${noun}`} value={name} onChange={setName} required />
        {collection === "locations" ? (
          <>
            <Choice
              label="ประเภทสถานที่"
              value={type}
              onChange={(value) => setType(value as CampusLocationType)}
              options={labelOptions(locationTypes)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="ละติจูด" value={lat} onChange={setLat} required />
              <TextField label="ลองจิจูด" value={lng} onChange={setLng} required />
            </div>
            <CampusMap
              point={
                lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
                  ? { lat: Number(lat), lng: Number(lng) }
                  : undefined
              }
              onPoint={(point) => {
                setLat(point.lat.toFixed(6));
                setLng(point.lng.toFixed(6));
              }}
            />
          </>
        ) : (
          <TextField
            label={collection === "categories" ? "คำอธิบาย" : "ขอบเขตความรับผิดชอบ"}
            value={details}
            onChange={setDetails}
            multiline
          />
        )}
        {error && <ErrorNotice message={error} />}
        <DialogFooter>
          <Button onClick={save} disabled={action.pending}>
            <ActionLabel pending={action.pending}>บันทึก{noun}</ActionLabel>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleItem({
  item,
  collection,
  saveItem,
  disabled,
}: {
  item: Item;
  collection: Collection;
  saveItem: SaveItem;
  disabled: boolean;
}) {
  const action = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const label = item.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน";
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (action.pending) return;
        setError("");
        setOpen(value);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant={item.isActive ? "destructive" : "outline"}
          disabled={disabled}
          aria-label={`${label} ${item.name}`}
        >
          {item.isActive ? <Ban aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {label}
            {nouns[collection]}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {item.name} · ประวัติที่อ้างถึงรายการนี้จะยังแสดงได้
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <ErrorNotice message={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={action.pending}>กลับ</AlertDialogCancel>
          <AlertDialogAction
            disabled={action.pending}
            onClick={(event) => {
              event.preventDefault();
              setError("");
              void action.run(
                () =>
                  saveItem(masterAction(collection, { ...item, isActive: !item.isActive }), item),
                (result) => {
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setOpen(false);
                  toast.success(`${label}แล้ว`);
                },
              );
            }}
          >
            <ActionLabel pending={action.pending}>ยืนยัน{label}</ActionLabel>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const collectionIcons = { categories: Tags, departments: Building2, locations: MapPin };

export function MasterDataScreen({ collection }: { collection: Collection }) {
  const { state, dispatch, demoAvailable } = usePrototype();
  const { session } = useLiveSession();
  const admin = session.user;
  const live =
    session.status === "authenticated" &&
    admin !== null &&
    admin.isActive &&
    admin.departmentId === null &&
    admin.roles.length === 1 &&
    admin.roles[0] === "ADMINISTRATOR";
  const demo = session.status === "guest" && demoAvailable;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const debouncedQuery = useDebouncedValue(query.trim());
  const pager = usePagination(
    JSON.stringify([collection, live ? debouncedQuery : query, status, type]),
  );
  const { requestedPage, size, setPage } = pager;
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await listItems[collection](
        {
          page: requestedPage,
          pageSize: size,
          q: debouncedQuery,
          isActive: status === "all" ? undefined : status === "active",
          type:
            collection === "locations" && type !== "all" ? (type as CampusLocationType) : undefined,
        },
        signal,
      );
      if (!signal.aborted && requestedPage > 1 && result.items.length === 0) {
        setPage(Math.max(1, Math.min(requestedPage - 1, result.pagination.totalPages)));
      }
      return result;
    },
    [collection, debouncedQuery, requestedPage, size, status, type, setPage],
  );
  const request = useApiResource(load, live);
  const noun = nouns[collection];
  if (!live && (!demo || !state)) return null;
  const items: Item[] = demo ? (state?.[collection] ?? []) : [];
  const staff = new Map<string, string[]>();
  if (demo && state && collection === "departments") {
    for (const user of state.users) {
      if (user.departmentId) {
        const names = staff.get(user.departmentId) ?? [];
        names.push(user.username);
        staff.set(user.departmentId, names);
      }
    }
  }
  const demoPage = pager.current(
    items.filter(
      (item) =>
        matchesStatus(status, item.isActive) &&
        (type === "all" || ("type" in item && item.type === type)) &&
        matchesSearch(
          query,
          item.name,
          "description" in item ? item.description : undefined,
          "responsibilityScope" in item ? item.responsibilityScope : undefined,
          "type" in item ? locationTypes[item.type] : undefined,
          ...(staff.get(item.id) ?? []).map((name) => `@${name}`),
        ),
    ),
  );
  const remote = request.result;
  const remotePage = remote.status === "ready" ? remote.value : request.previousValue;
  const stale = live && remote.status !== "ready";
  const page =
    live && remotePage
      ? {
          items: remotePage.items,
          controls: pager.controls(remotePage.pagination.totalItems, remotePage.pagination.page),
        }
      : demoPage;

  const saveItem: SaveItem = async (action, previous) => {
    if (demo) {
      return dispatch(
        masterAction(collection, { ...action.item, id: action.item.id || crypto.randomUUID() }),
      );
    }
    try {
      await saveLive(action, previous);
      request.reload();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: masterDataError(error) };
    }
  };

  return (
    <>
      <CampusHeading
        title={`จัดการ${noun}`}
        context={adminContext}
        stats={demo ? accountStats(items) : undefined}
        icon={collectionIcons[collection]}
      >
        <ItemEditor collection={collection} saveItem={saveItem} />
      </CampusHeading>
      <ResultFilters
        label={`ค้นหา${noun}`}
        placeholder={`ค้นหาชื่อ${noun}…`}
        query={query}
        onQuery={(value) => {
          setQuery(value);
        }}
        onClear={() => {
          setQuery("");
          setStatus("all");
          setType("all");
        }}
      >
        <div className="w-full sm:w-48">
          <Choice
            label="สถานะการใช้งาน"
            value={status}
            options={statusOptions}
            onChange={(value) => {
              setStatus(value);
            }}
          />
        </div>
        {collection === "locations" && (
          <div className="w-full sm:w-48">
            <Choice
              label="ประเภทสถานที่"
              value={type}
              options={[allResults, ...labelOptions(locationTypes)]}
              onChange={(value) => {
                setType(value);
              }}
            />
          </div>
        )}
      </ResultFilters>
      {stale && <AdminRequestStatus request={remote} retry={request.reload} />}
      {(!live || remotePage) && (
        <div className="grid gap-4" aria-busy={request.isRefreshing}>
          <AdminTable
            label={noun}
            headings={[noun, "รายละเอียด", "สถานะ", "จัดการ"]}
            empty={!page.items.length ? `ไม่พบ${noun}ที่ตรงกับตัวกรอง` : undefined}
          >
            {page.items.map((item: Item) => {
              const staffNames =
                live && "responsibilityScope" in item
                  ? (item.staffUsernames ?? [])
                  : (staff.get(item.id) ?? []);
              return (
                <TableRow key={item.id}>
                  <TableCell className="min-w-36 whitespace-normal font-medium">
                    {item.name}
                  </TableCell>
                  <TableCell className="min-w-44 whitespace-normal">
                    {"description" in item ? (
                      item.description
                    ) : "responsibilityScope" in item ? (
                      <div className="grid gap-1.5">
                        <p>{item.responsibilityScope}</p>
                        <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                          <span>เจ้าหน้าที่</span>
                          {staffNames.map((name) => (
                            <Badge key={name} variant="outline" data-tone="teal">
                              @{name}
                            </Badge>
                          ))}
                          {!staffNames.length && <span>—</span>}
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-1.5">
                        <Badge variant="outline" data-tone="info">
                          {locationTypes[item.type]}
                        </Badge>
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                          <MapPin size={16} aria-hidden="true" />
                          {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <AccountStatus active={item.isActive} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <ItemEditor
                        collection={collection}
                        item={item}
                        saveItem={saveItem}
                        disabled={stale}
                      />
                      <ToggleItem
                        collection={collection}
                        item={item}
                        saveItem={saveItem}
                        disabled={stale}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </AdminTable>
          <PaginationBar {...page.controls} />
        </div>
      )}
    </>
  );
}
