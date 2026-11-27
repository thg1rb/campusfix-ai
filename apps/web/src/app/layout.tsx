import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { AppShell } from "@/components/shared/AppShell";
import { PrototypeStoreProvider } from "@/lib/store/PrototypeStore";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { platformName, platformTagline } from "@/lib/brand";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  variable: "--font-noto-sans-thai",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: `${platformName} | มก. บางเขน`,
  description: `${platformName} — ${platformTagline} สำหรับมหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตบางเขน`,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" dir="ltr" className={notoSansThai.variable}>
      <body>
        <PrototypeStoreProvider>
          <TooltipProvider>
            <AppShell>{children}</AppShell>
            <Toaster />
          </TooltipProvider>
        </PrototypeStoreProvider>
      </body>
    </html>
  );
}
