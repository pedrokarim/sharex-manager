import { notFound, redirect } from "next/navigation";
import { privatePageMetadata } from "@/lib/seo";
import { accountPageData, adminSession } from "../data";
import { AccountPageClient } from "./page.client";

export const metadata = privatePageMetadata({ title: "Compte connecté" });

export default async function AccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  if (!(await adminSession())) redirect("/");
  const { accountId } = await params;
  const data = await accountPageData(accountId);
  if (!data) notFound();
  return <AccountPageClient initial={data} />;
}
