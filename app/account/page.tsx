import { Metadata } from "next";
import { AccountPageClient } from "./page.client";

export const metadata: Metadata = {
  title: "Mon compte - ShareX Manager",
  description: "Gérez vos informations personnelles et vos préférences",
};

export default function AccountPage() {
  return <AccountPageClient />;
}
