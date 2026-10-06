import { CatalogNavbar } from "@/components/catalog/catalog-navbar";
import { frontDisplay } from "@/components/front/fonts";
import { Footer } from "@/components/layout/footer";
import { catalogSectionPath } from "@/lib/catalog-section-paths";
import { listVisibleCatalogSections } from "@/lib/modules/catalog-sections";
import { cn } from "@/lib/utils";

export default async function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Rubriques que les modules activés apportent au catalogue (`catalogSections`),
  // quand elles ont quelque chose à montrer. Le catalogue n'en connaît aucune.
  const sections = (await listVisibleCatalogSections()).map(({ section }) => ({
    href: catalogSectionPath(section.id),
    label: section.label,
  }));

  return (
    <div className={cn(frontDisplay.variable, "flex min-h-screen flex-col")}>
      {/* Les apparitions partent d'un état invisible : sans JavaScript, on l'annule. */}
      <noscript>
        <style>{"[data-reveal]{opacity:1!important;transform:none!important}"}</style>
      </noscript>
      <CatalogNavbar sections={sections} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
