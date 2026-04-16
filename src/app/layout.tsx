import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mac mini Availability Tracker",
  description: "Track Apple Mac mini M4 Pro availability across retailers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
