import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/api-guard";
import type { Metadata } from "next";
import { ConfigPageClient } from "./page.client";

export const metadata: Metadata = {
	title: "Configuration des uploads",
	description: "Configurez les paramètres de vos uploads ShareX",
};

export default async function ConfigPage() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session || !isAdmin(session)) redirect("/");
	return <ConfigPageClient />;
}
