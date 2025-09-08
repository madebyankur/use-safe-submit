import type { IdempotencyStore } from "./memory-store";

/**
 * Redis implementation of IdempotencyStore.
 *
 * This store uses Redis for persistent idempotency key storage and is suitable for:
 * - Production applications
 * - Multi-instance deployments
 * - Long-lived idempotency keys
 * - High-availability scenarios
 *
 * @example
 * ```typescript
 * import { createClient } from 'redis';
 * import { RedisStore } from './redis-store';
 *
 * const redisClient = createClient({ url: 'redis://localhost:6379' });
 * const store = new RedisStore(redisClient, 'myapp:idempotency:');
 * ```
 */
export class RedisStore implements IdempotencyStore {
  private redisClient: any;
  private keyPrefix: string;

  /**
   * Creates a new RedisStore instance.
   * @param redisClient - Redis client instance (any Redis-compatible client)
   * @param keyPrefix - Prefix for all stored keys (default: "idempotency:")
   */
  constructor(redisClient: any, keyPrefix = "idempotency:") {
    this.redisClient = redisClient;
    this.keyPrefix = keyPrefix;
  }

  /**
   * Creates a prefixed key for Redis storage.
   * @param key - The original key
   * @returns The prefixed key
   */
  private createPrefixedKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Retrieves a value by key from Redis.
   * @param key - The key to look up
   * @returns The stored value or null if not found/expired
   */
  async get(key: string): Promise<string | null> {
    try {
      const value = await this.redisClient.get(this.createPrefixedKey(key));
      return value;
    } catch (error) {
      console.error("Redis get error:", error);
      return null;
    }
  }

  /**
   * Stores a value with the given key and TTL in Redis.
   * @param key - The key to store the value under
   * @param value - The value to store
   * @param timeToLiveSeconds - Time to live in seconds (default: 24 hours)
   */
  async set(
    key: string,
    value: string,
    timeToLiveSeconds = 24 * 60 * 60
  ): Promise<void> {
    try {
      await this.redisClient.setex(
        this.createPrefixedKey(key),
        timeToLiveSeconds,
        value
      );
    } catch (error) {
      console.error("Redis set error:", error);
      throw error;
    }
  }

  /**
   * Deletes a key from Redis.
   * @param key - The key to delete
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redisClient.del(this.createPrefixedKey(key));
    } catch (error) {
      console.error("Redis delete error:", error);
    }
  }
}
