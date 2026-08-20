import type { Route } from 'next';

/**
 * `typedRoutes` checks every <Link href> against the real route tree, which
 * catches a typo'd path at build time. It cannot check an href that was built
 * at runtime and passed through a variable or a prop.
 *
 * `route()` is the one place those are asserted, so the escape hatch is
 * greppable rather than scattered as inline casts.
 */
export function route(href: string): Route {
  return href as Route;
}
