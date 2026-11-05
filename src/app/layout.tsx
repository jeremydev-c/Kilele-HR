import type { Metadata } from "next";
import "./globals.css";
import { StaleDeployGuard } from "@/components/StaleDeployGuard";

export const metadata: Metadata = {
  title: { default: "Kilele HR", template: "%s · Kilele HR" },
  description: "ERP-style HR management: people, leave, recruitment, promotions and separation.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        {children}
        <StaleDeployGuard />
      </body>
    </html>
  );
}
