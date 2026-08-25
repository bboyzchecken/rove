'use client';

import { useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useLogin } from '@/features/auth/queries';

/**
 * The two real sign-in buttons, shared by the user door (`/login`) and the
 * staff door (`/admin/login`).
 *
 * They are the same two providers on purpose. "Admins sign in separately" is
 * about *which door*, not about a second kind of credential: the API decides
 * who is staff from ADMIN_EMAILS after the provider vouches for the person
 * (`findOrCreateUser`), so a second auth mechanism would be one more thing to
 * get wrong for no extra safety.
 */
export function OAuthButtons({ next, disabled }: { next: string; disabled?: boolean }) {
  const router = useRouter();
  const login = useLogin();

  const signIn = (provider: 'line' | 'google') => {
    login.mutate(
      { provider, next },
      {
        // Mock mode signs in without leaving the page, so the navigation that
        // live mode gets from its redirect has to happen here instead.
        onSuccess: (result) => {
          if (!result.redirectUrl && result.user) router.replace(next as never);
        },
      },
    );
  };

  const busy = disabled || login.isPending;

  return (
    <div className="flex flex-col gap-2.5">
      <Button
        size="lg"
        block
        onClick={() => signIn('line')}
        disabled={busy}
        aria-label="เข้าสู่ระบบด้วย LINE"
      >
        <MessageCircle className="size-5" strokeWidth={2.5} />
        เข้าสู่ระบบด้วย LINE
      </Button>

      <Button
        size="lg"
        variant="outline"
        block
        onClick={() => signIn('google')}
        disabled={busy}
        aria-label="เข้าสู่ระบบด้วย Google"
      >
        <GoogleMark />
        เข้าสู่ระบบด้วย Google
      </Button>

      {login.isError ? (
        <p className="text-muted text-center text-sm">เริ่มการเข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง</p>
      ) : null}
    </div>
  );
}

/** Google's mark, inline — lucide has no brand icons and a CDN is not an option. */
function GoogleMark() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.26-2.09 3.56-5.17 3.56-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.87-3a7.2 7.2 0 0 1-10.72-3.78H1.36v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.35 14.31a7.2 7.2 0 0 1 0-4.6V6.62H1.36a12 12 0 0 0 0 10.78l3.99-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.36 6.62l3.99 3.09A7.2 7.2 0 0 1 12 4.75Z"
      />
    </svg>
  );
}
