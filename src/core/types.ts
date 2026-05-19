export type Opportunity = {
  id: string;
  market: string;
  outcome: string;
  probability: number;
  observedPrice: number;
  notes?: string;
};

export type PaperExecutionResult = {
  mode: "paper";
  opportunityId: string;
  status: "recorded";
  message: string;
};
