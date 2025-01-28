"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Key,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Info,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { ApiKey } from "@/types/api-key";
import { CreateApiKeyDialog } from "@/components/api-keys/create-api-key-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { SidebarHeader } from "@/components/sidebar/sibebar-header";
import { ApiKeyDetailsDialog } from "@/components/api-keys/api-key-details-dialog";

export default function ApiKeysPage() {
  const { data: session, status } = useSession();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [selectedKeyForDetails, setSelectedKeyForDetails] =
    useState<ApiKey | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      redirect("/login");
    }

    fetchKeys();
  }, [status]);

  const fetchKeys = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/api-keys");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setKeys(data);
    } catch (error) {
      toast.error("Erreur lors du chargement des clés");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/api-keys/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error();

      toast.success("Clé supprimée avec succès");
      fetchKeys();
    } catch (error) {
      toast.error("Erreur lors de la suppression");
    } finally {
      setSelectedKeyId(null);
    }
  };

  const copyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("Clé copiée dans le presse-papier");
  };

  return (
    <>
      <div className="flex flex-1">
        <AppSidebar />
        <SidebarInset>
          <SidebarHeader showSearch={false} />
          <div className="container mx-auto py-8">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Clés API</h1>
                <p className="text-muted-foreground">
                  Gérez vos clés API pour l'upload via ShareX
                </p>
              </div>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nouvelle clé
              </Button>
            </div>

            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Clé</TableHead>
                    <TableHead>Créée le</TableHead>
                    <TableHead>Expire le</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Dernière utilisation</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <div className="flex flex-col items-center justify-center gap-2 py-8">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          <p className="text-sm text-muted-foreground">
                            Chargement des clés API...
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : keys.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                          <Key className="h-12 w-12 text-muted-foreground" />
                          <h3 className="mt-4 text-lg font-semibold">
                            Aucune clé API
                          </h3>
                          <p className="mb-4 text-sm text-muted-foreground">
                            Vous n'avez pas encore créé de clé API. Commencez
                            par en créer une pour utiliser ShareX.
                          </p>
                          <Button onClick={() => setShowCreateDialog(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Créer une clé
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    keys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">
                          <Button
                            variant="link"
                            className="p-0"
                            onClick={() => setSelectedKeyForDetails(key)}
                          >
                            {key.name}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-muted px-2 py-1">
                              {showKey === key.id ? key.key : "••••••••"}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setShowKey(showKey === key.id ? null : key.id)
                              }
                            >
                              {showKey === key.id ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => copyToClipboard(key.key)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {format(new Date(key.createdAt), "dd/MM/yyyy", {
                            locale: fr,
                          })}
                        </TableCell>
                        <TableCell>
                          {key.expiresAt
                            ? format(new Date(key.expiresAt), "dd/MM/yyyy", {
                                locale: fr,
                              })
                            : "Jamais"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {key.permissions.uploadImages && (
                              <Badge variant="secondary">Images</Badge>
                            )}
                            {key.permissions.uploadText && (
                              <Badge variant="secondary">Texte</Badge>
                            )}
                            {key.permissions.uploadFiles && (
                              <Badge variant="secondary">Fichiers</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {key.lastUsed
                            ? format(
                                new Date(key.lastUsed),
                                "dd/MM/yyyy HH:mm",
                                {
                                  locale: fr,
                                }
                              )
                            : "Jamais"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelectedKeyForDetails(key)}
                              title="Voir les détails"
                            >
                              <Info className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => setSelectedKeyId(key.id)}
                              title="Supprimer la clé"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <CreateApiKeyDialog
              open={showCreateDialog}
              onOpenChange={setShowCreateDialog}
              onSuccess={() => {
                setShowCreateDialog(false);
                fetchKeys();
              }}
            />

            <AlertDialog
              open={!!selectedKeyId}
              onOpenChange={(open) => !open && setSelectedKeyId(null)}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Êtes-vous sûr ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cette action est irréversible. La clé sera définitivement
                    supprimée.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => selectedKeyId && handleDelete(selectedKeyId)}
                  >
                    Supprimer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <ApiKeyDetailsDialog
              apiKey={selectedKeyForDetails}
              open={!!selectedKeyForDetails}
              onOpenChange={(open) => !open && setSelectedKeyForDetails(null)}
            />
          </div>
        </SidebarInset>
      </div>
    </>
  );
}
