/**
 * __tests__/indexer/backoff.test.ts
 *
 * Unit tests covering escalating backoff calculation for indexer poll errors (#82).
 */

import {
  calculatePollBackoff,
  BASE_POLL_BACKOFF_MS,
  MAX_POLL_BACKOFF_MS,
} from "../../indexer/backoff.js";

describe("calculatePollBackoff", () => {
  it("exports documented ceiling as 60,000 ms and base as 12,000 ms", () => {
    expect(BASE_POLL_BACKOFF_MS).toBe(12_000);
    expect(MAX_POLL_BACKOFF_MS).toBe(60_000);
  });

  it("returns 0 for zero or negative failures", () => {
    expect(calculatePollBackoff(0)).toBe(0);
    expect(calculatePollBackoff(-1)).toBe(0);
  });

  it("returns BASE_POLL_BACKOFF_MS on the first failure", () => {
    expect(calculatePollBackoff(1)).toBe(12_000);
  });

  it("escalates exponentially with consecutive failures", () => {
    expect(calculatePollBackoff(2)).toBe(24_000);
    expect(calculatePollBackoff(3)).toBe(48_000);
  });

  it("caps the backoff delay at MAX_POLL_BACKOFF_MS", () => {
    expect(calculatePollBackoff(4)).toBe(60_000);
    expect(calculatePollBackoff(5)).toBe(60_000);
    expect(calculatePollBackoff(100)).toBe(60_000);
  });

  it("respects custom base and ceiling parameters", () => {
    expect(calculatePollBackoff(1, 1_000, 5_000)).toBe(1_000);
    expect(calculatePollBackoff(2, 1_000, 5_000)).toBe(2_000);
    expect(calculatePollBackoff(3, 1_000, 5_000)).toBe(4_000);
    expect(calculatePollBackoff(4, 1_000, 5_000)).toBe(5_000);
    expect(calculatePollBackoff(10, 1_000, 5_000)).toBe(5_000);
  });
});
