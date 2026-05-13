import type { Metadata } from "next";
import "@tacholens/ui/globals.css";

export const metadata: Metadata = {
  title: "TachoLens — see your tacho data clearly",
  description:
    "A macOS desktop app for inspecting EU driver-card tachograph downloads. Compliance analysis, weekly summaries, GNSS map.",
  metadataBase: new URL("https://tacholens.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
