# features/

One folder per domain, always the same three files:

```
features/<domain>/
  types.ts     the API response shapes (snake_case — mirror the Go DTO exactly)
  api.ts       thin fetchers built on lib/api-client
  queries.ts   the TanStack Query hooks components actually import
```

Rules (DEV_SPEC §7.1, §17)

- components import from `queries.ts`, never from `api.ts`
- every key comes from `lib/query-keys.ts` — no inline arrays
- every mutation is optimistic with a rollback in `onError`
- server data lives in TanStack Query only; Zustand is for UI state

`features/trip` is the reference implementation of the pattern.
