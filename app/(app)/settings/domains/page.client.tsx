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
import { Plus, Pencil, Trash2 } from "lucide-react";
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
          domains.map((d) => (d.id === updatedDomain.id ? updatedDomain : d))
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
          : t("settings.domains.messages.added")
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
    <div className="p-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.domains.config.title")}</CardTitle>
          <CardDescription>
            {t("settings.domains.config.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...configForm}>
            <form
              onSubmit={configForm.handleSubmit(onSubmitConfig)}
              className="space-y-4"
            >
              <FormField
                control={configForm.control}
                name="useSSL"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel>
                        {t("settings.domains.config.force_https")}
                      </FormLabel>
                      <FormDescription>
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
                  <FormItem>
                    <FormLabel>
                      {t("settings.domains.config.path_prefix")}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="/uploads" />
                    </FormControl>
                    <FormDescription>
                      {t("settings.domains.config.path_prefix_description")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit">{t("settings.domains.config.save")}</Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("settings.domains.list.title")}</CardTitle>
              <CardDescription>
                {t("settings.domains.list.description")}
              </CardDescription>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("settings.domains.list.add")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingDomain
                      ? t("settings.domains.form.edit_title")
                      : t("settings.domains.form.add_title")}
                  </DialogTitle>
                  <DialogDescription>
                    {editingDomain
                      ? t("settings.domains.form.edit_description")
                      : t("settings.domains.form.add_description")}
                  </DialogDescription>
                </DialogHeader>
                <Form {...domainForm}>
                  <form
                    onSubmit={domainForm.handleSubmit(onSubmitDomain)}
                    className="space-y-4"
                  >
                    <FormField
                      control={domainForm.control}
                      name="id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("settings.domains.form.id")}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="my-domain" />
                          </FormControl>
                          <FormDescription>
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
                          <FormLabel>
                            {t("settings.domains.form.name")}
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="My Domain" />
                          </FormControl>
                          <FormDescription>
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
                          <FormLabel>
                            {t("settings.domains.form.url")}
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="https://example.com"
                            />
                          </FormControl>
                          <FormDescription>
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
                        <FormItem className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <FormLabel>
                              {t("settings.domains.form.default")}
                            </FormLabel>
                            <FormDescription>
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
                    <DialogFooter>
                      <Button type="submit">
                        {editingDomain ? t("common.edit") : t("common.create")}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings.domains.table.id")}</TableHead>
                <TableHead>{t("settings.domains.table.name")}</TableHead>
                <TableHead>{t("settings.domains.table.url")}</TableHead>
                <TableHead>{t("settings.domains.table.default")}</TableHead>
                <TableHead className="text-right">
                  {t("settings.domains.table.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((domain) => (
                <TableRow key={domain.id}>
                  <TableCell>{domain.id}</TableCell>
                  <TableCell>{domain.name}</TableCell>
                  <TableCell>{domain.url}</TableCell>
                  <TableCell>
                    {domain.isDefault ? t("common.yes") : t("common.no")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(domain)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(domain.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
