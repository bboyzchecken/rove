import { AdminScreen } from '@/components/admin/admin-screen';

/** Admin (M13 — W13.1). Guarded again on the API by IsAdmin. */
export const metadata = { title: 'แอดมิน', robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminScreen />;
}
