import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// @testing-library/react only auto-cleans up when the runner provides
// globals; Vitest does not by default, so clean up after every test.
afterEach(() => {
  cleanup();
});
