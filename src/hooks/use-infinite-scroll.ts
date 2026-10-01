import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

interface UseInfiniteScrollProps<T> {
  initialData: T[];
  initialHasMore: boolean;
  fetchMore: (page: number) => Promise<{ data: T[]; hasMore: boolean }>;
  /** Charge avant que la sentinelle n'entre à l'écran (« 800px 0px »). */
  rootMargin?: string;
  /**
   * Élément qui défile. Nécessaire pour remonter : quand une page est ajoutée
   * au-dessus, la position est corrigée pour que l'écran ne saute pas.
   */
  getScrollElement?: () => HTMLElement | null;
}

/**
 * Liste paginée qui se charge en défilant.
 *
 * La liste est une fenêtre de pages consécutives. Elle part en général de la
 * page 1 et ne grandit que vers le bas ; `resetAt` la fait repartir d'une
 * page quelconque (saut à une date), et la sentinelle `topRef` recharge alors
 * les pages précédentes en remontant.
 */
export function useInfiniteScroll<T>({
  initialData,
  initialHasMore,
  fetchMore,
  rootMargin,
  getScrollElement,
}: UseInfiniteScrollProps<T>) {
  const [data, setData] = useState<T[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  /** Première page présente dans la fenêtre. */
  const [firstPage, setFirstPage] = useState(1);
  /**
   * Compte les remises à zéro : une sentinelle restée à l'écran ne change pas
   * d'état, il faut donc autre chose pour relancer le chargement après coup.
   */
  const [resetCount, setResetCount] = useState(0);
  const { ref, inView } = useInView({ rootMargin });
  const { ref: topRef, inView: topInView } = useInView({ rootMargin });

  const pageRef = useRef(2);
  const fetchGenRef = useRef(0);

  // Assigned during render — always the latest version when the effect reads it.
  const fetchMoreRef = useRef(fetchMore);
  fetchMoreRef.current = fetchMore;
  const getScrollElementRef = useRef(getScrollElement);
  getScrollElementRef.current = getScrollElement;

  /** Hauteur et position relevées juste avant un ajout par le haut. */
  const anchorRef = useRef<{ element: HTMLElement; height: number; top: number } | null>(null);

  // Core loading effect.
  // Depends on [inView, loading, hasMore] so it naturally re-evaluates
  // when loading finishes while the sentinel is still visible.
  useEffect(() => {
    if (!inView || loading || !hasMore) return;

    const currentPage = pageRef.current;
    const generation = ++fetchGenRef.current;

    setLoading(true);

    fetchMoreRef.current(currentPage)
      .then(({ data: newData, hasMore: newHasMore }) => {
        if (fetchGenRef.current !== generation) return;

        if (newData.length > 0) {
          setData((prev) => [...prev, ...newData]);
        }
        pageRef.current = currentPage + 1;
        setHasMore(newHasMore && newData.length > 0);
      })
      .catch((error) => {
        if (fetchGenRef.current !== generation) return;
        console.error("Error fetching more data:", error);
        setHasMore(false);
      })
      .finally(() => {
        if (fetchGenRef.current !== generation) return;
        setLoading(false);
      });
  }, [inView, loading, hasMore, resetCount]);

  // Remontée : la page qui précède la fenêtre, tant qu'il en reste.
  useEffect(() => {
    if (!topInView || loadingPrevious || loading || firstPage <= 1) return;

    const page = firstPage - 1;
    const generation = fetchGenRef.current;
    setLoadingPrevious(true);

    fetchMoreRef.current(page)
      .then(({ data: previous }) => {
        if (fetchGenRef.current !== generation) return;
        const element = getScrollElementRef.current?.() ?? null;
        if (element) {
          anchorRef.current = { element, height: element.scrollHeight, top: element.scrollTop };
        }
        setData((prev) => [...previous, ...prev]);
        setFirstPage(page);
      })
      .catch((error) => console.error("Error fetching previous data:", error))
      .finally(() => setLoadingPrevious(false));
  }, [topInView, loadingPrevious, loading, firstPage, resetCount]);

  // Ce qui vient d'être ajouté au-dessus pousse le contenu : on redescend
  // d'autant, avant que le navigateur ne peigne.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    anchorRef.current = null;
    anchor.element.scrollTop = anchor.top + (anchor.element.scrollHeight - anchor.height);
  }, [data]);

  /** Remplace la fenêtre par une page précise (1 par défaut) et repart de là. */
  const resetAt = useCallback((newData: T[], newHasMore: boolean, page = 1) => {
    fetchGenRef.current++;
    anchorRef.current = null;
    setData(newData);
    setHasMore(newHasMore);
    setLoading(false);
    setLoadingPrevious(false);
    setFirstPage(Math.max(1, page));
    pageRef.current = Math.max(1, page) + 1;
    setResetCount((count) => count + 1);
  }, []);

  // Reset: replace all data, update hasMore, reset page counter.
  // Increments fetchGenRef to invalidate any in-flight fetch.
  const reset = useCallback((newData: T[], newHasMore: boolean) => resetAt(newData, newHasMore, 1), [resetAt]);

  const updateData = useCallback((updater: (prev: T[]) => T[]) => {
    setData(updater);
  }, []);

  const prependItem = useCallback((item: T) => {
    setData((prev) => [item, ...prev]);
  }, []);

  return {
    data,
    loading,
    loadingPrevious,
    ref,
    topRef,
    firstPage,
    reset,
    resetAt,
    updateData,
    prependItem,
  };
}
