import { describe, expect, it } from "vitest";
import {
  assignLegRoles,
  FEE_MODEL_VERSION,
  kalshiFeeUsd,
  legFeeCentsPerShare,
  legFeeUsd,
  normalizeFeeCategory,
  parseExecutionRoleMode,
  polymarketFeeUsd,
  polymarketTakerRate,
} from "../src/core/venueFees.js";

describe("venue fee curves", () => {
  it("pins the fee schedule version to the documented snapshot", () => {
    expect(FEE_MODEL_VERSION).toBe("2026-07-30");
  });

  it("charges Polymarket takers rate * p * (1 - p) per share by category", () => {
    // 100 shares at 0.50 in a general category: 100 * 0.05 * 0.25 = 1.25 USD
    expect(polymarketFeeUsd({ role: "taker", price: 0.5, shares: 100 })).toBe(1.25);
    // crypto is 7 percent
    expect(
      polymarketFeeUsd({ role: "taker", price: 0.5, shares: 100, category: "crypto" }),
    ).toBe(1.75);
    // geopolitics is fee-free
    expect(
      polymarketFeeUsd({ role: "taker", price: 0.5, shares: 100, category: "geopolitics" }),
    ).toBe(0);
    // fee vanishes toward the extremes
    expect(polymarketFeeUsd({ role: "taker", price: 0.05, shares: 100 })).toBeCloseTo(0.2375, 6);
  });

  it("charges Polymarket makers nothing", () => {
    expect(polymarketFeeUsd({ role: "maker", price: 0.5, shares: 100 })).toBe(0);
  });

  it("rounds Kalshi taker fees up to the next cent per order", () => {
    // 0.07 * 100 * 0.25 = 1.75 exactly; float noise must not make it 1.76
    expect(kalshiFeeUsd({ role: "taker", price: 0.5, shares: 100 })).toBe(1.75);
    // one contract at 0.50: 0.0175 raw -> 0.02 after ceiling
    expect(kalshiFeeUsd({ role: "taker", price: 0.5, shares: 1 })).toBe(0.02);
    // maker rate is a quarter of the taker rate, same rounding
    expect(kalshiFeeUsd({ role: "maker", price: 0.5, shares: 100 })).toBe(0.44);
  });

  it("dispatches by venue and reports cents per share", () => {
    expect(legFeeUsd({ venue: "kalshi", role: "taker", price: 0.5, shares: 100 })).toBe(1.75);
    expect(legFeeUsd({ venue: "polymarket", role: "taker", price: 0.5, shares: 100 })).toBe(1.25);
    expect(
      legFeeCentsPerShare({ venue: "kalshi", role: "taker", price: 0.5, shares: 100 }),
    ).toBe(1.75);
    expect(legFeeUsd({ venue: "kalshi", role: "taker", price: 0.5, shares: 0 })).toBe(0);
  });

  it("maps Kalshi and free-text categories onto the Polymarket fee table", () => {
    expect(normalizeFeeCategory("Elections")).toBe("politics");
    expect(normalizeFeeCategory("Climate and Weather")).toBe("weather");
    expect(normalizeFeeCategory("Bitcoin")).toBe("crypto");
    expect(normalizeFeeCategory(undefined)).toBe("other");
    expect(polymarketTakerRate("world")).toBe(0);
    expect(polymarketTakerRate("unknown-category")).toBe(0.05);
  });

  it("prices every leg as taker unless maker-first is configured", () => {
    const legs = [
      { venue: "polymarket" as const, price: 0.5 },
      { venue: "kalshi" as const, price: 0.5 },
    ];

    expect(assignLegRoles(legs, "taker").map((leg) => leg.role)).toEqual([
      "taker",
      "taker",
    ]);
    // Kalshi at 0.50 carries the higher taker fee, so it rests as maker.
    expect(assignLegRoles(legs, "maker_first").map((leg) => leg.role)).toEqual([
      "taker",
      "maker",
    ]);
  });

  it("parses the execution role mode from the environment", () => {
    expect(parseExecutionRoleMode(undefined)).toBe("taker");
    expect(parseExecutionRoleMode("maker_first")).toBe("maker_first");
    expect(parseExecutionRoleMode("taker_only")).toBe("taker");
    expect(() => parseExecutionRoleMode("live")).toThrow("EXECUTION_ROLE_MODE");
  });
});
