/**
 * @fileoverview Main exports for the next-safe-submit library.
 *
 * This library provides tools for preventing double form submissions and
 * implementing idempotency in both client-side React components and
 * server-side request handlers.
 *
 * @example
 * ```typescript
 * // Client-side usage
 * import { useSafeSubmit } from 'next-safe-submit';
 *
 * // Server-side usage
 * import { withIdempotency, MemoryStore } from 'next-safe-submit/server';
 * ```
 */

// Client-side exports
export { useSafeSubmit } from "./client/use-safe-submit";
export type {
  SafeSubmitOptions,
  SafeSubmitResult,
} from "./client/use-safe-submit";

// Server-side exports
export { withIdempotency } from "./server/with-idempotency";
export type {
  IdempotencyOptions,
  IdempotencyResult,
} from "./server/with-idempotency";

// Store implementations
export { MemoryStore } from "./server/stores/memory-store";
export { RedisStore } from "./server/stores/redis-store";
export type { IdempotencyStore } from "./server/stores/memory-store";
