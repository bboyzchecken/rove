import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * OpenNext → Cloudflare Workers.
 *
 * Empty on purpose. The adapter's optional overrides are all about caching
 * ISR/data across requests (R2 or KV incremental cache, a durable-object queue
 * for revalidation), and this deployment has nothing to cache: it is the UAT
 * build, which runs in mock mode, where every page is rendered per request and
 * all state lives in the visitor's own localStorage.
 *
 * Adding an incremental cache would mean provisioning an R2 bucket to hold
 * nothing. When the live build lands — real API, real ISR — this is the file
 * that grows.
 */
export default defineCloudflareConfig();
