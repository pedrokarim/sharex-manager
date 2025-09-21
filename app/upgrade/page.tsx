import { Metadata } from "next";
import { UpgradePageClient } from "./page.client";

export const metadata: Metadata = {
  title: "Upgrade Pro - ShareX Manager",
  description: "Découvrez les avantages de la version Pro de ShareX Manager",
};

export default function UpgradePage() {
  return <UpgradePageClient />;
}
