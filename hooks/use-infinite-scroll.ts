import { useCallback, useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

interface UseInfiniteScrollProps<T> {
  initialData: T[];
  fetchMore: (page: number) => Promise<{ data: T[]; hasMore: boolean }>;
  initialHasMore: boolean;
}

export function useInfiniteScroll<T>({
  initialData,
  fetchMore,
  initialHasMore,
}: UseInfiniteScrollProps<T>) {
  const [data, setData] = useState<T[]>(initialData);
  const [loading, setLoading] = useState(false);
  const { ref, inView } = useInView();

  // Refs for values that should NOT re-trigger effects
  const pageRef = useRef(2); // Start at 2: initialData already contains page 1
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(initialHasMore);
  const fetchMoreRef = useRef(fetchMore);
  const inViewRef = useRef(false);

  // Keep refs in sync
  useEffect(() => {
    fetchMoreRef.current = fetchMore;
  }, [fetchMore]);

  useEffect(() => {
    inViewRef.current = inView;
  }, [inView]);

  // Core load function (stored in ref to avoid stale closures)
  const loadMoreRef = useRef<() => void>();
  loadMoreRef.current = () => {
    if (!inViewRef.current || !hasMoreRef.current || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    const currentPage = pageRef.current;

    fetchMoreRef.current(currentPage)
      .then(({ data: newData, hasMore: newHasMore }) => {
        // Update hasMoreRef synchronously so re-check sees the correct value
        hasMoreRef.current = newHasMore;

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

        // After DOM update, check if sentinel is still visible → load more
        requestAnimationFrame(() => {
          if (inViewRef.current && hasMoreRef.current && !loadingRef.current) {
            loadMoreRef.current?.();
          }
        });
      });
  };

  // Trigger load when sentinel enters view
  useEffect(() => {
    if (inView) {
      loadMoreRef.current?.();
    }
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

  // Allow caller to update hasMore (e.g. after a filter reset)
  const setHasMore = useCallback((value: boolean) => {
    hasMoreRef.current = value;
  }, []);

  return {
    data,
    loading,
    ref,
    reset,
    updateData,
    prependItem,
    setHasMore,
  };
}
