import { AdminShell } from '@/components/admin/admin-shell';

/**
 * The admin console's own root (Phase 5 — W25.2).
 *
 * A route group rather than a folder under `(app)`: the console is not the
 * signed-in traveller app with an extra page, it is a different surface with a
 * different palette, a different density and a different audience. Keeping it
 * inside `AppShell` meant a bottom tab bar under a data table.
 *
 * `data-surface="admin"` is the entire theme switch. `styles/brand.css`
 * re-declares the brand tokens under that attribute, so every component below
 * — the same `Card`, `Button` and `Input` the rest of the app uses — comes out
 * dark without a single component knowing about it (W25.1).
 *
 * `/admin/login` deliberately stays outside this tree, at `app/admin/login`:
 * the sign-in door has no sidebar to show and nothing to put in it.
 *
 * `proxy.ts` needs no change — `/admin` is already in `GUARDED` and
 * `/admin/login` in `OPEN`, and the URLs did not move.
 */
export const metadata = {
  title: 'แอดมิน',
  // Never indexed, at any URL under here.
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="admin">
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
