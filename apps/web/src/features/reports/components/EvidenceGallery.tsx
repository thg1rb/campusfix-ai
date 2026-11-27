import Image from "next/image";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatFileSize } from "@/lib/format";
import type { ReportImage } from "@/types/domain";

export function EvidenceGallery({
  images,
  thumbnailAction,
}: {
  images: ReportImage[];
  thumbnailAction?: (image: ReportImage, index: number) => ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {images.map((image, index) => (
        <div key={image.id} className="campus-enter relative min-w-0">
          <Dialog>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                aria-label={`ดูรูปภาพที่ ${index + 1}`}
                className="relative aspect-[4/3] w-full overflow-hidden rounded-xl p-0"
              >
                <Image
                  unoptimized
                  src={image.url}
                  alt={image.alt}
                  fill
                  sizes="(min-width: 640px) 200px, 50vw"
                  className="object-cover"
                />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>รูปภาพที่ {index + 1}</DialogTitle>
                <DialogDescription className="flex min-w-0 flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]">
                  <span>{image.alt}</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                    ขนาดไฟล์ {formatFileSize(image.sizeBytes)}
                  </span>
                </DialogDescription>
              </DialogHeader>
              <div className="relative aspect-[4/3] max-h-[65dvh] rounded-xl bg-muted">
                <Image
                  unoptimized
                  src={image.url}
                  alt={image.alt}
                  fill
                  sizes="(min-width: 640px) 700px, 90vw"
                  className="object-contain"
                />
              </div>
            </DialogContent>
          </Dialog>
          {thumbnailAction?.(image, index)}
        </div>
      ))}
    </div>
  );
}
