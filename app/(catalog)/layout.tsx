import { CatalogNavbar } from "@/components/catalog/catalog-navbar";
import { CatalogFooter } from "@/components/catalog/catalog-footer";

export default function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <CatalogNavbar />
      <main className="flex-1">{children}</main>
      <CatalogFooter />
    </div>
  );
}

