"use client"

import { Search } from "lucide-react"
import { Label } from "../ui/label"
import { SidebarInput } from "../ui/sidebar"
import { useSearchParams, usePathname, useRouter } from "next/navigation"
import { useQueryState } from "nuqs"
import { useDebounce } from "@/hooks/use-debounce"
import { useEffect } from "react"

export function SearchForm({ ...props }: React.ComponentProps<"form">) {
  const [search, setSearch] = useQueryState("q")
  const debouncedSearch = useDebounce(search, 300)

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
  }

  return (
    <form {...props} onSubmit={(e) => e.preventDefault()}>
      <div className="relative">
        <Label htmlFor="search" className="sr-only">
          Rechercher
        </Label>
        <SidebarInput
          id="search"
          value={search || ""}
          onChange={handleSearch}
          placeholder="Rechercher..."
          className="h-8 pl-7"
        />
        <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 select-none opacity-50" />
      </div>
    </form>
  )
}