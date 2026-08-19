# packages/

Empty on purpose. Code moves here when **both apps** need it — realistically the
API response types, once they are generated from the Go structs instead of
hand-written in `apps/web/features/*/types.ts`.

Do not add a workspace tool (Turborepo, pnpm workspaces) until there is a real
package to share. Today `apps/web` is the only Node package and `apps/api` is a
Go module; a workspace layer would be pure overhead.
