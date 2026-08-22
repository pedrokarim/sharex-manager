import SecurityPageClient from "./page.client";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata({ title: "Sécurité" });


export default function SecurityPage() {
  return <SecurityPageClient />;
}
