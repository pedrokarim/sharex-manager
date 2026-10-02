"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { UserDialog } from "@/components/user-dialog";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/filters/filter-bar";
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
  currentUserId,
}: {
  initialUsers: User[];
  /** Le compte connecté : on ne se supprime pas soi-même. */
  currentUserId: string;
}) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [filteredUsers, setFilteredUsers] = useState<User[]>(initialUsers);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");

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
      <AdminPageHeader
        icon={Users}
        title={t("admin.users.title")}
        // Les trois chiffres tiennent dans la phrase : pas besoin de tuiles.
        description={`${stats.total} ${stats.total > 1 ? "comptes" : "compte"}, dont ${stats.admins} ${stats.admins > 1 ? "administrateurs" : "administrateur"}. Gérez les rôles et les accès.`}
        actions={
          <>
            <Button variant="outline" onClick={refreshUsers} disabled={isLoading} className="text-sm">
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
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
          </>
        }
      />

      <Card className="gap-0 rounded-2xl border-border/70 py-0 shadow-sm">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <FilterBar
            onReset={
              searchQuery || roleFilter !== "all"
                ? () => {
                    setSearchQuery("");
                    setRoleFilter("all");
                  }
                : null
            }
          >
            <FilterSearch value={searchQuery} onChange={setSearchQuery} placeholder={t("admin.users.search_placeholder")} />
            <FilterSelect
              value={roleFilter}
              onChange={setRoleFilter}
              label={t("admin.users.filter_by_role")}
              options={(["all", "admin", "user"] as const).map((value) => ({
                value,
                label: t(`admin.users.roles.${value}`),
              }))}
            />
          </FilterBar>

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
                          {currentUserId !== user.id && (
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
