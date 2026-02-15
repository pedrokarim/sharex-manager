import { useCallback, useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

interface UseInfiniteScrollProps<T> {
  initialData: T[];
  fetchMore: (page: number) => Promise<T[]>;
  hasMore: boolean;
}

export function useInfiniteScroll<T>({
  initialData,
  fetchMore,
  hasMore,
}: UseInfiniteScrollProps<T>) {
  const [data, setData] = useState<T[]>(initialData);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const { ref, inView } = useInView();

  useEffect(() => {
    if (inView && hasMore && !loading) {
      setLoading(true);
      fetchMore(page)
        .then((newData) => {
          setData((prev) => [...prev, ...newData]);
          setPage((p) => p + 1);
        })
        .finally(() => setLoading(false));
    }
  }, [inView, hasMore, page, fetchMore, loading]);

  const reset = useCallback((newData: T[]) => {
    setData(newData);
    setPage(2); // On commence à 2 car les premières données sont déjà chargées
  }, []);

  const prependItem = useCallback((item: T) => {
    setData((prev) => [item, ...prev]);
  }, []);

  return {
    data,
    loading,
    ref,
    reset,
    prependItem,
  };
}
