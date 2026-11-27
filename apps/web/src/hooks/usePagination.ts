"use client";

import { useCallback, useState } from "react";
import type { PageSize } from "@/components/shared/PaginationBar";

export function usePagination(resetKey = "") {
  const [selection, setSelection] = useState({ key: resetKey, page: 1 });
  const requestedPage = selection.key === resetKey ? selection.page : 1;
  if (selection.key !== resetKey) setSelection({ key: resetKey, page: 1 });
  const setPage = useCallback((page: number) => setSelection({ key: resetKey, page }), [resetKey]);
  const [size, setSize] = useState<PageSize>(25);
  const reset = () => setPage(1);

  const controls = (total: number, page = requestedPage) => ({
    page,
    size,
    total,
    onPage: setPage,
    onSize: (nextSize: PageSize) => {
      setSize(nextSize);
      reset();
    },
  });

  function current<T>(items: T[]) {
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(items.length / size)));
    return {
      items: items.slice((page - 1) * size, page * size),
      controls: controls(items.length, page),
    };
  }

  return { current, reset, requestedPage, size, controls, setPage };
}
