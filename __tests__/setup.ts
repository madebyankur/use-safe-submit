import "@testing-library/jest-dom";

if (typeof globalThis.crypto === "undefined") {
  Object.defineProperty(globalThis, "crypto", {
    value: {
      randomUUID: () => "test-uuid-" + Math.random().toString(36).substring(2),
      subtle: {
        digest: async () => new Uint8Array([1, 2, 3, 4]),
      },
    },
  });
}
