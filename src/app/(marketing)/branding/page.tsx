import type { Metadata } from "next";
import { PageTransition } from "@/components/page-transition";
import { BrandingPageClient } from "@/components/branding/branding-page.client";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Identité visuelle",
  description:
    "Logos, couleurs et règles d'usage de la marque ShareX Manager.",
  path: "/branding",
});


const Page = () => {
  return (
    <PageTransition>
      <BrandingPageClient />
    </PageTransition>
  );
};

export default Page;

