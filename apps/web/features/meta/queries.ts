'use client';

import { useQuery } from '@tanstack/react-query';

import { repo } from '@/lib/data';
import type { StubbedProvider } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';

/**
 * What is real behind this screen.
 *
 * Two switches decide that, and they are independent: the web app's own data
 * mode (mock = browser-only, nothing is stored anywhere) and the API's
 * STUB_PROVIDERS (the data is real, some third parties are stand-ins). Before
 * this hook the UI only knew the first, so a build set to `live` in front of an
 * API stubbing Anthropic showed no label at all — the screens said "ต่อระบบจริง"
 * while the AI draft came out of a canned file.
 *
 * Components ask this, never the environment. `mockSkips` in `lib/data/mode`
 * answers the same question for mock mode without a round trip; this is the
 * version that also holds in live mode.
 */
export function useProviderMode() {
  return useQuery({
    queryKey: queryKeys.mode(),
    queryFn: () => repo.meta.mode(),
    // The answer changes when the server is redeployed, not while someone is
    // looking at a page.
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/**
 * Is this particular third party a stand-in right now?
 *
 * Returns false while the answer is still loading: a label that flashes "this
 * is simulated" onto a screen that turns out to be real is worse than one that
 * appears a moment late.
 */
export function useIsStubbed(provider: StubbedProvider) {
  const { data } = useProviderMode();
  return data?.stubbed.includes(provider) ?? false;
}
