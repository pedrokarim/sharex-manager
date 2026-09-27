import { Metadata } from "next";
import { AboutPageClient } from "./page.client";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata({ title: "À propos de l'application" });


export default function AboutPage() {
  return <AboutPageClient />;
}
