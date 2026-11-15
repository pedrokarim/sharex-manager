import { privatePageMetadata } from "@/lib/seo";
import { CollectionsClient } from "./page.client";

export const metadata = privatePageMetadata({
  title: "Collections",
  description: "Des recherches enregistrées, recalculées à chaque ouverture.",
});

export default function CollectionsPage() {
  return <CollectionsClient />;
}
