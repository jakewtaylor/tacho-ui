import type { Metadata } from "next";
import "./globals.css";

const title = "TachoLens — see your tacho data clearly";
const description =
  "A local-first macOS app for EU driver-card tachograph downloads. Driving sessions, breaks, weekly summaries, and EU 561/2006 compliance — without uploading anything anywhere.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL("https://tacholens.com"),
  openGraph: {
    type: "website",
    title,
    description,
    url: "https://tacholens.com",
    siteName: "TachoLens",
    images: ["/appicon.png"],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/appicon.png"],
  },
  icons: {
    icon: "/appicon.png",
  },
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
