"use client";

import { useState } from "react";
import Link from "next/link";
import { HandHeart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { loginLink } from "@/components/shared/Controls";
import { usePrototype } from "@/lib/store/PrototypeStore";

export function AffectedToggleButton({
  active,
  marked,
  count,
  ticketId,
  ticketNumber,
}: {
  active: boolean;
  marked: boolean;
  count: number;
  ticketId: string;
  ticketNumber: string;
}) {
  const { user, dispatch } = usePrototype();
  const [pop, setPop] = useState(0);
  const label = marked && active ? "ยกเลิกการระบุว่าได้รับผลกระทบ" : "ฉันได้รับผลกระทบ";
  const content = (
    <>
      <HandHeart
        key={pop}
        className={pop ? "campus-pop" : undefined}
        fill={marked && active ? "currentColor" : "none"}
        aria-hidden="true"
      />
      <span>
        {label}{" "}
        <span key={count} className="campus-enter inline-block tabular-nums">
          ({count})
        </span>
      </span>
    </>
  );
  if (active && !user)
    return (
      <Button asChild>
        <Link href={loginLink(`/tickets/${ticketNumber}`)}>{content}</Link>
      </Button>
    );
  return (
    <Button
      className="transition-[scale]"
      disabled={!active}
      aria-pressed={marked}
      variant={marked ? "default" : "outline"}
      onClick={async () => {
        const result = await dispatch({ type: "affected", id: ticketId });
        if (result.ok) setPop((value) => value + 1);
        else toast.error(result.message);
      }}
    >
      {content}
    </Button>
  );
}
