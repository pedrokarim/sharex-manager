import { MarketingNav } from "@/components/layout/marketing-nav";
import { Footer } from "@/components/layout/footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex flex-col">
      <MarketingNav />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
