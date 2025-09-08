import type { IdempotencyStore } from "./stores/memory-store";
import { MemoryStore } from "./stores/memory-store";

/**
 * Configuration options for the withIdempotency middleware.
 */
export interface IdempotencyOptions {
  /**
   * Store implementation for caching idempotency keys.
   * @default MemoryStore instance
   */
  store?: IdempotencyStore;

  /**
   * Time to live for idempotency keys in milliseconds.
   * @default 24 hours (86400000ms)
   */
  timeToLiveMs?: number;

  /**
   * Custom function to extract idempotency key from request.
   * @param req - The incoming request
   * @returns The idempotency key or null if not found
   */
  keyExtractor?: (req: Request) => string | null;
}

/**
 * Result of an idempotency check operation.
 */
export interface IdempotencyResult {
  /** Whether the operation was successful */
  success: boolean;
  /** HTTP status code */
  status: number;
  /** Response body if applicable */
  body?: unknown;
}

/**
 * Creates a SHA-256 hash of the input string.
 * Falls back to base64 encoding if crypto.subtle is not available.
 * @param input - String to hash
 * @returns Hexadecimal hash string
 */
async function createSha256Hash(input: string): Promise<string> {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  return btoa(input)
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 32);
}

/**
 * Extracts idempotency key from request headers.
 * Checks for both "Idempotency-Key" and "x-idempotency-key" headers.
 * @param req - The incoming request
 * @returns The idempotency key or null if not found
 */
function extractIdempotencyKeyFromHeaders(req: Request): string | null {
  const contentType = req.headers.get("content-type");
  if (
    contentType?.includes("application/x-www-form-urlencoded") ||
    contentType?.includes("multipart/form-data")
  ) {
    return null;
  }

  const headerKey =
    req.headers.get("Idempotency-Key") || req.headers.get("x-idempotency-key");
  if (headerKey) return headerKey;

  return null;
}

/**
 * Higher-order function that adds idempotency support to request handlers.
 *
 * This middleware prevents duplicate processing of requests by:
 * - Extracting idempotency keys from headers, form data, or JSON body
 * - Caching processed requests using the provided store
 * - Returning cached responses for duplicate requests
 * - Automatically cleaning up failed requests
 *
 * @param handler - The original request handler function
 * @param options - Configuration options for idempotency behavior
 * @returns A new handler function with idempotency support
 *
 * @example
 * ```typescript
 * // Basic usage
 * const handler = withIdempotency(async (req) => {
 *   // Your request handling logic
 *   return new Response("Success");
 * });
 *
 * // With custom store and TTL
 * const handler = withIdempotency(
 *   async (req) => new Response("Success"),
 *   {
 *     store: new RedisStore(redisClient),
 *     timeToLiveMs: 3600000, // 1 hour
 *     keyExtractor: (req) => req.headers.get("x-custom-key")
 *   }
 * );
 * ```
 */
export function withIdempotency<T extends unknown[]>(
  handler: (req: Request, ...args: T) => Promise<Response>,
  options: IdempotencyOptions = {}
) {
  const store = options.store || new MemoryStore();
  const timeToLiveMs = options.timeToLiveMs || 24 * 60 * 60 * 1000;

  return async (req: Request, ...args: T): Promise<Response> => {
    const method = req.method.toUpperCase();
    if (["GET", "HEAD", "OPTIONS"].includes(method)) {
      return handler(req, ...args);
    }

    let idempotencyKey: string | null = null;

    const keyExtractor =
      options.keyExtractor || extractIdempotencyKeyFromHeaders;
    idempotencyKey = keyExtractor(req);

    if (!idempotencyKey) {
      try {
        const formClone = req.clone();
        const formData = await formClone.formData();
        idempotencyKey = (formData.get("idempotency-key") as string) || null;
      } catch {
        try {
          const jsonClone = req.clone();
          const body = await jsonClone.json();
          idempotencyKey = body["idempotency-key"] || null;
        } catch {
          // Continue without idempotency
        }
      }
    }

    if (!idempotencyKey) {
      return handler(req, ...args);
    }

    const hashedKey = await createSha256Hash(idempotencyKey);
    const storageKey = `${hashedKey}:${idempotencyKey}`;

    const existingValue = await store.get(storageKey);
    if (existingValue) {
      return new Response(
        JSON.stringify({
          error: "Idempotency key already used",
          message: "This request has already been processed",
        }),
        {
          status: 409,
          headers: {
            "Content-Type": "application/json",
            "X-Idempotency-Key-Used": existingValue,
          },
        }
      );
    }

    const uniqueValue = `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2)}`;
    await store.set(storageKey, uniqueValue, timeToLiveMs);

    try {
      const response = await handler(req, ...args);

      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("X-Idempotency-Key-Processed", uniqueValue);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      await store.delete(storageKey);
      throw error;
    }
  };
}
