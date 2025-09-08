import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useSafeSubmit,
  type SafeSubmitOptions,
} from "../src/client/use-safe-submit";

Object.defineProperty(globalThis, "crypto", {
  value: {
    randomUUID: () => "test-uuid-123",
  },
});

function TestComponent({
  submitFn,
  options = {},
}: {
  submitFn: (formData: FormData) => Promise<void>;
  options?: SafeSubmitOptions;
}) {
  const { handleSubmit, isSubmitting, error, idempotencyKey } = useSafeSubmit(
    submitFn,
    options
  );

  return (
    <form onSubmit={handleSubmit} data-testid="form">
      <input name="email" type="email" defaultValue="test@example.com" />
      <input type="hidden" name="idempotency-key" value={idempotencyKey} />
      <button type="submit" disabled={isSubmitting} data-testid="submit">
        {isSubmitting ? "Submitting..." : "Submit"}
      </button>
      {error !== undefined && <div data-testid="error">{String(error)}</div>}
    </form>
  );
}

describe("useSafeSubmit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should prevent double submission", async () => {
    const submitFn = vi.fn().mockResolvedValue(undefined);

    render(<TestComponent submitFn={submitFn} />);

    const form = screen.getByTestId("form");

    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => {
      expect(submitFn).toHaveBeenCalledTimes(1);
    });
  });

  it("should generate and include idempotency key in form data", async () => {
    const submitFn = vi.fn().mockImplementation(async (formData: FormData) => {
      expect(formData.get("idempotency-key")).toBe("test-uuid-123");
    });

    render(<TestComponent submitFn={submitFn} />);

    const form = screen.getByTestId("form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(submitFn).toHaveBeenCalledTimes(1);
    });
  });

  it("should show loading state during submission", async () => {
    const submitFn = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

    render(<TestComponent submitFn={submitFn} />);

    const submitButton = screen.getByTestId("submit");
    const form = screen.getByTestId("form");

    expect(submitButton).toHaveTextContent("Submit");
    expect(submitButton).not.toBeDisabled();

    fireEvent.submit(form);

    await waitFor(() => {
      expect(submitButton).toHaveTextContent("Submitting...");
      expect(submitButton).toBeDisabled();
    });
  });

  it("should handle submission errors", async () => {
    const error = new Error("Submission failed");
    const submitFn = vi.fn().mockRejectedValue(error);

    render(<TestComponent submitFn={submitFn} />);

    const form = screen.getByTestId("form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent(
        "Submission failed"
      );
    });
  });

  it("should call onSuccess callback on successful submission", async () => {
    const submitFn = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();

    render(<TestComponent submitFn={submitFn} options={{ onSuccess }} />);

    const form = screen.getByTestId("form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it("should call onError callback on submission error", async () => {
    const error = new Error("Submission failed");
    const submitFn = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();

    render(<TestComponent submitFn={submitFn} options={{ onError }} />);

    const form = screen.getByTestId("form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  it("should handle retry logic for specific status codes", async () => {
    const response = new Response("Server Error", { status: 502 });
    const submitFn = vi
      .fn()
      .mockRejectedValueOnce(response)
      .mockResolvedValueOnce(undefined);

    render(
      <TestComponent
        submitFn={submitFn}
        options={{ retryableStatusCodes: [502] }}
      />
    );

    const form = screen.getByTestId("form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(submitFn).toHaveBeenCalledTimes(2);
    });
  });

  it("should not retry for non-retryable errors", async () => {
    const response = new Response("Not Found", { status: 404 });
    const submitFn = vi.fn().mockRejectedValue(response);

    render(
      <TestComponent
        submitFn={submitFn}
        options={{ retryableStatusCodes: [502, 503] }}
      />
    );

    const form = screen.getByTestId("form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(submitFn).toHaveBeenCalledTimes(1);
    });
  });

  it("should handle error and attempt focus restoration", async () => {
    const error = new Error("Submission failed");
    const submitFn = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();

    render(<TestComponent submitFn={submitFn} options={{ onError }} />);

    const form = screen.getByTestId("form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByTestId("error")).toBeInTheDocument();
      expect(onError).toHaveBeenCalledWith(error);
    });

    // The focus restoration logic should have been executed
    // can't easily test the actual focus call in jsdom...can verify the error handling works
  });

  it("should set Idempotency-Key header when using fetch", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fetchSpy;

    const submitFn = vi.fn().mockImplementation(async () => {
      await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ a: 1 }),
      });
    });

    render(<TestComponent submitFn={submitFn} />);

    const form = screen.getByTestId("form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [_url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = new Headers(init.headers as HeadersInit);
      expect(headers.get("Idempotency-Key")).toBe("test-uuid-123");
    });
  });
});
