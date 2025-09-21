import { Metadata } from "next";
import { SupportPageClient } from "./page.client";

export const metadata: Metadata = {
  title: "Support - ShareX Manager",
  description: "Obtenez de l'aide et du support pour ShareX Manager",
};

export default function SupportPage() {
  return <SupportPageClient />;
}
