import type { Metadata } from "next";
import { ConfigPageClient } from "./page.client";

export const metadata: Metadata = {
	title: "Configuration des uploads",
	description: "Configurez les paramètres de vos uploads ShareX",
};

export default function ConfigPage() {
	return <ConfigPageClient />;
}
