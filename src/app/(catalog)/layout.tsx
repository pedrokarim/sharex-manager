import { CatalogNavbar } from "@/components/catalog/catalog-navbar";
import { frontDisplay } from "@/components/front/fonts";
import { Footer } from "@/components/layout/footer";
import { cn } from "@/lib/utils";

export default function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={cn(frontDisplay.variable, "flex min-h-screen flex-col")}>
      {/* Les apparitions partent d'un état invisible : sans JavaScript, on l'annule. */}
      <noscript>
        <style>{"[data-reveal]{opacity:1!important;transform:none!important}"}</style>
      </noscript>
      <CatalogNavbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
