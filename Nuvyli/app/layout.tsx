import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nuvyli | Science-backed skincare, made simple",
  description: "Nuvyli brings science-backed, transparent skincare to your everyday routine.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
