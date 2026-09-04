import { describe, expect, it } from "vitest";
import {
  classifyQuestionMismatch,
  extractStrikes,
  questionIntents,
} from "../src/scanner/crossVenueQuestionMatch.js";

describe("cross-venue question mismatch", () => {
  it("flags result against margin as different question types", () => {
    const mismatch = classifyQuestionMismatch(
      "Will Abdul El-Sayed win the 2026 Michigan Democratic Senate primary?",
      "Michigan Democratic Senate primary margin of victory",
    );

    expect(mismatch?.reason).toBe("question_type_mismatch");
    expect(mismatch?.detail).toContain("margin");
  });

  it("flags winning against merely running as different question types", () => {
    const mismatch = classifyQuestionMismatch(
      "Will Mark Kelly win the 2028 Democratic presidential nomination?",
      "Who will run for the Democratic presidential nomination in 2028?",
    );

    expect(mismatch?.reason).toBe("question_type_mismatch");
    expect(mismatch?.detail).toContain("participation");
  });

  it("flags a question and its inversion on the same strike", () => {
    const mismatch = classifyQuestionMismatch(
      "Will Bitcoin be above $120,000 on December 31?",
      "Will Bitcoin be below $120,000 on December 31?",
    );

    expect(mismatch?.reason).toBe("question_inverted");
  });

  it("flags different thresholds on the same question shape", () => {
    const mismatch = classifyQuestionMismatch(
      "Will the Fed funds rate be above 4.0% in December?",
      "Will the Fed funds rate be above 4.25% in December?",
    );

    expect(mismatch?.reason).toBe("question_type_mismatch");
    expect(mismatch?.detail).toContain("thresholds");
  });

  it("leaves genuine rewordings alone", () => {
    expect(
      classifyQuestionMismatch(
        "Will Marco Rubio win the 2028 US Presidential Election?",
        "Marco Rubio elected President in 2028?",
      ),
    ).toBeNull();
    expect(
      classifyQuestionMismatch(
        "Will Trump recognize Somaliland before 2027?",
        "Trump recognizes Somaliland before 2027",
      ),
    ).toBeNull();
  });

  it("does not treat years as strikes", () => {
    expect(extractStrikes("win the 2028 election by 5 points")).toEqual(
      new Set(["5"]),
    );
    expect(questionIntents("win the 2028 election by 5 points")).toEqual(
      new Set(["margin"]),
    );
  });
});
