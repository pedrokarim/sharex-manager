import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { GalleryClient } from "./page.client"
import { cookies } from "next/headers"

interface SearchParams {
  q?: string
  view?: string
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await auth()
  const cookieStore = cookies()
  
  if (!session) {
    redirect("/login")
  }

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/files?page=1&q=${searchParams.q || ""}`, {
      cache: "no-store",
      headers: {
        Cookie: cookieStore.toString()
      }
    })
    const data = await res.json()

    return (
      <GalleryClient 
        initialFiles={data.files}
        initialHasMore={data.hasMore}
        initialView={searchParams.view as "grid" | "list" | "details"}
        initialSearch={searchParams.q}
      />
    )
  } catch (error) {
    console.error("Erreur lors du chargement initial des fichiers:", error)
    return (
      <GalleryClient 
        initialFiles={[]}
        initialHasMore={false}
        initialView={searchParams.view as "grid" | "list" | "details"}
        initialSearch={searchParams.q}
      />
    )
  }
}
