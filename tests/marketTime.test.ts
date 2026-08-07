import { describe, expect, it } from "vitest";
import {
  classifyCapitalLock,
  deriveExpectedResolutionAt,
} from "../src/utils/marketTime.js";

describe("market time utilities", () => {
  it("derives expected resolution from direct Gamma endDate fields", () => {
    expect(
      deriveExpectedResolutionAt({
        endDate: "2026-07-01T00:00:00Z",
      }),
    ).toBe(Date.parse("2026-07-01T00:00:00Z"));
  });

  it("derives expected resolution from nested Gamma metadata", () => {
    expect(
      deriveExpectedResolutionAt({
        eventMetadata: {
          expectedResolutionTime: "2026-06-30T12:00:00Z",
        },
      }),
    ).toBe(Date.parse("2026-06-30T12:00:00Z"));
  });

  it("derives expected resolution from explicit month-day-year slug text", () => {
    expect(
      deriveExpectedResolutionAt({
        slug: "netanyahu-out-by-june-30-2026",
      }),
    ).toBe(Date.UTC(2026, 5, 30, 23, 59, 59));
  });

  it("classifies missing resolution time as unknown", () => {
    expect(classifyCapitalLock(null, Date.now())).toEqual({
      expectedResolutionAt: null,
      durationHours: null,
      capitalLockClass: "unknown",
    });
  });
});
