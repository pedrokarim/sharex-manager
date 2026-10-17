"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ActionStatus, FormStatus, useFeedback } from "@/components/feedback";
import { Domain } from "@/lib/types/upload-config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Globe2, Plus, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const domainSchema = z.object({
  id: z.string().min(1, "L'identifiant est requis"),
  name: z.string().min(1, "Le nom est requis"),
  url: z.string().url("L'URL doit être valide"),
  isDefault: z.boolean().optional(),
});

const configSchema = z.object({
  useSSL: z.boolean(),
  pathPrefix: z.string().min(1, "Le préfixe est requis"),
});

type DomainFormValues = z.infer<typeof domainSchema>;
type ConfigFormValues = z.infer<typeof configSchema>;

interface DomainsPageProps {
  initialDomains: Domain[];
  initialConfig: {
    useSSL: boolean;
    pathPrefix: string;
    defaultDomain: string;
  };
}

export default function DomainsPage({
  initialDomains,
  initialConfig,
}: DomainsPageProps) {
  const { t } = useTranslation();
  const [domains, setDomains] = useState<Domain[]>(initialDomains);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState<Domain | null>(null);
  // Chaque zone a son message : l'erreur d'enregistrement dans la fenêtre,
  // celle de la configuration au-dessus de son bouton (la réussite à côté),
  // celle d'une suppression sur la ligne du domaine. Un ajout ou une
  // suppression réussis se voient dans la liste.
  const domainFeedback = useFeedback();
  const configFeedback = useFeedback();
  const deleteFeedback = useFeedback();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const deleteStatusOf = (id: string) => (deleteTargetId === id ? deleteFeedback.state : null);

  const domainSchemaWithTranslation = z.object({
    id: z.string().min(1, t("settings.domains.form.errors.id_required")),
    name: z.string().min(1, t("settings.domains.form.errors.name_required")),
    url: z.string().url(t("settings.domains.form.errors.url_invalid")),
    isDefault: z.boolean().optional(),
  });

  const configSchemaWithTranslation = z.object({
    useSSL: z.boolean(),
    pathPrefix: z
      .string()
      .min(1, t("settings.domains.form.errors.prefix_required")),
  });

  const domainForm = useForm<DomainFormValues>({
    resolver: zodResolver(domainSchemaWithTranslation),
    defaultValues: {
      id: "",
      name: "",
      url: "",
      isDefault: false,
    },
  });

  const configForm = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchemaWithTranslation),
    defaultValues: {
      useSSL: initialConfig.useSSL,
      pathPrefix: initialConfig.pathPrefix,
    },
  });

  const onSubmitDomain = async (values: DomainFormValues) => {
    domainFeedback.clear();
    try {
      const response = await fetch("/api/settings/domains", {
        method: editingDomain ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) throw new Error(t("settings.domains.errors.save"));

      const updatedDomain = await response.json();

      if (editingDomain) {
        setDomains(
          domains.map((d) => (d.id === updatedDomain.id ? updatedDomain : d)),
        );
      } else {
        setDomains([...domains, updatedDomain]);
      }

      setIsAddDialogOpen(false);
      setEditingDomain(null);
      domainForm.reset();
    } catch (error) {
      domainFeedback.error(t("settings.domains.errors.generic"));
    }
  };

  const onSubmitConfig = async (values: ConfigFormValues) => {
    configFeedback.clear();
    try {
      const response = await fetch("/api/settings/domains/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) throw new Error(t("settings.domains.errors.save"));

      configFeedback.success(t("settings.domains.messages.config_updated"));
    } catch (error) {
      configFeedback.error(t("settings.domains.errors.generic"));
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteTargetId(id);
    deleteFeedback.clear();
    try {
      const response = await fetch(`/api/settings/domains/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error(t("settings.domains.errors.delete"));

      setDomains(domains.filter((d) => d.id !== id));
    } catch (error) {
      deleteFeedback.error(t("settings.domains.errors.generic"));
    }
  };

  const handleEdit = (domain: Domain) => {
    setEditingDomain(domain);
    domainForm.reset(domain);
    domainFeedback.clear();
    setIsAddDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    // Une fenêtre rouverte repart sans l'erreur de la fois précédente.
    if (open) domainFeedback.clear();
    setIsAddDialogOpen(open);
  };

  return (
    <div className="grid w-full gap-6 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
      <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm sm:p-6 xl:col-span-2">
        <div className="flex flex-col gap-2">
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80 text-muted-foreground shadow-sm sm:h-11 sm:w-11">
              <Globe2 className="h-5 w-5" />
            </span>
            {t("settings.domains.list.title")}
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            Définissez les domaines de diffusion, les règles SSL et le préfixe
            d’URL sans laisser la configuration s’éparpiller.
          </p>
        </div>
      </section>

      <Card className="rounded-2xl border-border/70 shadow-sm xl:sticky xl:top-4">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">
            {t("settings.domains.config.title")}
          </CardTitle>
          <CardDescription className="text-sm">
            {t("settings.domains.config.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6 pt-0">
          <Form {...configForm}>
            <form
              onSubmit={configForm.handleSubmit(onSubmitConfig)}
              onChange={configFeedback.state?.tone === "error" ? configFeedback.clear : undefined}
              className="space-y-4 sm:space-y-6"
            >
              <FormField
                control={configForm.control}
                name="useSSL"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm sm:text-base">
                        {t("settings.domains.config.force_https")}
                      </FormLabel>
                      <FormDescription className="text-xs sm:text-sm">
                        {t("settings.domains.config.force_https_description")}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={configForm.control}
                name="pathPrefix"
                render={({ field }) => (
                  <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <FormLabel className="text-sm sm:text-base">
                      {t("settings.domains.config.path_prefix")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="/uploads"
                        className="text-sm"
                      />
                    </FormControl>
                    <FormDescription className="text-xs sm:text-sm">
                      {t("settings.domains.config.path_prefix_description")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div>
                {/* L'erreur au-dessus du bouton, la réussite à côté. */}
                <FormStatus
                  state={configFeedback.state?.tone === "error" ? configFeedback.state : null}
                  className="pb-3"
                />
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                  <Button
                    type="submit"
                    className="w-full text-sm sm:w-auto"
                    loading={configForm.formState.isSubmitting}
                  >
                    {t("settings.domains.config.save")}
                  </Button>
                  <ActionStatus
                    state={configFeedback.state?.tone === "success" ? configFeedback.state : null}
                  />
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg sm:text-xl">
                {t("settings.domains.list.title")}
              </CardTitle>
              <CardDescription className="text-sm">
                {t("settings.domains.list.description")}
              </CardDescription>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto text-sm">
                  <Plus className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                  {t("settings.domains.list.add")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90svh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto rounded-2xl border border-border/70 p-0 shadow-2xl">
                <DialogHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
                  <DialogTitle className="text-lg sm:text-xl">
                    {editingDomain
                      ? t("settings.domains.form.edit_title")
                      : t("settings.domains.form.add_title")}
                  </DialogTitle>
                  <DialogDescription className="text-sm">
                    {editingDomain
                      ? t("settings.domains.form.edit_description")
                      : t("settings.domains.form.add_description")}
                  </DialogDescription>
                </DialogHeader>
                <Form {...domainForm}>
                  <form
                    onSubmit={domainForm.handleSubmit(onSubmitDomain)}
                    onChange={domainFeedback.state ? domainFeedback.clear : undefined}
                    className="space-y-4 px-5 py-5 sm:px-6"
                  >
                    <FormField
                      control={domainForm.control}
                      name="id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm">
                            {t("settings.domains.form.id")}
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="my-domain"
                              className="text-sm"
                            />
                          </FormControl>
                          <FormDescription className="text-xs sm:text-sm">
                            {t("settings.domains.form.id_description")}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={domainForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm">
                            {t("settings.domains.form.name")}
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="My Domain"
                              className="text-sm"
                            />
                          </FormControl>
                          <FormDescription className="text-xs sm:text-sm">
                            {t("settings.domains.form.name_description")}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={domainForm.control}
                      name="url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm">
                            {t("settings.domains.form.url")}
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="https://example.com"
                              className="text-sm"
                            />
                          </FormControl>
                          <FormDescription className="text-xs sm:text-sm">
                            {t("settings.domains.form.url_description")}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={domainForm.control}
                      name="isDefault"
                      render={({ field }) => (
                        <FormItem className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">
                              {t("settings.domains.form.default")}
                            </FormLabel>
                            <FormDescription className="text-xs sm:text-sm">
                              {t("settings.domains.form.default_description")}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    {/* Enveloppe fixe : l'espacement du message s'ouvre avec lui. */}
                    <div>
                      <FormStatus state={domainFeedback.state} className="pb-4" />
                      <DialogFooter className="flex-col gap-2 border-t border-border/60 px-0 pt-4 sm:flex-row sm:justify-end">
                        <Button
                          type="submit"
                          className="w-full sm:w-auto text-sm"
                          loading={domainForm.formState.isSubmitting}
                        >
                          {editingDomain ? t("common.edit") : t("common.create")}
                        </Button>
                      </DialogFooter>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="space-y-3 sm:hidden">
            {domains.map((domain) => (
              <div
                key={domain.id}
                className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">{domain.name}</p>
                    <p className="break-all text-xs text-muted-foreground">
                      {domain.url}
                    </p>
                  </div>
                  {domain.isDefault ? (
                    <Badge variant="secondary">Par défaut</Badge>
                  ) : null}
                </div>

                <div className="grid gap-2 rounded-xl border border-border/60 bg-background px-3 py-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {t("settings.domains.table.id")}
                    </span>
                    <code className="max-w-[55%] truncate rounded-full border border-border/60 bg-muted/30 px-2 py-1 font-mono">
                      {domain.id}
                    </code>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {t("settings.domains.table.default")}
                    </span>
                    <span className="font-medium">
                      {domain.isDefault ? t("common.yes") : t("common.no")}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="text-sm"
                    onClick={() => handleEdit(domain)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Modifier
                  </Button>
                  <Button
                    variant="outline"
                    className="text-sm text-destructive"
                    onClick={() => handleDelete(domain.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Supprimer
                  </Button>
                  {deleteStatusOf(domain.id) ? (
                    <ActionStatus state={deleteStatusOf(domain.id)} className="col-span-2 justify-center" />
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-border/60 sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs sm:text-sm">
                    {t("settings.domains.table.id")}
                  </TableHead>
                  <TableHead className="text-xs sm:text-sm">
                    {t("settings.domains.table.name")}
                  </TableHead>
                  <TableHead className="text-xs sm:text-sm hidden sm:table-cell">
                    {t("settings.domains.table.url")}
                  </TableHead>
                  <TableHead className="text-xs sm:text-sm">
                    {t("settings.domains.table.default")}
                  </TableHead>
                  <TableHead className="text-right text-xs sm:text-sm">
                    {t("settings.domains.table.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map((domain) => (
                  <TableRow key={domain.id}>
                    <TableCell className="text-xs sm:text-sm font-medium truncate max-w-[120px]">
                      {domain.id}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm truncate max-w-[120px]">
                      {domain.name}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm hidden sm:table-cell truncate max-w-[150px]">
                      {domain.url}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm">
                      {domain.isDefault ? t("common.yes") : t("common.no")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 sm:gap-2">
                        <ActionStatus state={deleteStatusOf(domain.id)} className="max-w-48" />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 sm:h-8 sm:w-8"
                          onClick={() => handleEdit(domain)}
                          aria-label="Edit domain"
                        >
                          <Pencil className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 sm:h-8 sm:w-8 text-destructive"
                          onClick={() => handleDelete(domain.id)}
                          aria-label="Delete domain"
                        >
                          <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
