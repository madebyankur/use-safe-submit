import { describe, it, expect, vi, beforeEach } from "vitest";
import { withIdempotency } from "../src/server/with-idempotency";
import {
  MemoryStore,
  type IdempotencyStore,
} from "../src/server/stores/memory-store";

Object.defineProperty(globalThis, "crypto", {
  value: {
    subtle: {
      digest: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
    },
  },
});

describe("withIdempotency", () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    store = new MemoryStore();
    vi.clearAllMocks();
  });

  it("should allow first request with idempotency key", async () => {
    const handler = vi.fn().mockResolvedValue(new Response("Success"));
    const wrappedHandler = withIdempotency(handler, { store });

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "x-idempotency-key": "test-key-123" },
    });

    const response = await wrappedHandler(request);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should return 409 for duplicate idempotency key", async () => {
    const handler = vi.fn().mockResolvedValue(new Response("Success"));
    const wrappedHandler = withIdempotency(handler, { store });

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "x-idempotency-key": "test-key-123" },
    });

    // First request should succeed
    const response1 = await wrappedHandler(request);
    expect(response1.status).toBe(200);

    // Second request with same key should fail
    const response2 = await wrappedHandler(request);
    expect(response2.status).toBe(409);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should extract idempotency key from form data", async () => {
    const handler = vi.fn().mockResolvedValue(new Response("Success"));
    const wrappedHandler = withIdempotency(handler, { store });

    const formData = new FormData();
    formData.append("idempotency-key", "form-key-123");
    formData.append("email", "test@example.com");

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: formData,
    });

    const response = await wrappedHandler(request);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should extract idempotency key from JSON body", async () => {
    const handler = vi.fn().mockResolvedValue(new Response("Success"));
    const wrappedHandler = withIdempotency(handler, { store });

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "idempotency-key": "json-key-123",
        email: "test@example.com",
      }),
    });

    const response = await wrappedHandler(request);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should skip idempotency for GET requests", async () => {
    const handler = vi.fn().mockResolvedValue(new Response("Success"));
    const wrappedHandler = withIdempotency(handler, { store });

    const request = new Request("http://localhost/api/test", {
      method: "GET",
      headers: { "x-idempotency-key": "test-key-123" },
    });

    const response = await wrappedHandler(request);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should proceed without idempotency if no key provided", async () => {
    const handler = vi.fn().mockResolvedValue(new Response("Success"));
    const wrappedHandler = withIdempotency(handler, { store });

    const request = new Request("http://localhost/api/test", {
      method: "POST",
    });

    const response = await wrappedHandler(request);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should add idempotency headers to response", async () => {
    const handler = vi.fn().mockResolvedValue(new Response("Success"));
    const wrappedHandler = withIdempotency(handler, { store });

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "x-idempotency-key": "test-key-123" },
    });

    const response = await wrappedHandler(request);

    expect(response.headers.get("X-Idempotency-Key-Processed")).toBeTruthy();
  });

  it("should remove key from store if handler throws", async () => {
    const error = new Error("Handler failed");
    const handler = vi.fn().mockRejectedValue(error);
    const wrappedHandler = withIdempotency(handler, { store });

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "x-idempotency-key": "test-key-123" },
    });

    await expect(wrappedHandler(request)).rejects.toThrow("Handler failed");

    const storedValue = await store.get("test-key-123");
    expect(storedValue).toBeNull();
  });

  it("should use custom key extractor", async () => {
    const customExtractor = vi.fn().mockReturnValue("custom-key-123");
    const handler = vi.fn().mockResolvedValue(new Response("Success"));
    const wrappedHandler = withIdempotency(handler, {
      store,
      keyExtractor: customExtractor,
    });

    const request = new Request("http://localhost/api/test", {
      method: "POST",
    });

    const response = await wrappedHandler(request);

    expect(customExtractor).toHaveBeenCalledWith(request);
    expect(response.status).toBe(200);
  });

  it("should handle different key formats", async () => {
    const handler = vi.fn().mockResolvedValue(new Response("Success"));
    const wrappedHandler = withIdempotency(handler, { store });

    const keys = [
      "simple-key",
      "key-with-dashes",
      "key_with_underscores",
      "key123",
    ];

    for (const key of keys) {
      const request = new Request("http://localhost/api/test", {
        method: "POST",
        headers: { "x-idempotency-key": key },
      });

      const response = await wrappedHandler(request);
      expect(response.status).toBe(200);
    }

    // All should be processed successfully
    expect(handler).toHaveBeenCalledTimes(keys.length);
  });
});
