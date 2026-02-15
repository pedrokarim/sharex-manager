import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiModuleManager } from "@/lib/modules/module-manager.api";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    await apiModuleManager.ensureInitialized();

    const loadedModules = apiModuleManager.getAllLoadedModules();

    const items = loadedModules
      .filter((m) => m.config.navItems && m.config.navItems.length > 0)
      .flatMap((m) =>
        m.config.navItems!.map((navItem) => {
          const url = navItem.url || `/m/${m.name}`;

          // Generate sub-items from pages that have a non-empty path
          const subItems = (m.config.pages || [])
            .filter((page) => page.path !== "")
            .map((page) => ({
              title: page.title,
              url: `/m/${m.name}/${page.path}`,
            }));

          return {
            moduleName: m.name,
            title: navItem.title,
            url,
            icon: navItem.icon || "Puzzle",
            subItems,
          };
        })
      );

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching module nav items:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des items de navigation" },
      { status: 500 }
    );
  }
}
