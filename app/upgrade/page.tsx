import { Metadata } from "next";
import { UpgradePageClient } from "./page.client";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata({ title: "Passer à l'offre supérieure" });


export default function UpgradePage() {
  return <UpgradePageClient />;
}
