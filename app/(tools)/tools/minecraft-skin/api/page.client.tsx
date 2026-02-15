"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Check, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface EndpointDoc {
  id: string;
  method: "GET" | "POST";
  path: string;
  title: string;
  description: string;
  params: { name: string; type: string; required: boolean; description: string }[];
  responseType: "JSON" | "PNG";
  exampleCurl: string;
  exampleResponse?: string;
}

const BASE_URL = "https://your-domain.com";

const endpoints: EndpointDoc[] = [
  {
    id: "player",
    method: "GET",
    path: "/api/tools/minecraft-skin/player",
    title: "Recherche joueur",
    description:
      "Recherche un joueur Minecraft par pseudo ou UUID. Retourne les informations du joueur incluant les URLs du skin et de la cape.",
    params: [
      {
        name: "username",
        type: "string",
        required: false,
        description: "Pseudo du joueur (ex: Notch). Requis si uuid non fourni.",
      },
      {
        name: "uuid",
        type: "string",
        required: false,
        description: "UUID du joueur (sans tirets). Requis si username non fourni.",
      },
    ],
    responseType: "JSON",
    exampleCurl: `curl "${BASE_URL}/api/tools/minecraft-skin/player?username=Notch"`,
    exampleResponse: JSON.stringify(
      {
        success: true,
        data: {
          uuid: "069a79f444e94726a5befca90e38aaf5",
          username: "Notch",
          skinUrl: "https://textures.minecraft.net/texture/...",
          capeUrl: null,
          isSlim: false,
        },
      },
      null,
      2
    ),
  },
  {
    id: "mchead",
    method: "GET",
    path: "/api/tools/minecraft-skin/mchead.png",
    title: "Rendu tete 2D",
    description:
      "Genere une image PNG de la tete du joueur en 2D. L'image est mise en cache cote serveur pendant 5 minutes.",
    params: [
      {
        name: "skin",
        type: "string",
        required: true,
        description: "UUID du joueur ou URL du skin.",
      },
      {
        name: "width",
        type: "number",
        required: false,
        description: "Largeur de l'image en pixels (defaut: 160).",
      },
      {
        name: "height",
        type: "number",
        required: false,
        description: "Hauteur de l'image en pixels (defaut: 160).",
      },
    ],
    responseType: "PNG",
    exampleCurl: `curl -o head.png "${BASE_URL}/api/tools/minecraft-skin/mchead.png?skin=069a79f444e94726a5befca90e38aaf5"`,
  },
  {
    id: "mcbody",
    method: "GET",
    path: "/api/tools/minecraft-skin/mcbody.png",
    title: "Rendu corps 3D",
    description:
      "Genere une image PNG du modele 3D complet du joueur. Supporte les rotations et le retournement.",
    params: [
      {
        name: "skin",
        type: "string",
        required: true,
        description: "UUID du joueur ou URL du skin.",
      },
      {
        name: "width",
        type: "number",
        required: false,
        description: "Largeur de l'image en pixels (defaut: 300).",
      },
      {
        name: "height",
        type: "number",
        required: false,
        description: "Hauteur de l'image en pixels (defaut: 400).",
      },
      {
        name: "theta",
        type: "number",
        required: false,
        description: "Rotation horizontale en degres.",
      },
      {
        name: "phi",
        type: "number",
        required: false,
        description: "Rotation verticale en degres.",
      },
      {
        name: "time",
        type: "number",
        required: false,
        description: "Temps d'animation (pour la pose).",
      },
      {
        name: "model",
        type: "string",
        required: false,
        description: '"slim" pour le modele Alex, "classic" pour Steve.',
      },
      {
        name: "flip",
        type: "boolean",
        required: false,
        description: "Retourner horizontalement l'image.",
      },
    ],
    responseType: "PNG",
    exampleCurl: `curl -o body.png "${BASE_URL}/api/tools/minecraft-skin/mcbody.png?skin=069a79f444e94726a5befca90e38aaf5&width=300&height=400"`,
  },
  {
    id: "mcskin",
    method: "GET",
    path: "/api/tools/minecraft-skin/mcskin.png",
    title: "Rendu skin 2D",
    description:
      "Genere une image PNG 2D du skin complet (avant du personnage a plat).",
    params: [
      {
        name: "skin",
        type: "string",
        required: true,
        description: "UUID du joueur ou URL du skin.",
      },
      {
        name: "width",
        type: "number",
        required: false,
        description: "Largeur de l'image en pixels.",
      },
      {
        name: "height",
        type: "number",
        required: false,
        description: "Hauteur de l'image en pixels.",
      },
    ],
    responseType: "PNG",
    exampleCurl: `curl -o skin.png "${BASE_URL}/api/tools/minecraft-skin/mcskin.png?skin=069a79f444e94726a5befca90e38aaf5"`,
  },
  {
    id: "mccape",
    method: "GET",
    path: "/api/tools/minecraft-skin/mccape.png",
    title: "Rendu cape",
    description:
      "Genere une image PNG de la cape du joueur. Retourne une erreur si le joueur n'a pas de cape.",
    params: [
      {
        name: "skin",
        type: "string",
        required: true,
        description: "UUID du joueur.",
      },
      {
        name: "width",
        type: "number",
        required: false,
        description: "Largeur de l'image en pixels.",
      },
      {
        name: "height",
        type: "number",
        required: false,
        description: "Hauteur de l'image en pixels.",
      },
    ],
    responseType: "PNG",
    exampleCurl: `curl -o cape.png "${BASE_URL}/api/tools/minecraft-skin/mccape.png?skin=069a79f444e94726a5befca90e38aaf5"`,
  },
  {
    id: "texture-skin",
    method: "GET",
    path: "/api/tools/minecraft-skin/texture/skin",
    title: "Texture skin brute",
    description:
      "Telecharge la texture PNG brute du skin (fichier 64x64 original de Minecraft).",
    params: [
      {
        name: "skin",
        type: "string",
        required: true,
        description: "UUID du joueur.",
      },
    ],
    responseType: "PNG",
    exampleCurl: `curl -o texture-skin.png "${BASE_URL}/api/tools/minecraft-skin/texture/skin?skin=069a79f444e94726a5befca90e38aaf5"`,
  },
  {
    id: "texture-cape",
    method: "GET",
    path: "/api/tools/minecraft-skin/texture/cape",
    title: "Texture cape brute",
    description:
      "Telecharge la texture PNG brute de la cape du joueur.",
    params: [
      {
        name: "skin",
        type: "string",
        required: true,
        description: "UUID du joueur.",
      },
    ],
    responseType: "PNG",
    exampleCurl: `curl -o texture-cape.png "${BASE_URL}/api/tools/minecraft-skin/texture/cape?skin=069a79f444e94726a5befca90e38aaf5"`,
  },
  {
    id: "namehistory",
    method: "GET",
    path: "/api/tools/minecraft-skin/namehistory",
    title: "Historique des noms",
    description:
      "Retourne l'historique des pseudos d'un joueur. Source: NameMC.",
    params: [
      {
        name: "uuid",
        type: "string",
        required: true,
        description: "UUID du joueur (sans tirets).",
      },
    ],
    responseType: "JSON",
    exampleCurl: `curl "${BASE_URL}/api/tools/minecraft-skin/namehistory?uuid=069a79f444e94726a5befca90e38aaf5"`,
    exampleResponse: JSON.stringify(
      {
        uuid: "069a79f444e94726a5befca90e38aaf5",
        source: "namemc",
        names: [
          { name: "Notch" },
        ],
      },
      null,
      2
    ),
  },
  {
    id: "recent",
    method: "GET",
    path: "/api/tools/minecraft-skin/recent",
    title: "Skins recemment recherches",
    description:
      "Retourne la liste des 50 derniers skins recherches sur le site, tries par date decroissante.",
    params: [],
    responseType: "JSON",
    exampleCurl: `curl "${BASE_URL}/api/tools/minecraft-skin/recent"`,
    exampleResponse: JSON.stringify(
      {
        success: true,
        skins: [
          {
            uuid: "069a79f444e94726a5befca90e38aaf5",
            username: "Notch",
            searchedAt: "2026-01-15T12:00:00.000Z",
            isSlim: false,
          },
        ],
      },
      null,
      2
    ),
  },
  {
    id: "featured",
    method: "GET",
    path: "/api/tools/minecraft-skin/featured",
    title: "Skins en vedette",
    description:
      "Retourne les skins populaires/trending. Scrapes depuis NameMC avec fallback sur une liste manuelle. Cache de 24h.",
    params: [],
    responseType: "JSON",
    exampleCurl: `curl "${BASE_URL}/api/tools/minecraft-skin/featured"`,
    exampleResponse: JSON.stringify(
      {
        success: true,
        skins: [
          { uuid: "069a79f444e94726a5befca90e38aaf5", username: "Notch" },
        ],
        source: "namemc",
        cachedAt: "2026-01-15T12:00:00.000Z",
      },
      null,
      2
    ),
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

function EndpointCard({ endpoint }: { endpoint: EndpointDoc }) {
  return (
    <Card id={endpoint.id}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 text-lg">
          <Badge
            className={
              endpoint.method === "GET"
                ? "bg-green-600 hover:bg-green-700"
                : "bg-blue-600 hover:bg-blue-700"
            }
          >
            {endpoint.method}
          </Badge>
          <code className="text-sm font-mono font-normal">{endpoint.path}</code>
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          {endpoint.description}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Parameters */}
        {endpoint.params.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Parametres</h4>
            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium">Nom</th>
                    <th className="text-left p-2 font-medium">Type</th>
                    <th className="text-left p-2 font-medium">Requis</th>
                    <th className="text-left p-2 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoint.params.map((param) => (
                    <tr key={param.name} className="border-b last:border-0">
                      <td className="p-2 font-mono text-xs">{param.name}</td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs">
                          {param.type}
                        </Badge>
                      </td>
                      <td className="p-2">
                        {param.required ? (
                          <Badge variant="destructive" className="text-xs">
                            Requis
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Optionnel
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {param.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Response type */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Reponse</h4>
          <Badge variant="outline">
            {endpoint.responseType === "PNG" ? "image/png" : "application/json"}
          </Badge>
        </div>

        {/* cURL example */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold">Exemple cURL</h4>
            <CopyButton text={endpoint.exampleCurl} />
          </div>
          <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto">
            <code>{endpoint.exampleCurl}</code>
          </pre>
        </div>

        {/* Example response */}
        {endpoint.exampleResponse && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Exemple de reponse</h4>
              <CopyButton text={endpoint.exampleResponse} />
            </div>
            <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-64">
              <code>{endpoint.exampleResponse}</code>
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MinecraftSkinApiDocClient() {
  return (
    <div className="container mx-auto p-4 md:p-6 max-w-6xl">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Sidebar / TOC */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-4">
            <Link
              href="/tools/minecraft-skin"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour au viewer
            </Link>
            <h3 className="text-sm font-semibold">Endpoints</h3>
            <nav className="space-y-1">
              {endpoints.map((ep) => (
                <a
                  key={ep.id}
                  href={`#${ep.id}`}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors py-1"
                >
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1 py-0 ${
                      ep.method === "GET"
                        ? "border-green-600 text-green-600"
                        : "border-blue-600 text-blue-600"
                    }`}
                  >
                    {ep.method}
                  </Badge>
                  <span className="truncate">{ep.title}</span>
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <div className="space-y-6">
          {/* Header */}
          <div className="lg:hidden mb-4">
            <Link
              href="/tools/minecraft-skin"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour au viewer
            </Link>
          </div>

          <div>
            <h1 className="text-3xl font-bold">Minecraft Skin API</h1>
            <p className="text-muted-foreground mt-2">
              API REST pour rechercher des joueurs Minecraft, generer des rendus
              de skins et telecharger des textures. Tous les endpoints sont
              accessibles publiquement sans authentification.
            </p>
            <div className="flex gap-2 mt-4">
              <Badge>REST API</Badge>
              <Badge variant="secondary">Public</Badge>
              <Badge variant="outline">Cache 5min</Badge>
            </div>
          </div>

          {/* Base URL */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-semibold mb-2">URL de base</h3>
              <pre className="bg-muted rounded-lg p-3 text-sm font-mono">
                <code>{`${BASE_URL}/api/tools/minecraft-skin`}</code>
              </pre>
              <p className="text-xs text-muted-foreground mt-2">
                Remplacez <code className="bg-muted px-1 rounded">your-domain.com</code> par
                le domaine de votre instance.
              </p>
            </CardContent>
          </Card>

          {/* Endpoints */}
          {endpoints.map((ep) => (
            <EndpointCard key={ep.id} endpoint={ep} />
          ))}
        </div>
      </div>
    </div>
  );
}
