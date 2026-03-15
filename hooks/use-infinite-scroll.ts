import { useCallback, useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

interface UseInfiniteScrollProps<T> {
  initialData: T[];
  initialHasMore: boolean;
  fetchMore: (page: number) => Promise<{ data: T[]; hasMore: boolean }>;
}

export function useInfiniteScroll<T>({
  initialData,
  initialHasMore,
  fetchMore,
}: UseInfiniteScrollProps<T>) {
  const [data, setData] = useState<T[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const { ref, inView } = useInView();

  const pageRef = useRef(2);
  const fetchGenRef = useRef(0);

  // Assigned during render — always the latest version when the effect reads it.
  const fetchMoreRef = useRef(fetchMore);
  fetchMoreRef.current = fetchMore;

  // Core loading effect.
  // Depends on [inView, loading, hasMore] so it naturally re-evaluates
  // when loading finishes while the sentinel is still visible.
  useEffect(() => {
    if (!inView || loading || !hasMore) return;

    let cancelled = false;
    const currentPage = pageRef.current;
    const generation = ++fetchGenRef.current;

    setLoading(true);

    fetchMoreRef.current(currentPage)
      .then(({ data: newData, hasMore: newHasMore }) => {
        if (cancelled || fetchGenRef.current !== generation) return;

        if (newData.length > 0) {
          setData((prev) => [...prev, ...newData]);
        }
        pageRef.current = currentPage + 1;
        setHasMore(newHasMore && newData.length > 0);
      })
      .catch((error) => {
        if (cancelled || fetchGenRef.current !== generation) return;
        console.error("Error fetching more data:", error);
        setHasMore(false);
      })
      .finally(() => {
        if (cancelled || fetchGenRef.current !== generation) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [inView, loading, hasMore]);

  // Reset: replace all data, update hasMore, reset page counter.
  // Increments fetchGenRef to invalidate any in-flight fetch.
  const reset = useCallback((newData: T[], newHasMore: boolean) => {
    fetchGenRef.current++;
    setData(newData);
    setHasMore(newHasMore);
    setLoading(false);
    pageRef.current = 2;
  }, []);

  const updateData = useCallback((updater: (prev: T[]) => T[]) => {
    setData(updater);
  }, []);

  const prependItem = useCallback((item: T) => {
    setData((prev) => [item, ...prev]);
  }, []);

  return {
    data,
    loading,
    ref,
    reset,
    updateData,
    prependItem,
  };
}
