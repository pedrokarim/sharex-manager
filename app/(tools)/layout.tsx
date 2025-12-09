import { ToolsNav } from "@/components/layout/tools-nav";
import { Footer } from "@/components/layout/footer";

export default function ToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex flex-col">
      <ToolsNav />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
