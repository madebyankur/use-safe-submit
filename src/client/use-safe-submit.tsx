import { useCallback, useState, useRef } from "react";

/**
 * Configuration options for the useSafeSubmit hook.
 */
export interface SafeSubmitOptions {
  /**
   * HTTP status codes that should trigger automatic retry on failure.
   * @default undefined
   * @example [502, 503, 504]
   */
  retryableStatusCodes?: number[];

  /**
   * CSS class name to apply to submit buttons when form is submitting.
   * @default undefined
   * @example "opacity-50 cursor-not-allowed"
   */
  disabledClassName?: string;

  /**
   * Callback function called when submission fails.
   * @param error - The error that occurred during submission
   */
  onError?: (error: Error | unknown) => void;

  /**
   * Callback function called when submission succeeds.
   */
  onSuccess?: () => void;
}

/**
 * Return value from the useSafeSubmit hook.
 */
export interface SafeSubmitResult {
  /**
   * Event handler function to attach to form's onSubmit prop.
   * Prevents double submission and handles idempotency.
   */
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;

  /**
   * Boolean indicating if form is currently being submitted.
   */
  isSubmitting: boolean;

  /**
   * Error from the last submission attempt, or null if no error.
   */
  error: Error | unknown | null;

  /**
   * Unique idempotency key for the current submission.
   * Automatically generated and included in form data.
   */
  idempotencyKey: string;

  /**
   * Function to reset the hook state (clear error, stop submitting, etc.).
   */
  reset: () => void;
}

/**
 * React hook for preventing double form submissions with idempotency support.
 *
 * This hook provides a safe way to handle form submissions by:
 * - Preventing multiple submissions of the same form
 * - Generating and managing idempotency keys
 * - Automatically adding idempotency headers to fetch requests
 * - Providing loading states and error handling
 * - Supporting retry logic for specific HTTP status codes
 *
 * @param submitFn - Function that handles the actual form submission
 * @param options - Configuration options for the hook
 * @returns Object containing form submission handlers and state
 *
 * @example
 * ```tsx
 * function MyForm() {
 *   const { handleSubmit, isSubmitting, error } = useSafeSubmit(
 *     async (formData) => {
 *       await fetch('/api/submit', {
 *         method: 'POST',
 *         body: formData
 *       });
 *     },
 *     {
 *       onSuccess: () => console.log('Form submitted successfully'),
 *       onError: (error) => console.error('Submission failed:', error)
 *     }
 *   );
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input name="email" type="email" required />
 *       <button type="submit" disabled={isSubmitting}>
 *         {isSubmitting ? 'Submitting...' : 'Submit'}
 *       </button>
 *       {error && <div>Error: {String(error)}</div>}
 *     </form>
 *   );
 * }
 * ```
 */
export function useSafeSubmit(
  submitFn: (formData: FormData) => Promise<void>,
  options: SafeSubmitOptions = {}
): SafeSubmitResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const idempotencyKeyRef = useRef<string>("");
  const hasAttemptedSubmissionRef = useRef(false);

  /**
   * Generates a unique idempotency key using crypto.randomUUID if available,
   * otherwise falls back to a combination of random string and timestamp.
   * @returns A unique string identifier
   */
  const generateIdempotencyKey = useCallback(() => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }, []);

  /**
   * Resets the hook state to initial values.
   * Clears error state, stops submission, and resets internal flags.
   */
  const reset = useCallback(() => {
    setIsSubmitting(false);
    setError(null);
    hasAttemptedSubmissionRef.current = false;
    idempotencyKeyRef.current = "";
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (isSubmitting || hasAttemptedSubmissionRef.current) {
        return;
      }

      hasAttemptedSubmissionRef.current = true;
      setIsSubmitting(true);
      setError(null);

      let initialSubmitElement: HTMLButtonElement | HTMLInputElement | null =
        null;
      try {
        const form = e.currentTarget;
        initialSubmitElement = form.querySelector(
          'button[type="submit"], input[type="submit"]'
        ) as HTMLButtonElement | HTMLInputElement | null;
        const formData = new FormData(form);

        if (!idempotencyKeyRef.current) {
          idempotencyKeyRef.current = generateIdempotencyKey();
        }

        formData.set("idempotency-key", idempotencyKeyRef.current);

        const attemptSubmission = async () => {
          const submitElements = Array.from(
            form.querySelectorAll('button[type="submit"], input[type="submit"]')
          ) as Array<HTMLButtonElement | HTMLInputElement>;
          submitElements.forEach((element) => {
            if (!element.disabled) {
              element.setAttribute("data-safe-submit-lock", "true");
              element.disabled = true;
              if (options.disabledClassName) {
                element.classList.add(options.disabledClassName);
              }
            }
          });

          const originalFetch = globalThis.fetch?.bind(globalThis);
          if (originalFetch) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (globalThis as any).fetch = async (
              input: RequestInfo | URL,
              init?: RequestInit
            ) => {
              const nextInit: RequestInit = { ...init };
              const headers = new Headers(init?.headers || {});
              headers.set("Idempotency-Key", idempotencyKeyRef.current);
              nextInit.headers = headers;
              return originalFetch(input as RequestInfo, nextInit);
            };
          }

          try {
            await submitFn(formData);
          } finally {
            if (originalFetch) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (globalThis as any).fetch = originalFetch;
            }
            submitElements.forEach((element) => {
              if (element.getAttribute("data-safe-submit-lock") === "true") {
                element.removeAttribute("data-safe-submit-lock");
                element.disabled = false;
                if (options.disabledClassName) {
                  element.classList.remove(options.disabledClassName);
                }
              }
            });
          }
        };

        try {
          await attemptSubmission();
        } catch (err) {
          if (options.retryableStatusCodes && err instanceof Response) {
            const shouldRetry = options.retryableStatusCodes.includes(
              err.status
            );
            if (shouldRetry) {
              await attemptSubmission();
              options.onSuccess?.();
              return;
            }
          }
          throw err;
        }

        options.onSuccess?.();
      } catch (err) {
        setError(err);
        options.onError?.(err);
        const formElement = e.currentTarget as HTMLFormElement | null;
        if (formElement) {
          const firstErrorElement = formElement.querySelector(
            '[aria-invalid="true"]'
          );
          if (firstErrorElement instanceof HTMLElement) {
            firstErrorElement.focus();
          } else if (initialSubmitElement instanceof HTMLElement) {
            initialSubmitElement.focus();
          } else {
            const submitElement = formElement.querySelector(
              'button[type="submit"], input[type="submit"]'
            );
            if (submitElement instanceof HTMLElement) submitElement.focus();
          }
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, submitFn, options, generateIdempotencyKey]
  );

  return {
    handleSubmit,
    isSubmitting,
    error,
    idempotencyKey: idempotencyKeyRef.current,
    reset,
  };
}
