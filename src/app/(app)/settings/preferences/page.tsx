import { Metadata } from "next";
import { PreferencesPageClient } from "./page.client";

export const metadata: Metadata = {
  title: "Préférences",
  description: "Personnalisez vos préférences d'affichage et de fonctionnalités",
};

export default function PreferencesPage() {
  return <PreferencesPageClient />;
}
