# components/

| folder      | holds                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| `ui/`       | shadcn/ui primitives — generated, do not hand-edit beyond theming        |
| `common/`   | app-wide shells: empty state, error state, page header, loading skeleton |
| `trip/`     | trip room chrome: member list, frame card, invite dialog, activity feed  |
| `wishlist/` | wishlist editor, coverage board                                          |
| `editor/`   | itinerary timeline, item card, drag-and-drop (dnd-kit)                   |
| `budget/`   | budget summary, per-person breakdown                                     |
| `prep/`     | weather, packing list, checklists                                        |
| `public/`   | public plan page and its OG/share surfaces                               |

Rule: a component that fetches its own data imports a hook from `features/*/queries.ts`.
It never calls `apiFetch` directly.
