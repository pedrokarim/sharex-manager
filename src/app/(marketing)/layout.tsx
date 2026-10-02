import { frontDisplay } from "@/components/front/fonts";
import { SiteNav } from "@/components/front/site-nav";
import { Footer } from "@/components/layout/footer";
import { cn } from "@/lib/utils";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={cn(frontDisplay.variable, "relative flex min-h-screen flex-col")}>
      {/* Les apparitions partent d'un état invisible : sans JavaScript, on l'annule. */}
      <noscript>
        <style>{"[data-reveal]{opacity:1!important;transform:none!important}"}</style>
      </noscript>
      <SiteNav />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
