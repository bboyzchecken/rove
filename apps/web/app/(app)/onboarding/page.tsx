'use client';

import { useRouter } from 'next/navigation';

import { CharacterOnboarding } from '@/components/common/character-picker';
import { Logo } from '@/components/common/logo';

/**
 * W14.3 — the first screen a brand-new account sees. One step, one decision,
 * and it is the enjoyable one; everything else can wait until they are inside a
 * trip and have a reason to care.
 */
export default function OnboardingPage() {
  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-10">
      <Logo href={null} size="lg" className="mx-auto mb-8 text-espresso" />
      <CharacterOnboarding onDone={() => router.push('/home')} />
    </main>
  );
}
