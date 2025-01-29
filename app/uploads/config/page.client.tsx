'use client';

import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarHeader } from "@/components/sidebar/sibebar-header";
import { SidebarInset } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { useUploadConfig } from "@/hooks/use-upload-config";

export function ConfigPageClient() {
  const {
    config,
    isLoading,
    isSaving,
    saveConfig,
  } = useUploadConfig();

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <AppSidebar />
        <SidebarInset>
          <SidebarHeader title="Configuration" />
          <main className="flex items-center justify-center flex-1">
            <Loader2 className="h-8 w-8 animate-spin" />
          </main>
        </SidebarInset>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <AppSidebar />
      <SidebarInset>
        <SidebarHeader title="Configuration" />
        
        <main className="p-8">
          <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">
                  Configuration des uploads
                </h1>
                <p className="text-muted-foreground">
                  Configurez les paramètres de vos uploads ShareX
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <Tabs defaultValue="general" className="space-y-4">
              <TabsList>
                <TabsTrigger value="general">Général</TabsTrigger>
                <TabsTrigger value="thumbnails">Miniatures</TabsTrigger>
                <TabsTrigger value="storage">Stockage</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Types de fichiers autorisés</CardTitle>
                    <CardDescription>
                      Définissez les types de fichiers qui peuvent être uploadés
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="images">Images (jpg, png, gif, webp)</Label>
                      <Switch
                        id="images"
                        checked={config.allowedTypes.images}
                        onCheckedChange={(checked) =>
                          saveConfig({
                            ...config,
                            allowedTypes: { ...config.allowedTypes, images: checked },
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="documents">Documents (pdf, doc, txt)</Label>
                      <Switch
                        id="documents"
                        checked={config.allowedTypes.documents}
                        onCheckedChange={(checked) =>
                          saveConfig({
                            ...config,
                            allowedTypes: { ...config.allowedTypes, documents: checked },
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="archives">Archives (zip, rar)</Label>
                      <Switch
                        id="archives"
                        checked={config.allowedTypes.archives}
                        onCheckedChange={(checked) =>
                          saveConfig({
                            ...config,
                            allowedTypes: { ...config.allowedTypes, archives: checked },
                          })
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Limites</CardTitle>
                    <CardDescription>
                      Configurez les limites pour les uploads
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="maxFileSize">Taille maximale (MB)</Label>
                      <Input
                        id="maxFileSize"
                        type="number"
                        value={config.maxFileSize}
                        onChange={(e) =>
                          saveConfig({
                            ...config,
                            maxFileSize: parseInt(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="filenamePattern">Format du nom de fichier</Label>
                      <Input
                        id="filenamePattern"
                        value={config.filenamePattern}
                        onChange={(e) =>
                          saveConfig({
                            ...config,
                            filenamePattern: e.target.value,
                          })
                        }
                      />
                      <p className="text-sm text-muted-foreground">
                        Variables disponibles: {"{timestamp}"}, {"{original}"}, {"{random}"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="thumbnails" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Configuration des miniatures</CardTitle>
                    <CardDescription>
                      Paramètres de génération des miniatures pour les images
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="thumbnails-enabled">Activer les miniatures</Label>
                      <Switch
                        id="thumbnails-enabled"
                        checked={config.thumbnails.enabled}
                        onCheckedChange={(checked) =>
                          saveConfig({
                            ...config,
                            thumbnails: { ...config.thumbnails, enabled: checked },
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="maxWidth">Largeur maximale (px)</Label>
                      <Input
                        id="maxWidth"
                        type="number"
                        value={config.thumbnails.maxWidth}
                        onChange={(e) =>
                          saveConfig({
                            ...config,
                            thumbnails: {
                              ...config.thumbnails,
                              maxWidth: parseInt(e.target.value),
                            },
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="maxHeight">Hauteur maximale (px)</Label>
                      <Input
                        id="maxHeight"
                        type="number"
                        value={config.thumbnails.maxHeight}
                        onChange={(e) =>
                          saveConfig({
                            ...config,
                            thumbnails: {
                              ...config.thumbnails,
                              maxHeight: parseInt(e.target.value),
                            },
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="quality">Qualité (0-100)</Label>
                      <Input
                        id="quality"
                        type="number"
                        min="0"
                        max="100"
                        value={config.thumbnails.quality}
                        onChange={(e) =>
                          saveConfig({
                            ...config,
                            thumbnails: {
                              ...config.thumbnails,
                              quality: parseInt(e.target.value),
                            },
                          })
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="storage" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Configuration du stockage</CardTitle>
                    <CardDescription>
                      Paramètres de stockage des fichiers uploadés
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="storagePath">Chemin de stockage</Label>
                      <Input
                        id="storagePath"
                        value={config.storage.path}
                        onChange={(e) =>
                          saveConfig({
                            ...config,
                            storage: { ...config.storage, path: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Structure des dossiers</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="flat"
                            value="flat"
                            checked={config.storage.structure === "flat"}
                            onChange={(e) =>
                              saveConfig({
                                ...config,
                                storage: {
                                  ...config.storage,
                                  structure: e.target.value as "flat" | "date" | "type",
                                },
                              })
                            }
                          />
                          <Label htmlFor="flat">Plat</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="date"
                            value="date"
                            checked={config.storage.structure === "date"}
                            onChange={(e) =>
                              saveConfig({
                                ...config,
                                storage: {
                                  ...config.storage,
                                  structure: e.target.value as "flat" | "date" | "type",
                                },
                              })
                            }
                          />
                          <Label htmlFor="date">Par date</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="type"
                            value="type"
                            checked={config.storage.structure === "type"}
                            onChange={(e) =>
                              saveConfig({
                                ...config,
                                storage: {
                                  ...config.storage,
                                  structure: e.target.value as "flat" | "date" | "type",
                                },
                              })
                            }
                          />
                          <Label htmlFor="type">Par type</Label>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </SidebarInset>
    </div>
  );
} 
