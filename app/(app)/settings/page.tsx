import { Metadata } from "next";
import { SettingsPageClient } from "./page.client";

export const metadata: Metadata = {
  title: "Settings | ShareX Manager",
  description: "Manage your ShareX Manager application settings",
};

export default function SettingsPage() {
  return <SettingsPageClient />;
}
