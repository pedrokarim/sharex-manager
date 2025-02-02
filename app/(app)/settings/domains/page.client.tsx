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
  const [domains, setDomains] = useState<Domain[]>(initialDomains);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState<Domain | null>(null);

  const domainForm = useForm<DomainFormValues>({
    resolver: zodResolver(domainSchema),
    defaultValues: {
      id: "",
      name: "",
      url: "",
      isDefault: false,
    },
  });

  const configForm = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
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

      if (!response.ok) throw new Error("Erreur lors de la sauvegarde");

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
      toast.success(editingDomain ? "Domaine mis à jour" : "Domaine ajouté");
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  const onSubmitConfig = async (values: ConfigFormValues) => {
    try {
      const response = await fetch("/api/settings/domains/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) throw new Error("Erreur lors de la sauvegarde");

      toast.success("Configuration mise à jour");
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/settings/domains/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Erreur lors de la suppression");

      setDomains(domains.filter((d) => d.id !== id));
      toast.success("Domaine supprimé");
    } catch (error) {
      toast.error("Une erreur est survenue");
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
          <CardTitle>Configuration des domaines</CardTitle>
          <CardDescription>
            Gérez les domaines utilisés pour générer les URLs de vos fichiers
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
                      <FormLabel>Forcer HTTPS</FormLabel>
                      <FormDescription>
                        Force l'utilisation de HTTPS pour toutes les URLs
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
                    <FormLabel>Préfixe du chemin</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="/uploads" />
                    </FormControl>
                    <FormDescription>
                      Préfixe ajouté à toutes les URLs de fichiers
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit">Enregistrer la configuration</Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Liste des domaines</CardTitle>
              <CardDescription>
                Gérez les domaines disponibles pour vos fichiers
              </CardDescription>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Ajouter un domaine
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingDomain
                      ? "Modifier le domaine"
                      : "Ajouter un domaine"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingDomain
                      ? "Modifiez les informations du domaine"
                      : "Ajoutez un nouveau domaine pour vos fichiers"}
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
                          <FormLabel>Identifiant</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="mon-domaine" />
                          </FormControl>
                          <FormDescription>
                            Identifiant unique pour ce domaine
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
                          <FormLabel>Nom</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Mon Domaine" />
                          </FormControl>
                          <FormDescription>
                            Nom d'affichage du domaine
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
                          <FormLabel>URL</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="https://example.com"
                            />
                          </FormControl>
                          <FormDescription>
                            URL de base du domaine
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
                            <FormLabel>Domaine par défaut</FormLabel>
                            <FormDescription>
                              Utiliser ce domaine par défaut
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
                        {editingDomain ? "Modifier" : "Ajouter"}
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
                <TableHead>Identifiant</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Par défaut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((domain) => (
                <TableRow key={domain.id}>
                  <TableCell>{domain.id}</TableCell>
                  <TableCell>{domain.name}</TableCell>
                  <TableCell>{domain.url}</TableCell>
                  <TableCell>{domain.isDefault ? "Oui" : "Non"}</TableCell>
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
