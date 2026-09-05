import { describe, expect, it } from "vitest";
import {
  gateForReason,
  REJECTION_GATES,
  REJECTION_REASON_LABELS,
  REJECTION_REASONS,
} from "../src/core/rejectionReasons.js";
import {
  CLASS_DEFINITIONS,
  classForStrategy,
  isHedged,
  isStructuralClass,
  legacyRuleMatch,
  ruleScreenFromRejection,
} from "../src/core/taxonomy.js";
import { meetsAnnualizedHurdle } from "../src/core/opportunityEconomics.js";

describe("taxonomy", () => {
  it("names every scanner strategy with a class and only structural classes may be arbitrage", () => {
    expect(classForStrategy("within_market_fast_arb")).toBe("same_market_complement");
    expect(classForStrategy("neg_risk_bracket_arb")).toBe("neg_risk_no_basket");
    expect(classForStrategy("cross_venue_yes_no_arb")).toBe("cross_venue_complement");
    expect(classForStrategy("clear_win_watch")).toBe("clear_win_convergence");
    expect(classForStrategy("something_else")).toBeNull();

    expect(isStructuralClass("same_market_complement")).toBe(true);
    expect(isStructuralClass("neg_risk_no_basket")).toBe(true);
    expect(isStructuralClass("cross_venue_complement")).toBe(true);
    expect(isStructuralClass("cross_venue_price_spread")).toBe(false);
    expect(isStructuralClass("neg_risk_long_tail_no_carry")).toBe(false);
    expect(isStructuralClass("clear_win_convergence")).toBe(false);
  });

  it("defines the long-tail NO carry in the taxonomy without scanning it (decision E3)", () => {
    const carry = CLASS_DEFINITIONS.find((definition) => definition.id === "neg_risk_long_tail_no_carry");

    expect(carry?.scanned).toBe(false);
    expect(carry?.structuralWhen).toBeNull();
  });

  it("gives every rejection reason a gate and a label", () => {
    for (const reason of REJECTION_REASONS) {
      expect(REJECTION_REASON_LABELS[reason]).toBeTruthy();
      expect(reason in REJECTION_GATES).toBe(true);
    }

    expect(gateForReason("multi_winner_or_qualifier_basket")).toBe(1);
    expect(gateForReason("rule_review_not_equivalent")).toBe(1);
    expect(gateForReason("past_expected_resolution")).toBe(2);
    expect(gateForReason("partial_basket_invalid")).toBe(2);
    expect(gateForReason("non_positive_net_edge_after_fees")).toBe(3);
    expect(gateForReason("below_annualized_hurdle")).toBe(4);
    expect(gateForReason("duplicate_within_cooldown")).toBe(5);
    expect(gateForReason("scanner_error")).toBeNull();
    expect(gateForReason("made up")).toBeNull();
  });

  it("maps cross-venue rejections onto the automated screen", () => {
    expect(ruleScreenFromRejection("question_inverted")).toBe("inverted");
    expect(ruleScreenFromRejection("question_type_mismatch")).toBe("different_question");
    expect(ruleScreenFromRejection("compound_kalshi_market")).toBe("compound_market");
    expect(ruleScreenFromRejection("non_positive_executable_edge")).toBeNull();
  });

  it("allows the word hedged only by construction or after a person found both rulebooks equivalent", () => {
    expect(isHedged("structural", null)).toBe(true);
    expect(isHedged("passed", "equivalent")).toBe(true);
    expect(isHedged("passed", "none")).toBe(false);
    expect(isHedged("passed", "pending")).toBe(false);
    expect(isHedged("passed", "not_equivalent")).toBe(false);
    // the person outranks the title screen in both directions
    expect(isHedged("resolution_time_mismatch", "equivalent")).toBe(true);
    expect(isHedged("structural", "not_equivalent")).toBe(false);
    expect(isHedged(null, "none")).toBe(false);
  });

  it("derives the first schema's single rule field without overclaiming", () => {
    expect(legacyRuleMatch("structural", null)).toBe("reviewed");
    // a NEG_RISK basket that only passed the automated screen was never reviewed
    expect(legacyRuleMatch("passed", null)).toBe("unverified");
    expect(legacyRuleMatch("passed", "none")).toBe("unverified");
    expect(legacyRuleMatch("passed", "pending")).toBe("unverified");
    expect(legacyRuleMatch("passed", "equivalent")).toBe("reviewed");
    expect(legacyRuleMatch("passed", "not_equivalent")).toBe("mismatch");
    expect(legacyRuleMatch("different_question", "none")).toBe("mismatch");
  });

  it("never lets an undated basket clear the hurdle", () => {
    expect(meetsAnnualizedHurdle(null, 10)).toBe(false);
    expect(meetsAnnualizedHurdle(Number.NaN, 10)).toBe(false);
    expect(meetsAnnualizedHurdle(9.999, 10)).toBe(true);
    expect(meetsAnnualizedHurdle(9.99, 10)).toBe(false);
    expect(meetsAnnualizedHurdle(185.51, 10)).toBe(true);
  });
});
