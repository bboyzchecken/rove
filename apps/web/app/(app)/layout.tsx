import { AppShell } from '@/components/common/app-shell';

/** Everything behind the sign-in wall shares one chrome (DEV_SPEC §3.2). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
