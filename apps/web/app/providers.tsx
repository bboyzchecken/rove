'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { NextIntlClientProvider } from 'next-intl';

import { capturePageview, initAnalytics } from '@/lib/analytics';
import { ApiError } from '@/lib/api-client';
import messages from '@/messages/th.json';

/**
 * TanStack Query is the ONLY layer that holds server data (DEV_SPEC §2.1).
 * Zustand is for UI state — drag state, open panels — and nothing else.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Never retry an auth or permission failure — it will never succeed.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  // One client per browser session, created lazily so SSR does not share it.
  const [queryClient] = useState(makeQueryClient);

  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="th" messages={messages} timeZone="Asia/Bangkok">
        {children}
        {/* useSearchParams needs a Suspense boundary or it opts the whole tree
            out of static rendering. */}
        <Suspense fallback={null}>
          <PageviewTracker />
        </Suspense>
      </NextIntlClientProvider>
      {process.env.NODE_ENV === 'development' ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}

/** The App Router changes the URL without a load, so pageviews are manual. */
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    capturePageview(query ? `${pathname}?${query}` : pathname);
  }, [pathname, searchParams]);

  return null;
}
