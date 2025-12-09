"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gamepad2, Palette, Wrench, Zap } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import Link from "next/link";

interface Tool {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "available" | "coming-soon" | "beta";
  href: string;
  category: string;
}

const getTools = (t: any): Tool[] => [
  {
    id: "minecraft-skin",
    title: t("tools.minecraft_skin.title"),
    description: t("tools.minecraft_skin.description"),
    icon: Gamepad2,
    status: "available",
    href: "/tools/minecraft-skin",
    category: "Gaming",
  },
  {
    id: "color-palette",
    title: "Color Palette Generator",
    description: "Générateur de palettes de couleurs à partir d'images",
    icon: Palette,
    status: "coming-soon",
    href: "/tools/color-palette",
    category: "Design",
  },
  {
    id: "image-converter",
    title: "Image Converter",
    description: "Convertisseur d'images avec support de nombreux formats",
    icon: Wrench,
    status: "coming-soon",
    href: "/tools/image-converter",
    category: "Media",
  },
  {
    id: "qr-generator",
    title: "QR Code Generator",
    description: "Générateur de codes QR personnalisables",
    icon: Zap,
    status: "coming-soon",
    href: "/tools/qr-generator",
    category: "Utility",
  },
];

const categories = ["All", "Gaming", "Design", "Media", "Utility"];

export function ToolsPageClient() {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState("All");

  const tools = getTools(t);
  const filteredTools =
    selectedCategory === "All"
      ? tools
      : tools.filter((tool) => tool.category === selectedCategory);

  const getStatusBadge = (status: Tool["status"]) => {
    switch (status) {
      case "available":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            Disponible
          </Badge>
        );
      case "beta":
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            Beta
          </Badge>
        );
      case "coming-soon":
        return (
          <Badge variant="outline" className="bg-gray-100 text-gray-600">
            Bientôt
          </Badge>
        );
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          {t("tools.title")}
        </h1>
        <p className="text-muted-foreground">{t("tools.description")}</p>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <Button
            key={category}
            variant={selectedCategory === category ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </Button>
        ))}
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Card key={tool.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{tool.title}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {tool.category}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(tool.status)}
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  {tool.description}
                </CardDescription>
                <Button
                  asChild
                  className="w-full"
                  disabled={tool.status === "coming-soon"}
                >
                  <Link href={tool.href}>
                    {tool.status === "coming-soon"
                      ? "Bientôt disponible"
                      : "Utiliser l'outil"}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredTools.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            Aucun outil trouvé dans cette catégorie.
          </p>
        </div>
      )}
    </div>
  );
}
