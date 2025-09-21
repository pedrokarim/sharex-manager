"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
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
import { useSession } from "next-auth/react";
import { UserDialog } from "@/components/user-dialog";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, UserPlus, Users, Shield, RefreshCw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n";

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

      setUsers((users) => users.filter((user) => user.id !== userId));
      toast.success(t("admin.users.messages.delete_success"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("admin.users.errors.generic")
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
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium">
              {t("admin.users.stats.total")}
            </CardTitle>
            <Users className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium">
              {t("admin.users.stats.admins")}
            </CardTitle>
            <Shield className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold">{stats.admins}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium">
              {t("admin.users.stats.users")}
            </CardTitle>
            <UserPlus className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold">{stats.users}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">
            {t("admin.users.title")}
          </CardTitle>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              onClick={refreshUsers}
              disabled={isLoading}
              className="h-8 w-8 sm:h-9 sm:w-9"
            >
              <RefreshCw
                className={`h-3 w-3 sm:h-4 sm:w-4 ${
                  isLoading ? "animate-spin" : ""
                }`}
              />
            </Button>
            <UserDialog onSuccess={refreshUsers} />
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="mb-4 flex flex-col space-y-3 sm:space-y-4 md:flex-row md:items-center md:space-x-4 md:space-y-0">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
              <Input
                placeholder={t("admin.users.search_placeholder")}
                className="pl-7 sm:pl-8 text-sm"
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
              <SelectTrigger className="w-full sm:w-[180px] text-sm">
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

          <div className="rounded-md border overflow-x-auto">
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
                        <Skeleton className="h-3 w-16 sm:h-4 sm:w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3 w-20 sm:h-4 sm:w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3 w-12 sm:h-4 sm:w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-20 sm:h-8 sm:w-32" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-6 sm:py-8 text-muted-foreground text-sm"
                    >
                      {t("admin.users.no_users_found")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-mono text-xs sm:text-sm">
                        <span className="hidden sm:inline">{user.id}</span>
                        <span className="sm:hidden">
                          {user.id.slice(0, 8)}...
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{user.username}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            user.role === "admin" ? "default" : "secondary"
                          }
                          className="text-xs"
                        >
                          {user.role === "admin"
                            ? t("admin.users.roles.admin_label")
                            : t("admin.users.roles.user_label")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-1 sm:space-x-2">
                          <UserDialog
                            user={user}
                            onSuccess={refreshUsers}
                            trigger={
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7 sm:h-8"
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
                                  className="text-xs h-7 sm:h-8"
                                >
                                  {t("admin.users.actions.delete")}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="w-[95vw] max-w-md">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-lg">
                                    {t("admin.users.delete_dialog.title")}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-sm">
                                    {t("admin.users.delete_dialog.description")}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                                  <AlertDialogCancel className="w-full sm:w-auto text-sm">
                                    {t("common.cancel")}
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(user.id)}
                                    className="w-full sm:w-auto text-sm"
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
