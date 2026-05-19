import { randomUUID } from "node:crypto";
import type { Opportunity } from "../core/types.js";

export function scanSampleOpportunities(): Opportunity[] {
  return [
    {
      id: randomUUID(),
      market: "example-market",
      outcome: "example-outcome",
      probability: 0.5,
      observedPrice: 0.5,
      notes: "sample scanner output only"
    }
  ];
}
