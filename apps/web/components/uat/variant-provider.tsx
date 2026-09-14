'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  UAT_VARIANTS_ENABLED,
  defaultSelection,
  variantCookieName,
  type VariantId,
  type VariantKey,
  type VariantSelection,
} from '@/lib/uat/variants';

/**
 * Holds the tester's A/B/C choices for the life of the page (F0.1).
 *
 * The initial selection comes from the server — the root layout reads the
 * cookies and hands them down — so the first render already shows the chosen
 * variant. Switching writes the cookie and refreshes the router, which is what
 * lets a *server* component (the landing page) change too; client components
 * follow the context state on the same tick.
 */
interface VariantContextValue {
  selection: VariantSelection;
  setVariant: <K extends VariantKey>(key: K, id: VariantId<K>) => void;
}

const VariantContext = createContext<VariantContextValue>({
  selection: defaultSelection(),
  setVariant: () => {},
});

const ONE_YEAR = 60 * 60 * 24 * 365;

export function VariantProvider({
  initial,
  children,
}: {
  initial: VariantSelection;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<VariantSelection>(initial);

  const setVariant = useCallback(
    <K extends VariantKey>(key: K, id: VariantId<K>) => {
      if (!UAT_VARIANTS_ENABLED) return;
      document.cookie = `${variantCookieName(key)}=${encodeURIComponent(id)}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
      setSelection((current) => ({ ...current, [key]: id }));
      router.refresh();
    },
    [router],
  );

  const value = useMemo(() => ({ selection, setVariant }), [selection, setVariant]);
  return <VariantContext.Provider value={value}>{children}</VariantContext.Provider>;
}

/** Which variant of `key` this screen should render. */
export function useVariant<K extends VariantKey>(key: K): VariantId<K> {
  return useContext(VariantContext).selection[key];
}

export function useVariantSwitch() {
  return useContext(VariantContext);
}
