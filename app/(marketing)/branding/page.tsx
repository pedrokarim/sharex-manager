import type { Metadata } from "next";
import { BrandingPageClient } from "@/components/branding/branding-page.client";

export const metadata: Metadata = {
  title: "Branding • ShareX Manager",
  description: "Identité visuelle, couleurs et composants de ShareX Manager.",
};

const Page = () => {
  return <BrandingPageClient />;
};

export default Page;

