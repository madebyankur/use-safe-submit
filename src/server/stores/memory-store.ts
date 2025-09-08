/**
 * Interface for idempotency key storage implementations.
 * Provides methods for storing, retrieving, and deleting idempotency keys.
 */
export interface IdempotencyStore {
  /**
   * Retrieves a value by key from the store.
   * @param key - The key to look up
   * @returns The stored value or null if not found/expired
   */
  get(key: string): Promise<string | null>;

  /**
   * Stores a value with the given key and optional TTL.
   * @param key - The key to store the value under
   * @param value - The value to store
   * @param timeToLiveMs - Time to live in milliseconds (optional)
   */
  set(key: string, value: string, timeToLiveMs?: number): Promise<void>;

  /**
   * Deletes a key from the store.
   * @param key - The key to delete
   */
  delete(key: string): Promise<void>;
}

/**
 * In-memory implementation of IdempotencyStore.
 *
 * This store keeps all data in memory and is suitable for:
 * - Development and testing
 * - Single-instance applications
 * - Short-lived idempotency keys
 *
 * Note: Data is lost when the process restarts.
 */
export class MemoryStore implements IdempotencyStore {
  private cache = new Map<string, { value: string; expiresAt: number }>();

  /**
   * Retrieves a value by key from the in-memory cache.
   * Automatically removes expired entries.
   * @param key - The key to look up
   * @returns The stored value or null if not found/expired
   */
  async get(key: string): Promise<string | null> {
    const cachedItem = this.cache.get(key);
    if (!cachedItem) return null;

    if (Date.now() > cachedItem.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cachedItem.value;
  }

  /**
   * Stores a value with the given key and TTL in the in-memory cache.
   * @param key - The key to store the value under
   * @param value - The value to store
   * @param timeToLiveMs - Time to live in milliseconds (default: 24 hours)
   */
  async set(
    key: string,
    value: string,
    timeToLiveMs = 24 * 60 * 60 * 1000
  ): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + timeToLiveMs,
    });
  }

  /**
   * Deletes a key from the in-memory cache.
   * @param key - The key to delete
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }
}
