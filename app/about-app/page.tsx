import { Metadata } from "next";
import { AboutPageClient } from "./page.client";

export const metadata: Metadata = {
  title: "À propos - ShareX Manager",
  description:
    "Découvrez l'équipe derrière ShareX Manager et notre vision pour simplifier la gestion de vos uploads.",
};

export default function AboutPage() {
  return <AboutPageClient />;
}
