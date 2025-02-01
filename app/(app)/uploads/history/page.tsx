import { HistoryPageClient } from "./page.client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Historique des uploads | ShareX Manager",
  description: "Historique des fichiers uploadés via ShareX",
};

export default function HistoryPage() {
  return <HistoryPageClient />;
} 