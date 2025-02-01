import { Metadata } from "next";
import { SettingsPageClient } from "./page.client";

export const metadata: Metadata = {
  title: "Paramètres | ShareX Manager",
  description: "Gérez les paramètres de votre application ShareX Manager",
};

export default function SettingsPage() {
  return <SettingsPageClient />;
}
