import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchActiveEvents,
  normalizeGammaMarket,
  parseJsonArrayField
} from "../src/utils/gamma.js";

vi.mock("axios", () => ({
  default: {
    get: vi.fn()
  }
}));

beforeEach(() => {
  vi.mocked(axios.get).mockReset();
});

describe("parseJsonArrayField", () => {
  it("parses JSON array strings", () => {
    expect(parseJsonArrayField<string>('["yes","no"]')).toEqual(["yes", "no"]);
  });

  it("returns already parsed arrays", () => {
    const input = ["token-1", "token-2"];

    expect(parseJsonArrayField<string>(input)).toBe(input);
  });

  it("throws a clear error for invalid JSON", () => {
    expect(() => parseJsonArrayField<string>("not-json")).toThrow(
      "Invalid JSON array field"
    );
  });

  it("throws a clear error when JSON is not an array", () => {
    expect(() => parseJsonArrayField<string>('{"not":"array"}')).toThrow(
      "Parsed value is not an array"
    );
  });
});

describe("fetchActiveEvents", () => {
  it("paginates active Gamma events when the requested limit exceeds one page", async () => {
    const get = vi.mocked(axios.get);

    get.mockResolvedValueOnce({
      data: Array.from({ length: 100 }, (_, index) => ({ id: `page-1-${index}` }))
    });
    get.mockResolvedValueOnce({
      data: Array.from({ length: 50 }, (_, index) => ({ id: `page-2-${index}` }))
    });

    await expect(fetchActiveEvents(150)).resolves.toHaveLength(150);
    expect(get).toHaveBeenNthCalledWith(1, "https://gamma-api.polymarket.com/events", {
      params: {
        active: true,
        closed: false,
        limit: 100,
        offset: 0
      },
      timeout: 10_000
    });
    expect(get).toHaveBeenNthCalledWith(2, "https://gamma-api.polymarket.com/events", {
      params: {
        active: true,
        closed: false,
        limit: 50,
        offset: 100
      },
      timeout: 10_000
    });
  });
});

describe("normalizeGammaMarket", () => {
  it("normalizes JSON-string fields from Gamma market data", () => {
    expect(
      normalizeGammaMarket({
        id: "market-1",
        slug: "example-market",
        question: "Will the example happen?",
        description: "This market resolves Yes if the example happens.",
        resolutionSource: "Official source",
        negRisk: true,
        clobTokenIds: '["token-yes","token-no"]',
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.41","0.59"]'
      })
    ).toEqual({
      id: "market-1",
      slug: "example-market",
      question: "Will the example happen?",
      description: "This market resolves Yes if the example happens.",
      resolutionSource: "Official source",
      negRisk: true,
      clobTokenIds: ["token-yes", "token-no"],
      outcomes: ["Yes", "No"],
      outcomePrices: ["0.41", "0.59"]
    });
  });

  it("normalizes already parsed array fields", () => {
    expect(
      normalizeGammaMarket({
        id: 123,
        slug: "parsed-market",
        question: "Parsed?",
        negRisk: "true",
        clobTokenIds: ["token-yes", "token-no"],
        outcomes: ["Yes", "No"],
        outcomePrices: ["0.2", "0.8"]
      })
    ).toEqual({
      id: "123",
      slug: "parsed-market",
      question: "Parsed?",
      negRisk: true,
      clobTokenIds: ["token-yes", "token-no"],
      outcomes: ["Yes", "No"],
      outcomePrices: ["0.2", "0.8"]
    });
  });

  it("is robust against missing optional fields", () => {
    expect(normalizeGammaMarket({})).toEqual({
      id: "",
      slug: "",
      question: "",
      negRisk: false,
      clobTokenIds: [],
      outcomes: [],
      outcomePrices: []
    });
  });

  it("throws a contextual error for malformed array fields", () => {
    expect(() =>
      normalizeGammaMarket({
        clobTokenIds: "not-json"
      })
    ).toThrow('Invalid Gamma market field "clobTokenIds"');
  });
});
