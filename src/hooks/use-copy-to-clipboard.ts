import { useEffect, useRef, useState } from "react";

/**
 * Copie dans le presse-papiers. Le retour se lit sur le bouton lui-même
 * (`hasCopied` : l'icône devient une coche, `copyFailed` : une croix),
 * jamais dans une notification.
 */
export function useCopyToClipboard({ resetAfter = 2000 }: { resetAfter?: number } = {}) {
  const [isCopying, setIsCopying] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copyToClipboard = async (text: string) => {
    window.clearTimeout(timer.current);
    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFailed(false);
      setHasCopied(true);
    } catch (error) {
      console.error("Copie impossible :", error);
      setHasCopied(false);
      setCopyFailed(true);
    } finally {
      setIsCopying(false);
      timer.current = window.setTimeout(() => {
        setHasCopied(false);
        setCopyFailed(false);
      }, resetAfter);
    }
  };

  return { isCopying, hasCopied, copyFailed, copyToClipboard };
}
