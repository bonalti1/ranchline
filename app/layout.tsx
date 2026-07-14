import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "ranchline-estimator.altomarketing90.chatgpt.site";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title: "RanchLine — Agricultural Fence Estimating",
    description: "Turn ranch parcel data into an editable fence plan, terrain-aware material takeoff, and customer-ready proposal.",
    openGraph: {
      title: "RanchLine",
      description: "From ranch to quote, without the guesswork.",
      type: "website",
      images: [{ url: imageUrl, width: 1733, height: 908, alt: "RanchLine ranch fence estimating" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "RanchLine",
      description: "From ranch to quote, without the guesswork.",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
