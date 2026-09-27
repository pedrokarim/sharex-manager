import SystemPageClient from "./page.client";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata({ title: "Configuration système" });


export default function SystemPage() {
  return <SystemPageClient />;
}
