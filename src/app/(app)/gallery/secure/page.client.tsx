"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileCard } from "@/components/file-card";
import { LoadingState } from "@/components/loading";
import { Spinner } from "@/components/ui/spinner";
import { useInView } from "react-intersection-observer";
import { useEffect } from "react";
import { useDebounce } from "@/hooks/use-debounce";

interface SecureFile {
  name: string;
  url: string;
  size: number;
  createdAt: string;
  isSecure: boolean;
}

interface SecureFilesResponse {
  files: SecureFile[];
  hasMore: boolean;
  total: number;
}

export function SecureGalleryClient() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const { ref, inView } = useInView();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery<SecureFilesResponse>({
    queryKey: ["secureFiles", debouncedSearch],
    queryFn: async ({ pageParam = 1 }) => {
      const searchParams = new URLSearchParams();
      searchParams.set("page", pageParam as string);
      if (debouncedSearch) searchParams.set("q", debouncedSearch);

      const response = await fetch(
        `/api/files/secure?${searchParams.toString()}`
      );
      if (!response.ok)
        throw new Error("Erreur lors du chargement des fichiers");
      return response.json();
    },
    getNextPageParam: (lastPage, pages) => {
      if (!lastPage.hasMore) return undefined;
      return pages.length + 1;
    },
    initialPageParam: 1,
  });

  useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage();
    }
  }, [inView, fetchNextPage, hasNextPage]);

  const files = data?.pages.flatMap((page) => page.files) ?? [];
  const totalFiles = data?.pages[0]?.total ?? 0;

  return (
    <div className="container mx-auto py-4 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-xl sm:text-2xl font-bold">
            Fichiers Sécurisés ({totalFiles})
          </h1>
          <div className="flex items-center gap-4">
            <Input
              type="search"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 text-sm"
            />
          </div>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {files.map((file) => (
                <FileCard
                  key={file.url}
                  file={file}
                  onDelete={() => refetch()}
                />
              ))}
            </div>

            <div ref={ref} className="flex justify-center p-4">
              {isFetchingNextPage && (
                <Spinner className="size-5 sm:size-6" />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
