"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Domain } from "@/lib/types/upload-config";
import { Button } from "@/components/ui/button";
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
      toast.success(
        editingDomain
          ? t("settings.domains.messages.updated")
          : t("settings.domains.messages.added"),
      );
    } catch (error) {
      toast.error(t("settings.domains.errors.generic"));
    }
  };

  const onSubmitConfig = async (values: ConfigFormValues) => {
    try {
      const response = await fetch("/api/settings/domains/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) throw new Error(t("settings.domains.errors.save"));

      toast.success(t("settings.domains.messages.config_updated"));
    } catch (error) {
      toast.error(t("settings.domains.errors.generic"));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/settings/domains/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error(t("settings.domains.errors.delete"));

      setDomains(domains.filter((d) => d.id !== id));
      toast.success(t("settings.domains.messages.deleted"));
    } catch (error) {
      toast.error(t("settings.domains.errors.generic"));
    }
  };

  const handleEdit = (domain: Domain) => {
    setEditingDomain(domain);
    domainForm.reset(domain);
    setIsAddDialogOpen(true);
  };

  return (
    <div className="grid w-full gap-6 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
      <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm sm:p-6 xl:col-span-2">
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Globe2 className="h-3.5 w-3.5" />
            Configuration des domaines
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
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
              <Button type="submit" className="text-sm">
                {t("settings.domains.config.save")}
              </Button>
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
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto text-sm">
                  <Plus className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                  {t("settings.domains.list.add")}
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg overflow-hidden rounded-2xl border border-border/70 p-0 shadow-2xl">
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
                    <DialogFooter className="gap-2 border-t border-border/60 px-0 pt-4">
                      <Button
                        type="submit"
                        className="w-full sm:w-auto text-sm"
                      >
                        {editingDomain ? t("common.edit") : t("common.create")}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <div className="overflow-x-auto rounded-xl border border-border/60">
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
