import { Suspense } from 'react';

import { LoginScreen } from '@/components/auth/login-screen';

/**
 * Sign-in lives outside `(app)` on purpose: that group is the chrome for a
 * signed-in user, and this is the page they see before they are one.
 */
export const metadata = { title: 'เข้าสู่ระบบ' };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
