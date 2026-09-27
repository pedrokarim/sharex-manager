"use client";

import { useSession } from "@/lib/auth-client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { UserDialog } from "@/components/user-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/lib/i18n";
import { RefreshCw, Search, Shield, UserPlus, Users } from "lucide-react";

interface User {
  id: string;
  username: string;
  role: "admin" | "user";
}

export default function UsersPageClient({
  initialUsers,
}: {
  initialUsers: User[];
}) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [filteredUsers, setFilteredUsers] = useState<User[]>(initialUsers);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const { data: session } = useSession();

  const stats = {
    total: users.length,
    admins: users.filter((user) => user.role === "admin").length,
    users: users.filter((user) => user.role === "user").length,
  };

  useEffect(() => {
    const filtered = users.filter((user) => {
      const matchesSearch = user.username
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      return matchesSearch && matchesRole;
    });

    setFilteredUsers(filtered);
  }, [users, searchQuery, roleFilter]);

  const handleDelete = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/users?id=${userId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t("admin.users.errors.generic"));
      }

      setUsers((currentUsers) =>
        currentUsers.filter((user) => user.id !== userId),
      );
      toast.success(t("admin.users.messages.delete_success"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("admin.users.errors.generic"),
      );
    }
  };

  const refreshUsers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/users");
      const data = await response.json();
      setUsers(data);
      toast.success(t("admin.users.messages.refresh_success"));
    } catch (error) {
      toast.error(t("admin.users.errors.refresh"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Gestion des accès
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("admin.users.title")}
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
              Gérez les comptes, les rôles et les interventions sur les accès
              sans perdre le fil de l’exploitation.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={refreshUsers}
              disabled={isLoading}
              className="text-sm"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              Rafraîchir
            </Button>
            <UserDialog
              onSuccess={refreshUsers}
              trigger={
                <Button className="text-sm">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Ajouter un utilisateur
                </Button>
              }
            />
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {t("admin.users.stats.total")}
            </p>
            <p className="mt-2 text-2xl font-semibold">{stats.total}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Comptes actuellement disponibles dans l’instance.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {t("admin.users.stats.admins")}
            </p>
            <p className="mt-2 text-2xl font-semibold">{stats.admins}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Utilisateurs ayant accès aux panneaux sensibles.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {t("admin.users.stats.users")}
            </p>
            <p className="mt-2 text-2xl font-semibold">{stats.users}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Comptes standard pour l’usage quotidien de la plateforme.
            </p>
          </div>
        </div>
      </section>

      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 p-5 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">
            Répertoire des comptes
          </CardTitle>
          <CardDescription className="text-sm">
            Filtrez rapidement les utilisateurs avant d’éditer un rôle ou de
            supprimer un accès.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("admin.users.search_placeholder")}
                className="pl-9 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Select
              value={roleFilter}
              onValueChange={(value: "all" | "admin" | "user") =>
                setRoleFilter(value)
              }
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder={t("admin.users.filter_by_role")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm">
                  {t("admin.users.roles.all")}
                </SelectItem>
                <SelectItem value="admin" className="text-sm">
                  {t("admin.users.roles.admin")}
                </SelectItem>
                <SelectItem value="user" className="text-sm">
                  {t("admin.users.roles.user")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs sm:text-sm">ID</TableHead>
                  <TableHead className="text-xs sm:text-sm">
                    {t("admin.users.table.username")}
                  </TableHead>
                  <TableHead className="text-xs sm:text-sm">
                    {t("admin.users.table.role")}
                  </TableHead>
                  <TableHead className="text-right text-xs sm:text-sm">
                    {t("admin.users.table.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Skeleton className="h-8 w-16" />
                          <Skeleton className="h-8 w-20" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-12 text-center text-sm text-muted-foreground"
                    >
                      {t("admin.users.no_users_found")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="text-xs sm:text-sm">
                        <span className="inline-flex rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 font-mono">
                          <span className="hidden sm:inline">{user.id}</span>
                          <span className="sm:hidden">
                            {user.id.slice(0, 8)}...
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {user.username}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            user.role === "admin" ? "default" : "secondary"
                          }
                          className="text-xs"
                        >
                          {user.role === "admin" ? (
                            <span className="inline-flex items-center gap-1">
                              <Shield className="h-3 w-3" />
                              {t("admin.users.roles.admin_label")}
                            </span>
                          ) : (
                            t("admin.users.roles.user_label")
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <UserDialog
                            user={user}
                            onSuccess={refreshUsers}
                            trigger={
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                              >
                                {t("admin.users.actions.edit")}
                              </Button>
                            }
                          />
                          {session?.user?.id !== user.id && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="text-xs"
                                >
                                  {t("admin.users.actions.delete")}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-md overflow-hidden rounded-2xl border border-border/70 p-0 shadow-2xl">
                                <AlertDialogHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
                                  <AlertDialogTitle className="text-lg">
                                    {t("admin.users.delete_dialog.title")}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-sm">
                                    {t("admin.users.delete_dialog.description")}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className="gap-2 px-5 py-4 sm:px-6">
                                  <AlertDialogCancel className="text-sm">
                                    {t("common.cancel")}
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(user.id)}
                                    className="text-sm"
                                  >
                                    {t("admin.users.actions.delete")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
