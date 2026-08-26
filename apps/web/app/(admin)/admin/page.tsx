import { AdminScreen } from '@/components/admin/admin-screen';

/**
 * The admin overview (M13 — W13.1, rehoused by Phase 5 W25.4).
 *
 * Same URL, same content, new shell: the move from `app/(app)/admin` was the
 * point of W25.2, and the feature set is deliberately unchanged so the before
 * and after can be compared.
 */
export default function AdminPage() {
  return <AdminScreen />;
}
