import UsersPageClient from "./page.client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function UsersPage() {
  const headersList = headers();
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/admin/users`,
    {
      headers: {
        cookie: headersList.get("cookie") || "",
      },
    }
  );

  if (response.status === 401) {
    redirect("/auth/login");
  }

  let users: any[] = [];

  if (response.ok) {
    users = await response.json();
  }

  console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>> ", users);

  return <UsersPageClient initialUsers={users || []} />;
}
