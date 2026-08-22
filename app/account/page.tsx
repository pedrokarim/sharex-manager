import { Metadata } from "next";
import { AccountPageClient } from "./page.client";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata({ title: "Mon compte" });


export default function AccountPage() {
  return <AccountPageClient />;
}
