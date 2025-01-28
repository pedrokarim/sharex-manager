'use client'

import { signOut, useSession } from "next-auth/react"
import { Button } from "./ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"
import { UserCircle } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

export function Header() {
  const { data: session } = useSession()

  const handleSignOut = async () => {
    await signOut()
    toast.success("Déconnexion réussie")
  }

  return (
    <header className="border-b">
      <div className="container mx-auto flex h-16 items-center px-4">
        <Link href="/" className="font-bold">
          ShareX Manager
        </Link>

        <nav className="ml-auto flex items-center gap-4">
          {session ? (
            <>
              <Link href="/gallery">
                <Button variant="ghost">Galerie</Button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <UserCircle className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleSignOut}>
                    Se déconnecter
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Link href="/login">
              <Button>Se connecter</Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
} 