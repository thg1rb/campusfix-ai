import { MapPinned } from "lucide-react";
import { platformName, platformTagline } from "@/lib/brand";

export function CampusPortalBrand() {
  return (
    <div className="flex min-w-0 items-center gap-3 text-white">
      <span className="grid size-12 shrink-0 place-items-center rounded-[.85rem] border border-white bg-white text-primary shadow-md">
        <MapPinned size={27} aria-hidden="true" />
      </span>
      <div className="grid min-w-0 gap-1.5">
        <p className="text-lg leading-tight font-bold" translate="no">
          {platformName}
        </p>
        <p lang="en" className="text-xs leading-relaxed text-pretty">
          {platformTagline}
        </p>
        <p className="w-fit rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-xs leading-relaxed backdrop-blur-sm">
          มหาวิทยาลัยเกษตรศาสตร์ · วิทยาเขตบางเขน
        </p>
      </div>
    </div>
  );
}

export function CampusPlan() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute right-0 bottom-0 w-[min(100%,39rem)] text-white opacity-[.08]"
      viewBox="0 0 440 440"
      fill="none"
    >
      <defs>
        <pattern id="campus-portal-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" stroke="currentColor" strokeWidth=".5" />
        </pattern>
      </defs>
      <rect width="440" height="440" fill="url(#campus-portal-grid)" />
      <g stroke="currentColor" strokeWidth="1.4">
        <path d="M229 440V229L440 18M246 440V236L440 42M144 440V298H440M144 310H440M318 440V125H440M333 440V140H440M0 374H440M0 387H440" />
        <path d="M255 320h52v43h-52zM186 320h31v44h-31zM347 324h68v39h-68zM348 395h66v38h-66zM349 158h67v55h-67zM349 228h42v55h-42zM402 235h23v48h-23zM264 244h42v41h-42zM160 219h49v65h-49zM153 395h63v38h-63z" />
        <path d="M270 307v-48m0 0h95m-95 0-80 85h-87" strokeDasharray="3 5" opacity=".8" />
      </g>
      <g stroke="#A7F3D0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <g transform="translate(365 259)">
          <circle className="campus-portal-pin-halo" r="14" opacity="0" />
          <path d="M0 9c-5-4.4-8-7.2-8-11a8 8 0 1 1 16 0c0 3.8-3 6.6-8 11Z" fill="#065F46" />
          <circle cy="-2" r="2.5" />
        </g>
        <g transform="translate(270 259)" className="[--pin-delay:160ms]">
          <circle className="campus-portal-pin-halo" r="14" opacity="0" />
          <path d="M0 9c-5-4.4-8-7.2-8-11a8 8 0 1 1 16 0c0 3.8-3 6.6-8 11Z" fill="#065F46" />
          <circle cy="-2" r="2.5" />
        </g>
        <g transform="translate(190 344)" className="[--pin-delay:320ms]">
          <circle className="campus-portal-pin-halo" r="14" opacity="0" />
          <path d="M0 9c-5-4.4-8-7.2-8-11a8 8 0 1 1 16 0c0 3.8-3 6.6-8 11Z" fill="#065F46" />
          <circle cy="-2" r="2.5" />
        </g>
      </g>
    </svg>
  );
}
