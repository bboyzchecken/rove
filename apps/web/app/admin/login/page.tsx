import { Suspense } from 'react';

import { AdminLoginScreen } from '@/components/auth/admin-login-screen';

/**
 * The dev/admin sign-in door, split out of `/login` on purpose (§16) — see
 * `AdminLoginScreen` for why. Not linked from anywhere a regular user would
 * find it; `robots` keeps it out of search results too.
 */
export const metadata = { title: 'เข้าสู่ระบบ (admin)', robots: { index: false, follow: false } };

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginScreen />
    </Suspense>
  );
}
