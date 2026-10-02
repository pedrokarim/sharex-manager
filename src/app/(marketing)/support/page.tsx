import { PageTransition } from "@/components/page-transition";
import { SupportPageClient } from "./page.client";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata({ title: "Support" });


export default function SupportPage() {
  return (
    <PageTransition>
      <SupportPageClient />
    </PageTransition>
  );
}
