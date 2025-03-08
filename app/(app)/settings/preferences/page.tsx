import { Metadata } from "next";
import { PreferencesPageClient } from "./page.client";

export const metadata: Metadata = {
  title: "User Preferences | ShareX Manager",
  description: "Customize your display and feature preferences",
};

export default function PreferencesPage() {
  return <PreferencesPageClient />;
}
