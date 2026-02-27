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
  const [loading, setLoading] = useState(false);
  const { ref, inView } = useInView();

  // Use refs for values that should NOT re-trigger the effect
  const pageRef = useRef(2); // Start at 2: initialData already contains page 1
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(hasMore);
  const fetchMoreRef = useRef(fetchMore);

  // Keep refs in sync
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    fetchMoreRef.current = fetchMore;
  }, [fetchMore]);

  // Core fetch effect: only depends on [inView]
  useEffect(() => {
    if (!inView || !hasMoreRef.current || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    const currentPage = pageRef.current;

    fetchMoreRef.current(currentPage)
      .then((newData) => {
        if (newData.length > 0) {
          setData((prev) => [...prev, ...newData]);
          pageRef.current = currentPage + 1;
        }
      })
      .catch((error) => {
        console.error("Error fetching more data:", error);
      })
      .finally(() => {
        loadingRef.current = false;
        setLoading(false);
      });
  }, [inView]);

  // Full reset: replace all data and reset page counter
  const reset = useCallback((newData: T[]) => {
    setData(newData);
    pageRef.current = 2;
    loadingRef.current = false;
    setLoading(false);
  }, []);

  // In-place update: modify data without touching page counter
  const updateData = useCallback((updater: (prev: T[]) => T[]) => {
    setData(updater);
  }, []);

  // Prepend a single item without resetting page counter
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
