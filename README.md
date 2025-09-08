# useSafeSubmit

A small framework-agnostic helper for preventing duplicate submissions with automatic idempotency key generation client-side and server-side idempotency.

![useSafeSubmit](/assets/cover.png)

## Installation

You can install it directly from GitHub:

```bash
npm install https://github.com/madebyankur/use-safe-submit.git
```

Or add it to your `package.json`:

```json
{
  "dependencies": {
    "use-safe-submit": "github:madebyankur/use-safe-submit"
  }
}
```

## Features

- Prevents double-click and accidental resubmits
- Automatic idempotency key generation (crypto.randomUUID())
- Works on Edge (Vercel Functions) and Node
- Framework-agnostic, works with any React setup
- Accessible defaults (disabled state, ARIA, focus return)
- Optional retry logic for specific status codes

## Quick Start

### Client-side (React Hook)

The hook automatically generates a UUID idempotency key and injects it into the request:

- If your submission uses `FormData`, it appends a hidden field `idempotency-key` to the form data
- If your submission uses `fetch` with JSON (or any body), the hook temporarily wraps `fetch` during the submission to set the `Idempotency-Key` header

```tsx
import { useSafeSubmit } from "use-safe-submit";

export default function SubscribeForm() {
  const { handleSubmit, isSubmitting, error } = useSafeSubmit(
    async (formData: FormData) => {
      // You don't need to add the key manually.
      // The hook already appended `idempotency-key` to this FormData
      const response = await fetch("/api/subscribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Subscription failed");
      }
    },
    {
      retryableStatusCodes: [502, 503],
      onError: (err) => console.error("Submission error:", err),
    }
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input name="email" type="email" required aria-invalid={!!error} />
      <div role="alert" aria-live="polite">
        {error && <span>Error: {String(error)}</span>}
      </div>
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Submitting..." : "Subscribe"}
      </button>
    </form>
  );
}
```

### Server-side

The server wrapper automatically extracts the key from either:

- `Idempotency-Key` request header, or
- `idempotency-key` in form data, or
- `idempotency-key` in JSON body

You do NOT need to read the idempotency key in your handler.

#### Next.js App Router

```tsx
// app/subscribe/route.ts
import { NextResponse } from "next/server";
import { withIdempotency, MemoryStore } from "use-safe-submit/server";

const store = new MemoryStore(); // Use RedisStore in production

async function subscribeHandler(req: Request) {
  // No need to read idempotency key here; it's validated by the wrapper
  const formData = await req.formData();
  const email = formData.get("email");

  return NextResponse.json({ success: true });
}

export const POST = withIdempotency(subscribeHandler, { store });
```

#### Next.js Pages Router

```tsx
// pages/api/subscribe.ts
import { withIdempotency, MemoryStore } from "use-safe-submit/server";

const store = new MemoryStore(); // Use RedisStore in production

async function subscribeHandler(req: Request) {
  const formData = await req.formData();
  const email = formData.get("email");

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

export default withIdempotency(subscribeHandler, { store });
```

#### Express.js

```tsx
import express from "express";
import { withIdempotency, MemoryStore } from "use-safe-submit/server";

const app = express();
const store = new MemoryStore();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const subscribeHandler = async (req: Request) => {
  const { email } = req.body;
  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
};

app.post("/api/subscribe", withIdempotency(subscribeHandler, { store }));
```

## API Reference

### `useSafeSubmit`

```tsx
const { handleSubmit, isSubmitting, error, idempotencyKey, reset } =
  useSafeSubmit(submitFn, options);
```

#### Parameters

- `submitFn: (formData: FormData) => Promise<void>` - Your submission function
- `options?: SafeSubmitOptions` - Configuration options

#### Returns

- `handleSubmit: (e: FormEvent) => Promise<void>` - Form submission handler
- `isSubmitting: boolean` - Loading state
- `error: unknown` - Error state
- `idempotencyKey: string` - Generated idempotency key
- `reset: () => void` - Reset function

#### Options

```tsx
interface SafeSubmitOptions {
  retryableStatusCodes?: number[]; // Status codes to retry on
  disabledClassName?: string; // CSS class for disabled state
  onError?: (error: unknown) => void; // Error callback
  onSuccess?: () => void; // Success callback
}
```

### `withIdempotency`

```tsx
const wrappedHandler = withIdempotency(handler, options);
```

#### Parameters

- `handler: (req: Request, ...args) => Promise<Response>` - Your API handler
- `options?: IdempotencyOptions` - Configuration options

#### Options

```tsx
interface IdempotencyOptions {
  store?: IdempotencyStore; // Storage backend (default: MemoryStore)
  timeToLiveMs?: number; // Time-to-live in milliseconds (default: 24h)
  keyExtractor?: (req: Request) => string | null; // Custom key extractor
}
```

## Storage Backends

### Recommended for production: Redis (Upstash)

```tsx
import { RedisStore } from "use-safe-submit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const store = new RedisStore(redis);
```

- Default time-to-live: 24 hours. Prevents replay within a day; tune per use case.
- Cross-tab safe: server-side enforcement ensures duplicate submits from multiple tabs reuse the key and are rejected.

### Development: MemoryStore

```tsx
import { MemoryStore } from "use-safe-submit";
const store = new MemoryStore();
```

## Accessibility

- While submitting, the hook disables the submit button automatically
- On error, focus returns to the first `[aria-invalid="true"]` field or the submit button
- Announce errors using `role="alert"` and `aria-live` regions (see example above)

## Examples

### Basic Form (React)

```tsx
function ContactForm() {
  const { handleSubmit, isSubmitting } = useSafeSubmit(async (formData) => {
    await fetch("/api/contact", { method: "POST", body: formData });
  });

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" required />
      <input name="email" type="email" required />
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sending..." : "Send"}
      </button>
    </form>
  );
}
```

### Next.js with App Router

```tsx
"use client";
import { useSafeSubmit } from "use-safe-submit";

export default function SubscribeForm() {
  const { handleSubmit, isSubmitting, error } = useSafeSubmit(
    async (formData: FormData) => {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Subscription failed");
      }
    }
  );

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" required />
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Subscribing..." : "Subscribe"}
      </button>
    </form>
  );
}
```

### Remix

```tsx
import { useSafeSubmit } from "use-safe-submit";

export default function ContactForm() {
  const { handleSubmit, isSubmitting } = useSafeSubmit(async (formData) => {
    await fetch("/api/contact", {
      method: "POST",
      body: formData,
    });
  });

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" required />
      <input name="email" type="email" required />
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sending..." : "Send"}
      </button>
    </form>
  );
}
```

### Vite + React

```tsx
import { useSafeSubmit } from "use-safe-submit";

function LoginForm() {
  const { handleSubmit, isSubmitting, error } = useSafeSubmit(
    async (formData: FormData) => {
      const response = await fetch("/api/login", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Login failed");
      }
    }
  );

  return (
    <form onSubmit={handleSubmit}>
      <input name="username" required />
      <input name="password" type="password" required />
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Logging in..." : "Login"}
      </button>
      {error && <div>Error: {String(error)}</div>}
    </form>
  );
}
```

## Manual Testing (expected behavior)

- Double-click submit → 1 server call
- Refresh & resubmit same body within TTL → 409
- Two tabs, same intent → 409 for second
- Retry on 502/503 → retries then success
- Works on Vercel Edge, Node.js, and other runtimes

## Edge Function Support

- Uses `globalThis.crypto.subtle` for SHA-256 hashing
- No Node.js-specific APIs
- Upstash Redis recommended for storage

## Development

### Running Tests

Run the test suite:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

### Building

Build the library:

```bash
npm run build
```
