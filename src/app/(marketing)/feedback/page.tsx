import { PageTransition } from "@/components/page-transition";
import { FeedbackPageClient } from "./page.client";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata({ title: "Votre avis" });


export default function FeedbackPage() {
  return (
    <PageTransition>
      <FeedbackPageClient />
    </PageTransition>
  );
}
