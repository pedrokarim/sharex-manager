import { PageTransition } from "@/components/page-transition";
import { AboutPageClient } from "./page.client";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata({ title: "À propos de l'application" });


export default function AboutPage() {
  return (
    <PageTransition>
      <AboutPageClient />
    </PageTransition>
  );
}
