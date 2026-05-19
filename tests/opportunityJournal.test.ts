import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import {
  countOpportunitiesByStatus,
  listRecentOpportunities,
  listRecentRejectedOpportunities,
  recordOpportunity,
  updateOpportunityStatus
} from "../src/execution/opportunityJournal.js";

const testDbPath = join("logs", "opportunity-journal-test.db");

describe("opportunity journal", () => {
  beforeEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    initDb(testDbPath);
  });

  afterEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
  });

  it("records raw opportunities and updates final status", () => {
    const raw = recordOpportunity({
      strategy: "neg_risk_bracket_arb",
      slug: "rate-cuts-2026",
      rawEdge: 0.03,
      reason: "needs_orderbook_depth_check",
      tokenIds: ["m1-no", "m2-no"],
      timestamp: 1_700_000_000_000
    });

    expect(raw.status).toBe("raw_found");

    const updated = updateOpportunityStatus(raw.id, {
      status: "validated",
      executableEdge: 0.02,
      reason: "orderbook_validated"
    });

    expect(updated).toMatchObject({
      id: raw.id,
      status: "validated",
      rawEdge: 0.03,
      executableEdge: 0.02,
      tokenIds: ["m1-no", "m2-no"]
    });
    expect(listRecentOpportunities(10)).toEqual([updated]);
  });

  it("keeps rejected opportunities queryable for inspection", () => {
    const raw = recordOpportunity({
      strategy: "neg_risk_bracket_arb",
      slug: "rate-cuts-2026",
      rawEdge: 0.03,
      tokenIds: ["m1-no"],
      timestamp: 1_700_000_000_000
    });

    const rejected = updateOpportunityStatus(raw.id, {
      status: "rejected",
      executableEdge: null,
      reason: "partial_basket_invalid"
    });

    expect(listRecentRejectedOpportunities(10)).toEqual([rejected]);
    expect(countOpportunitiesByStatus()).toEqual({
      raw_found: 0,
      validated: 0,
      rejected: 1,
      paper_fired: 0
    });
  });
});
