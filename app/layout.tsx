import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RanchLine — Agricultural Fence Estimating",
  description: "Turn ranch parcel data into a clear agricultural fence plan, material takeoff, and customer-ready estimate.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
