import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HotNow: Know who to contact today. And why.",
  description:
    "HotNow finds companies going through changes that could make them need what you sell, and gives you a reason to reach out with the evidence behind it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
