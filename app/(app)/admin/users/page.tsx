import { readFileSync } from "fs";
import { join } from "path";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

interface User {
  id: string;
  username: string;
  role: string;
}

export default async function UsersPage() {
  const session = await auth();
  
  if (!session?.user?.role || session.user.role !== "admin") {
    redirect("/");
  }

  const users = JSON.parse(
    readFileSync(join(process.cwd(), "data/users.json"), "utf-8")
  ) as User[];

  return (
    <main className="flex min-h-screen flex-col">
        <div className="p-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Gestion des utilisateurs</CardTitle>
              <Button>Ajouter un utilisateur</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Nom d'utilisateur</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.id}</TableCell>
                      <TableCell>{user.username}</TableCell>
                      <TableCell>{user.role}</TableCell>
                      <TableCell>
                        <Button variant="destructive" size="sm">
                          Supprimer
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
  );
} 