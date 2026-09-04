import { z } from "zod";
import {
  recordPaperTrade,
  type PaperTrade,
  type PaperTradeSide
} from "./tradeJournal.js";

const optionalText = z.string().trim().min(1).optional();

const executeOrPaperInputSchema = z.object({
  strategy: z.string().trim().min(1),
  slug: optionalText,
  question: optionalText,
  tokenId: z.string().trim().min(1),
  // Every paper trade must join back to the candidate that caused it. 147 of
  // the 167 trades from the May 2026 runs could not, and a resolved-PnL
  // analysis without that join reports its own inputs back to itself.
  opportunityId: z.string().trim().min(1),
  side: z.enum(["YES", "NO"]),
  entryPrice: z.number().finite().min(0).max(1),
  paperSizeUsd: z.number().finite().positive(),
  paperSizeShares: z.number().finite().positive().optional(),
  liveSizeUsd: z.number().finite().positive().optional(),
  arbClass: optionalText
});

export type ExecuteOrPaperInput = {
  strategy: string;
  slug?: string;
  question?: string;
  tokenId: string;
  opportunityId: string;
  side: PaperTradeSide;
  entryPrice: number;
  paperSizeUsd: number;
  paperSizeShares?: number;
  liveSizeUsd?: number;
  arbClass?: string;
};

export type ExecuteOrPaperResult = {
  paper: true;
  live: false;
  reason: "paper_only" | "live_not_implemented";
  paperTrade: PaperTrade;
};

export function executeOrPaper(
  input: ExecuteOrPaperInput
): ExecuteOrPaperResult {
  const parsed = executeOrPaperInputSchema.parse(input);
  const paperTrade = recordPaperTrade({
    strategy: parsed.strategy,
    slug: parsed.slug,
    question: parsed.question,
    tokenId: parsed.tokenId,
    opportunityId: parsed.opportunityId,
    side: parsed.side,
    sizeUsd: parsed.paperSizeUsd,
    sizeShares: parsed.paperSizeShares,
    entryPrice: parsed.entryPrice,
    arbClass: parsed.arbClass
  });

  return {
    paper: true,
    live: false,
    reason:
      parsed.liveSizeUsd === undefined ? "paper_only" : "live_not_implemented",
    paperTrade
  };
}
