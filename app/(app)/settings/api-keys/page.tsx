"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { ApiKey } from "@/types/api-key";
import { useTranslation } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/date-locales";
import { CreateApiKeyDialog } from "@/components/api-keys/create-api-key-dialog";
import { ApiKeyDetailsDialog } from "@/components/api-keys/api-key-details-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Copy,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";



export default function ApiKeysPage() {
  const { t } = useTranslation();
  const { data: session, isPending: isSessionPending } = useSession();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [selectedKeyForDetails, setSelectedKeyForDetails] =
    useState<ApiKey | null>(null);
  const locale = useDateLocale();

  useEffect(() => {
    if (!isSessionPending && !session) {
      redirect("/login");
    }

    fetchKeys();
  }, [isSessionPending, session]);

  const summary = useMemo(() => {
    const now = new Date();
    const expired = keys.filter(
      (key) => key.expiresAt && new Date(key.expiresAt) < now,
    ).length;
    const permanent = keys.filter((key) => !key.expiresAt).length;

    return {
      total: keys.length,
      active: keys.length - expired,
      permanent,
    };
  }, [keys]);

  const fetchKeys = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/api-keys");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setKeys(data);
    } catch (error) {
      toast.error(t("settings.api_keys.errors.loading"));
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

      toast.success(t("settings.api_keys.messages.delete_success"));
      fetchKeys();
    } catch (error) {
      toast.error(t("settings.api_keys.errors.delete"));
    } finally {
      setSelectedKeyId(null);
    }
  };

  const copyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success(t("settings.api_keys.messages.copy_success"));
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80 text-muted-foreground shadow-sm sm:h-11 sm:w-11">
                <KeyRound className="h-5 w-5" />
              </span>
              {t("settings.sections.api_keys.title")}
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
              Distribuez des clés d’upload avec un vrai panneau de contrôle:
              visibilité, durée de vie et permissions lisibles d’un coup d’œil.
            </p>
          </div>

          <Button
            onClick={() => setShowCreateDialog(true)}
            className="w-full text-sm sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("settings.api_keys.new_key")}
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Catalogue
            </p>
            <p className="mt-2 text-2xl font-semibold">{summary.total}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Clés actuellement enregistrées pour les intégrations.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Actives
            </p>
            <p className="mt-2 text-2xl font-semibold">{summary.active}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Clés encore utilisables selon leur date d’expiration.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Permanentes
            </p>
            <p className="mt-2 text-2xl font-semibold">{summary.permanent}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Clés sans date limite, à surveiller plus attentivement.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-2 px-1">
          <h2 className="text-xl font-semibold">Registre des clés</h2>
          <p className="text-sm text-muted-foreground">
            Consultez les permissions, les dates et les actions disponibles sans
            vous perdre dans une table brute.
          </p>
        </div>

        <div>
          <div className="space-y-3 sm:hidden">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/20 py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {t("settings.api_keys.loading")}
                </p>
              </div>
            ) : keys.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                {t("settings.api_keys.no_keys.description")}
              </div>
            ) : (
              keys.map((key) => (
                <div
                  key={key.id}
                  className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <button
                        type="button"
                        className="truncate text-left text-sm font-medium text-foreground"
                        onClick={() => setSelectedKeyForDetails(key)}
                      >
                        {key.name}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(key.createdAt), "dd/MM/yyyy", {
                          locale,
                        })}
                      </p>
                    </div>
                    <Badge variant={key.expiresAt ? "secondary" : "default"}>
                      {key.expiresAt ? "Limitée" : "Permanente"}
                    </Badge>
                  </div>

                  <div className="grid gap-2 rounded-xl border border-border/60 bg-background px-3 py-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Clé</span>
                      <code className="max-w-[60%] truncate rounded-full border border-border/60 bg-muted/30 px-2 py-1">
                        {showKey === key.id
                          ? key.key
                          : `${key.key.slice(0, 6)}••••${key.key.slice(-4)}`}
                      </code>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("settings.api_keys.table.expires_at")}
                      </span>
                      <span className="text-right font-medium">
                        {key.expiresAt
                          ? format(new Date(key.expiresAt), "dd/MM/yyyy", {
                              locale,
                            })
                          : t("settings.api_keys.never")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t("settings.api_keys.table.last_used")}
                      </span>
                      <span className="text-right font-medium">
                        {key.lastUsed
                          ? format(new Date(key.lastUsed), "dd/MM/yyyy HH:mm", {
                              locale,
                            })
                          : t("settings.api_keys.never")}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {key.permissions.uploadImages && (
                      <Badge variant="secondary" className="text-xs">
                        {t("settings.api_keys.permissions.images")}
                      </Badge>
                    )}
                    {key.permissions.uploadText && (
                      <Badge variant="secondary" className="text-xs">
                        {t("settings.api_keys.permissions.text")}
                      </Badge>
                    )}
                    {key.permissions.uploadFiles && (
                      <Badge variant="secondary" className="text-xs">
                        {t("settings.api_keys.permissions.files")}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="text-sm"
                      onClick={() => setSelectedKeyForDetails(key)}
                    >
                      <Info className="mr-2 h-4 w-4" />
                      Détails
                    </Button>
                    <Button
                      variant="outline"
                      className="text-sm"
                      onClick={() =>
                        setShowKey(showKey === key.id ? null : key.id)
                      }
                    >
                      {showKey === key.id ? (
                        <EyeOff className="mr-2 h-4 w-4" />
                      ) : (
                        <Eye className="mr-2 h-4 w-4" />
                      )}
                      {showKey === key.id ? "Masquer" : "Afficher"}
                    </Button>
                    <Button
                      variant="outline"
                      className="col-span-2 text-sm"
                      onClick={() => copyToClipboard(key.key)}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copier la clé
                    </Button>
                    <Button
                      variant="outline"
                      className="col-span-2 text-sm text-destructive"
                      onClick={() => setSelectedKeyId(key.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Supprimer la clé
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs sm:text-sm">
                    {t("settings.api_keys.table.name")}
                  </TableHead>
                  <TableHead className="text-xs sm:text-sm">
                    {t("settings.api_keys.table.key")}
                  </TableHead>
                  <TableHead className="hidden text-xs sm:table-cell sm:text-sm">
                    {t("settings.api_keys.table.created_at")}
                  </TableHead>
                  <TableHead className="hidden text-xs lg:table-cell sm:text-sm">
                    {t("settings.api_keys.table.expires_at")}
                  </TableHead>
                  <TableHead className="hidden text-xs lg:table-cell sm:text-sm">
                    {t("settings.api_keys.table.permissions")}
                  </TableHead>
                  <TableHead className="hidden text-xs xl:table-cell sm:text-sm">
                    {t("settings.api_keys.table.last_used")}
                  </TableHead>
                  <TableHead className="text-right text-xs sm:text-sm">
                    {t("settings.api_keys.table.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <div className="flex flex-col items-center justify-center gap-2 py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">
                          {t("settings.api_keys.loading")}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : keys.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-12 text-center text-sm text-muted-foreground"
                    >
                      {t("settings.api_keys.no_keys.description")}
                    </TableCell>
                  </TableRow>
                ) : (
                  keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="text-sm font-medium">
                        <Button
                          variant="link"
                          className="h-auto p-0 text-sm"
                          onClick={() => setSelectedKeyForDetails(key)}
                        >
                          {key.name}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs">
                            {showKey === key.id ? key.key : "••••••••"}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
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
                            className="h-8 w-8"
                            onClick={() => copyToClipboard(key.key)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-xs sm:table-cell sm:text-sm">
                        {format(new Date(key.createdAt), "dd/MM/yyyy", {
                          locale,
                        })}
                      </TableCell>
                      <TableCell className="hidden text-xs lg:table-cell sm:text-sm">
                        {key.expiresAt
                          ? format(new Date(key.expiresAt), "dd/MM/yyyy", {
                              locale,
                            })
                          : t("settings.api_keys.never")}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {key.permissions.uploadImages && (
                            <Badge variant="secondary" className="text-xs">
                              {t("settings.api_keys.permissions.images")}
                            </Badge>
                          )}
                          {key.permissions.uploadText && (
                            <Badge variant="secondary" className="text-xs">
                              {t("settings.api_keys.permissions.text")}
                            </Badge>
                          )}
                          {key.permissions.uploadFiles && (
                            <Badge variant="secondary" className="text-xs">
                              {t("settings.api_keys.permissions.files")}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-xs xl:table-cell sm:text-sm">
                        {key.lastUsed
                          ? format(new Date(key.lastUsed), "dd/MM/yyyy HH:mm", {
                              locale,
                            })
                          : t("settings.api_keys.never")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setSelectedKeyForDetails(key)}
                            title={t("settings.api_keys.actions.view_details")}
                          >
                            <Info className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setSelectedKeyId(key.id)}
                            title={t("settings.api_keys.actions.delete")}
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
        </div>
      </section>

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
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-md overflow-hidden rounded-2xl border border-border/70 p-0 shadow-2xl">
          <AlertDialogHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
            <AlertDialogTitle>{t("common.confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.api_keys.delete_confirmation")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 px-5 py-4 sm:px-6">
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedKeyId && handleDelete(selectedKeyId)}
            >
              {t("common.delete")}
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
  );
}
