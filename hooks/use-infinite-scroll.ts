import { useEffect, useRef, useState } from "react";
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

  return {
    data,
    loading,
    ref,
  };
}
