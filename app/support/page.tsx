import { Metadata } from "next";
import { SupportPageClient } from "./page.client";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata({ title: "Support" });


export default function SupportPage() {
  return <SupportPageClient />;
}
