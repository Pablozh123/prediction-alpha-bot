import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import {
  evaluateCrossVenuePairQuality,
  renderCrossVenueServerDashboardShell,
  startCrossVenueDashboardServer,
} from "../src/scripts/crossVenueDashboardServer.js";
import { emptyCrossVenueOrderbookReadMetrics } from "../src/scanner/crossVenueArbScanner.js";
import type { CrossVenueReportData } from "../src/scripts/crossVenueArbScan.js";
import type { GammaRawEvent } from "../src/utils/gamma.js";
import type { KalshiMarket } from "../src/utils/kalshi.js";

describe("cross venue dashboard server", () => {
  it("renders a paper-only local dashboard shell", () => {
    const html = renderCrossVenueServerDashboardShell();

    expect(html).toContain("Cross-Venue Arb Dashboard");
    expect(html).toContain("Arbitrage Opportunities");
    expect(html).toContain("Live paper spreads sorted by ROI. Updates every 30s.");
    expect(html).toContain("simpleDataStatus");
    expect(html).toContain("simpleOpportunities");
    expect(html).toContain("simpleRefresh");
    expect(html).toContain("simpleScanConfigured");
    expect(html).toContain("simpleStartWatch");
    expect(html).toContain("simpleStopWatch");
    expect(html).toContain("simpleVenueFilter");
    expect(html).toContain("simpleCategoryFilter");
    expect(html).toContain("simpleReviewFilter");
    expect(html).toContain("simpleMinNetCents");
    expect(html).toContain('type="range" min="0" max="20" step="0.1"');
    expect(html).toContain("simpleMinVolume24h");
    expect(html).toContain("simpleMinLiquidity");
    expect(html).toContain("simpleMinNetCentsValue");
    expect(html).toContain("simpleMinVolume24hValue");
    expect(html).toContain("simpleMinLiquidityValue");
    expect(html).toContain("Resolves Within");
    expect(html).toContain('data-simple-resolve-filter="any"');
    expect(html).toContain('data-simple-resolve-filter="7d"');
    expect(html).toContain('data-simple-resolve-filter="30d"');
    expect(html).toContain('data-simple-resolve-filter="90d"');
    expect(html).toContain('data-simple-resolve-filter="1yr"');
    expect(html).toContain("matchesSimpleResolutionWindow");
    expect(html).toContain("updateSimpleSliderOutputs");
    expect(html).toContain("simpleResolveWithinFilter");
    expect(html).toContain("Pair Discovery Review");
    expect(html).toContain("Start 30s watch");
    expect(html).toContain("Advanced tools");
    expect(html).toContain("SIMPLE_AUTO_REFRESH_MS");
    expect(html).toContain("/api/live-feed");
    expect(html).toContain("loadLiveFeed");
    expect(html).toContain("getActiveFeedOpportunities");
    expect(html).toContain("renderSimpleDashboard");
    expect(html).toContain("renderSimpleOpportunityTable");
    expect(html).toContain('"Event", "Pair", "Trade", "Gross Spread", "Fees", "Net Profit / Share"');
    expect(html).toContain('class="review-panel" aria-label="Pair discovery review" hidden');
    expect(html).toContain('class="advanced-dashboard" hidden');
    expect(html).toContain("opportunity-table");
    expect(html).toContain("Paper Data");
    expect(html).toContain("Live Feed");
    expect(html).toContain("No Live Data");
    expect(html).toContain("Refresh scan");
    expect(html).toContain("Scan configured pairs");
    expect(html).toContain("Scan ready pairs");
    expect(html).toContain("Start watch");
    expect(html).toContain("Start ready watch");
    expect(html).toContain("Stop watch");
    expect(html).toContain("Export scan JSON");
    expect(html).toContain("Export arbs CSV");
    expect(html).toContain("Export visible arbs CSV");
    expect(html).toContain("Export visible spreads CSV");
    expect(html).toContain("Export near CSV");
    expect(html).toContain("Export rejected CSV");
    expect(html).toContain("Pause visible rejected");
    expect(html).toContain("Export pairs JSON");
    expect(html).toContain("Export pair review CSV");
    expect(html).toContain("Discovery Review");
    expect(html).toContain("refreshDiscoveryReview");
    expect(html).toContain("runDiscoveryReview");
    expect(html).toContain("Discover candidates");
    expect(html).toContain("/api/discovery-review");
    expect(html).toContain("loadDiscoveryReview");
    expect(html).toContain("renderDiscoveryReview");
    expect(html).toContain("data-save-review-candidate");
    expect(html).toContain("data-mark-review-candidate");
    expect(html).toContain("Import pairs JSON");
    expect(html).toContain("importPairsFile");
    expect(html).toContain("openImportPairsFile");
    expect(html).toContain("importPairsJsonFromFile");
    expect(html).toContain("Expected JSON object with pairs array");
    expect(html).toContain("buildArbsCsv");
    expect(html).toContain("buildArbRowsCsv");
    expect(html).toContain("buildPriceSpreadRowsCsv");
    expect(html).toContain("rowWithAction");
    expect(html).toContain("rowRaw");
    expect(html).toContain("externalLink");
    expect(html).toContain("kalshiMarketUrl");
    expect(html).toContain("polymarketMarketUrl");
    expect(html).toContain("kalshiMarketLink");
    expect(html).toContain("polymarketMarketLink");
    expect(html).toContain("pairMarketLinks");
    expect(html).toContain("pairById");
    expect(html).toContain("https://kalshi.com/markets?search=");
    expect(html).toContain("https://polymarket.com/search?query=");
    expect(html).toContain("target=\"_blank\"");
    expect(html).toContain("rel=\"noreferrer\"");
    expect(html).toContain("market-links");
    expect(html).toContain("previewPairButton");
    expect(html).toContain("addReportPairButton");
    expect(html).toContain("addReportVerifiedPairButton");
    expect(html).toContain("addVisibleArbs");
    expect(html).toContain("addVerifiedVisibleArbs");
    expect(html).toContain("addVerifiedPriorityVisibleArbs");
    expect(html).toContain("starVisibleArbs");
    expect(html).toContain("unstarVisibleArbs");
    expect(html).toContain("selectVisibleArbs");
    expect(html).toContain("previewVisibleArbResults");
    expect(html).toContain("scanVisibleArbResults");
    expect(html).toContain("startVisibleArbResultsWatch");
    expect(html).toContain("pauseVisibleArbResults");
    expect(html).toContain("resumeVisibleArbResults");
    expect(html).toContain("verifyVisibleArbResults");
    expect(html).toContain("unverifyVisibleArbResults");
    expect(html).toContain("exportVisibleArbPairsJson");
    expect(html).toContain("exportVisibleArbReviewCsv");
    expect(html).toContain("addVisibleSpreads");
    expect(html).toContain("addVerifiedVisibleSpreads");
    expect(html).toContain("addVerifiedPriorityVisibleSpreads");
    expect(html).toContain("starVisibleSpreads");
    expect(html).toContain("unstarVisibleSpreads");
    expect(html).toContain("selectVisibleSpreads");
    expect(html).toContain("previewVisibleSpreadResults");
    expect(html).toContain("scanVisibleSpreadResults");
    expect(html).toContain("startVisibleSpreadResultsWatch");
    expect(html).toContain("pauseVisibleSpreadResults");
    expect(html).toContain("resumeVisibleSpreadResults");
    expect(html).toContain("verifyVisibleSpreadResults");
    expect(html).toContain("unverifyVisibleSpreadResults");
    expect(html).toContain("exportVisibleSpreadPairsJson");
    expect(html).toContain("exportVisibleSpreadReviewCsv");
    expect(html).toContain("Add visible arbs");
    expect(html).toContain("Add verified visible arbs");
    expect(html).toContain("Add verified priority visible arbs");
    expect(html).toContain("Star visible arbs");
    expect(html).toContain("Unstar visible arbs");
    expect(html).toContain("Select visible arbs");
    expect(html).toContain("Preview visible arbs");
    expect(html).toContain("Scan visible arbs");
    expect(html).toContain("Start visible arbs watch");
    expect(html).toContain("Pause visible arbs");
    expect(html).toContain("Resume visible arbs");
    expect(html).toContain("Verify visible arbs");
    expect(html).toContain("Unverify visible arbs");
    expect(html).toContain("Export visible arb pairs JSON");
    expect(html).toContain("Export visible arb review CSV");
    expect(html).toContain("Add visible spreads");
    expect(html).toContain("Add verified visible spreads");
    expect(html).toContain("Add verified priority visible spreads");
    expect(html).toContain("Star visible spreads");
    expect(html).toContain("Unstar visible spreads");
    expect(html).toContain("Select visible spreads");
    expect(html).toContain("Preview visible spreads");
    expect(html).toContain("Scan visible spreads");
    expect(html).toContain("Start visible spreads watch");
    expect(html).toContain("Pause visible spreads");
    expect(html).toContain("Resume visible spreads");
    expect(html).toContain("Verify visible spreads");
    expect(html).toContain("Unverify visible spreads");
    expect(html).toContain("Export visible spread pairs JSON");
    expect(html).toContain("Export visible spread review CSV");
    expect(html).toContain("scanConfiguredPairButton");
    expect(html).toContain("isConfiguredPairId");
    expect(html).toContain("configuredPairById");
    expect(html).toContain("resultPairStatus");
    expect(html).toContain("Pair Status");
    expect(html).toContain("resultPairLocalState");
    expect(html).toContain("resultPairReviewLabel");
    expect(html).toContain("resultPairNote");
    expect(html).toContain("resultReviewContext");
    expect(html).toContain("resultPairLocalStateFilterValues");
    expect(html).toContain("resultLocalStateFilter");
    expect(html).toContain("summarizeResultLocalStates");
    expect(html).toContain("renderResultLocalStateFilterButtons");
    expect(html).toContain("matchesResultLocalState");
    expect(html).toContain("setResultLocalStateFilter");
    expect(html).toContain("resultReviewFilter");
    expect(html).toContain("resultReviewFilterValues");
    expect(html).toContain("summarizeResultReviewFilters");
    expect(html).toContain("renderResultReviewFilterButtons");
    expect(html).toContain("matchesResultReview");
    expect(html).toContain("setResultReviewFilter");
    expect(html).toContain("data-result-review-filter");
    expect(html).toContain("data-clear-result-review-filter");
    expect(html).toContain("All result reviews");
    expect(html).toContain("data-result-local-state-filter");
    expect(html).toContain("data-clear-result-local-state-filter");
    expect(html).toContain("All local states");
    expect(html).toContain("Local State");
    expect(html).toContain("Review");
    expect(html).toContain("Note");
    expect(html).toContain("missing_pair_id");
    expect(html).toContain("not saved");
    expect(html).toContain("noted");
    expect(html).toContain("active");
    expect(html).toContain("paused");
    expect(html).toContain("priority");
    expect(html).toContain("normal");
    expect(html).toContain("resultPairStatusFilter");
    expect(html).toContain("parsed.resultPairStatusFilter");
    expect(html).toContain("resultPairStatusFilter: String(state.resultPairStatusFilter");
    expect(html).toContain("summarizeResultPairStatuses");
    expect(html).toContain("renderResultPairStatusFilterButtons");
    expect(html).toContain("matchesResultPairStatus");
    expect(html).toContain("setResultPairStatusFilter");
    expect(html).toContain("data-result-pair-status-filter");
    expect(html).toContain("data-clear-result-pair-status-filter");
    expect(html).toContain("All pair statuses");
    expect(html).toContain("resultPairActions");
    expect(html).toContain("handleResultActionClick");
    expect(html).toContain("data-add-report-pair");
    expect(html).toContain("data-add-verified-report-pair");
    expect(html).toContain("data-add-priority-report-pair");
    expect(html).toContain("data-add-verified-priority-report-pair");
    expect(html).toContain("data-scan-config-pair");
    expect(html).toContain("copyPairJsonButton");
    expect(html).toContain("copyPairSummaryButton");
    expect(html).toContain("copyTextToClipboard");
    expect(html).toContain("copyPairJson");
    expect(html).toContain("pairSummaryLine");
    expect(html).toContain("buildPairSummaryText");
    expect(html).toContain("copyPairSummary");
    expect(html).toContain("data-copy-pair-json");
    expect(html).toContain("data-copy-pair-summary");
    expect(html).toContain("Copy pair JSON");
    expect(html).toContain("Copy summary");
    expect(html).toContain("navigator.clipboard?.writeText");
    expect(html).toContain("document.execCommand(\"copy\")");
    expect(html).toContain("JSON.stringify({ pairs: [pair] }, null, 2)");
    expect(html).toContain("pairSummaryLine(\"Pair ID\", pair.id || pairId)");
    expect(html).toContain("pairSummaryLine(\"Last scan\", getPairLastScanStatus(pair))");
    expect(html).toContain("pairSummaryLine(\"Tokens\", [pair.polymarket?.yesTokenId, pair.polymarket?.noTokenId])");
    expect(html).toContain("No pair mapping available to copy.");
    expect(html).toContain("No pair summary available to copy.");
    expect(html).toContain("Pair JSON copied to clipboard.");
    expect(html).toContain("Pair summary copied to clipboard.");
    expect(html).toContain("Copy pair JSON failed");
    expect(html).toContain("Copy pair summary failed");
    expect(html).toContain("configuredPairActions");
    expect(html).toContain("resultPairLocalToggleActions");
    expect(html).toContain("addReportPriorityPairButton");
    expect(html).toContain("addReportVerifiedPriorityPairButton");
    expect(html).toContain("data-edit-note-pair");
    expect(html).toContain("data-clear-note-pair");
    expect(html).toContain("data-toggle-priority-pair");
    expect(html).toContain("data-toggle-enabled");
    expect(html).toContain("Priority toggle failed");
    expect(html).toContain("Toggle failed");
    expect(html).toContain("Saved");
    expect(html).toContain("addReportPair");
    expect(html).toContain("addVisibleResultPairs");
    expect(html).toContain("selectVisibleResultPairs");
    expect(html).toContain("previewVisibleResultPairs");
    expect(html).toContain("renderVisibleResultPreviews");
    expect(html).toContain("resultPreviewPairLabel");
    expect(html).toContain("MAX_VISIBLE_RESULT_PREVIEWS");
    expect(html).toContain("resultPreviews: { arbs: [], spreads: [] }");
    expect(html).toContain("resultPreviewGeneratedAt: { arbs: 0, spreads: 0 }");
    expect(html).toContain("resultPreviewStatusFilter: { arbs: \"\", spreads: \"\" }");
    expect(html).toContain("resultPreviewPairStatusFilter: { arbs: \"\", spreads: \"\" }");
    expect(html).toContain("resultPreviewLocalStateFilter: { arbs: \"\", spreads: \"\" }");
    expect(html).toContain("resultPreviewReviewFilter: { arbs: \"\", spreads: \"\" }");
    expect(html).toContain("resultPreviewProblemOnly: { arbs: false, spreads: false }");
    expect(html).toContain("resultPreviewProblemReasonFilter: { arbs: \"\", spreads: \"\" }");
    expect(html).toContain("resultPreviewSearch: { arbs: \"\", spreads: \"\" }");
    expect(html).toContain("previewResultSort: { arbs: \"preview_order\", spreads: \"preview_order\" }");
    expect(html).toContain("getPreviewResultPairs");
    expect(html).toContain("getSignalPreviewResultPairs");
    expect(html).toContain("getFilteredPreviewResultPairs");
    expect(html).toContain("getSavedPreviewResultPairIds");
    expect(html).toContain("getSavedSignalPreviewResultPairIds");
    expect(html).toContain("getSavedFilteredPreviewResultPairIds");
    expect(html).toContain("refreshPreviewResultPanel");
    expect(html).toContain("refreshPreviewResultPairs");
    expect(html).toContain("retryFailedPreviewResultPairs");
    expect(html).toContain("clearPreviewResultPairs");
    expect(html).toContain("clearFilteredPreviewResultPairs");
    expect(html).toContain("selectPreviewResultPairs");
    expect(html).toContain("scanPreviewResultPairs");
    expect(html).toContain("startPreviewResultWatch");
    expect(html).toContain("addPreviewResultPairs");
    expect(html).toContain("setPreviewResultPairsPriority");
    expect(html).toContain("setPreviewResultPairsVerified");
    expect(html).toContain("setPreviewResultPairsEnabled");
    expect(html).toContain("exportPreviewResultPairsJson");
    expect(html).toContain("exportSavedPreviewResultPairsJson");
    expect(html).toContain("getFilteredPreviewResultRows");
    expect(html).toContain("getFilteredPreviewResultEntries");
    expect(html).toContain("exportFilteredPreviewResultPairsJson");
    expect(html).toContain("exportFilteredPreviewResultReviewCsv");
    expect(html).toContain("exportPreviewResultReviewCsv");
    expect(html).toContain("previewResultStatus");
    expect(html).toContain("matchesPreviewResultStatusFilter");
    expect(html).toContain("matchesPreviewProblemFilter");
    expect(html).toContain("previewProblemReasons");
    expect(html).toContain("matchesPreviewProblemReasonFilter");
    expect(html).toContain("matchesPreviewPairStatusFilter");
    expect(html).toContain("matchesPreviewLocalStateFilter");
    expect(html).toContain("matchesPreviewReviewFilter");
    expect(html).toContain("matchesPreviewSearchFilter");
    expect(html).toContain("previewSearchText");
    expect(html).toContain("matchesPreviewResultFilters");
    expect(html).toContain("hasActivePreviewResultFilter");
    expect(html).toContain("resetPreviewResultFilters");
    expect(html).toContain("clearPreviewResultFilters");
    expect(html).toContain("setPreviewResultSort");
    expect(html).toContain("setPreviewResultSearch");
    expect(html).toContain("applyPreviewQuickView");
    expect(html).toContain("previewQuickViewStatus");
    expect(html).toContain("currentPreviewQuickView");
    expect(html).toContain("previewQuickViewLabel");
    expect(html).toContain("matchesPreviewQuickView");
    expect(html).toContain("previewQuickViewCounts");
    expect(html).toContain("previewQuickViewButtonHtml");
    expect(html).toContain("setPreviewResultStatusFilter");
    expect(html).toContain("setPreviewPairStatusFilter");
    expect(html).toContain("setPreviewLocalStateFilter");
    expect(html).toContain("setPreviewReviewFilter");
    expect(html).toContain("setPreviewProblemReasonFilter");
    expect(html).toContain("renderPreviewResultSummary");
    expect(html).toContain("renderPreviewStatusFilterButtons");
    expect(html).toContain("renderPreviewPairStatusFilterButtons");
    expect(html).toContain("renderPreviewLocalStateFilterButtons");
    expect(html).toContain("renderPreviewReviewFilterButtons");
    expect(html).toContain("renderPreviewProblemReasonFilterButtons");
    expect(html).toContain("previewSortOptionHtml");
    expect(html).toContain("previewSortLabel");
    expect(html).toContain("sortPreviewResultRows");
    expect(html).toContain("previewBestEdgeCents");
    expect(html).toContain("previewBestProfitDollars");
    expect(html).toContain("previewBestDiffCents");
    expect(html).toContain("summarizeVisiblePreviewMetrics");
    expect(html).toContain("comparePreviewTitle");
    expect(html).toContain("renderPreviewSummaryCountSpans");
    expect(html).toContain("incrementPreviewSummaryCount");
    expect(html).toContain("scanVisibleResultPairs");
    expect(html).toContain("startVisibleResultWatch");
    expect(html).toContain("pauseVisibleResultPairs");
    expect(html).toContain("resumeVisibleResultPairs");
    expect(html).toContain("setVisibleResultPairsVerified");
    expect(html).toContain("unstarVisibleResultPairs");
    expect(html).toContain("exportVisibleResultPairsJson");
    expect(html).toContain("exportVisibleResultReviewCsv");
    expect(html).toContain("getExportableVisibleResultPairs");
    expect(html).toContain("buildVisibleResultReviewCsv");
    expect(html).toContain("buildPreviewResultReviewCsv");
    expect(html).toContain("getVisibleResultPairIds");
    expect(html).toContain("getSavedVisibleResultPairIds");
    expect(html).toContain("Saving and starring visible result pairs");
    expect(html).toContain("Saving, verifying, and starring visible result pairs");
    expect(html).toContain("No starred saved visible arb result pairs to unstar.");
    expect(html).toContain("No starred saved visible spread result pairs to unstar.");
    expect(html).toContain("Unstarring visible arb result pairs");
    expect(html).toContain("Unstarring visible spread result pairs");
    expect(html).toContain("Unstarred ");
    expect(html).toContain("No visible arb result pairs to add.");
    expect(html).toContain("No visible spread result pairs to add.");
    expect(html).toContain("Saving and verifying visible result pairs");
    expect(html).toContain("marked ");
    expect(html).toContain(" total as manually verified.");
    expect(html).toContain("and starred ");
    expect(html).toContain("No saved visible arb result pairs to select.");
    expect(html).toContain("No saved visible spread result pairs to select.");
    expect(html).toContain("No saved visible arb result pairs to scan.");
    expect(html).toContain("No saved visible spread result pairs to scan.");
    expect(html).toContain("No visible arb result pairs to preview.");
    expect(html).toContain("No visible spread result pairs to preview.");
    expect(html).toContain("Previewing ");
    expect(html).toContain("read-only orderbooks");
    expect(html).toContain("Previewed ");
    expect(html).toContain("Use Top rows to narrow further.");
    expect(html).toContain("Visible Arb Result Preview");
    expect(html).toContain("Visible Spread Result Preview");
    expect(html).toContain("Preview rows: ");
    expect(html).toContain("Visible preview rows: ");
    expect(html).toContain("Signal rows: ");
    expect(html).toContain("Problem rows: ");
    expect(html).toContain("Visible preview best edge: ");
    expect(html).toContain("Visible preview best profit: ");
    expect(html).toContain("Visible preview best diff: ");
    expect(html).toContain("Previewed at: ");
    expect(html).toContain("Preview status filter: ");
    expect(html).toContain("Preview pair filter: ");
    expect(html).toContain("Preview local filter: ");
    expect(html).toContain("Preview review filter: ");
    expect(html).toContain("Preview problem filter: failed/rejected");
    expect(html).toContain("Preview problem reason: ");
    expect(html).toContain("Preview search: ");
    expect(html).toContain("Preview quick view: ");
    expect(html).toContain("Preview sort: ");
    expect(html).toContain("Status");
    expect(html).toContain("PREVIEW_RESULT_SORT_VALUES");
    expect(html).toContain("Preview sort");
    expect(html).toContain("data-preview-result-sort");
    expect(html).toContain("Preview search");
    expect(html).toContain("data-preview-result-search");
    expect(html).toContain("Search preview rows");
    expect(html).toContain("removePreviewResultRowAction");
    expect(html).toContain("removePreviewResultRow");
    expect(html).toContain("data-remove-preview-result-row-kind");
    expect(html).toContain("data-remove-preview-result-row-index");
    expect(html).toContain("Remove preview row");
    expect(html).toContain("data-preview-quick-view");
    expect(html).toContain("data-preview-quick-view-kind");
    expect(html).toContain("Signal view");
    expect(html).toContain("Saved active");
    expect(html).toContain("Priority view");
    expect(html).toContain("Needs-review view");
    expect(html).toContain("Problem view");
    expect(html).toContain("Reset preview view");
    expect(html).toContain("aria-pressed=");
    expect(html).toContain("class=\"active\"");
    expect(html).toContain("quickViewCounts.signal");
    expect(html).toContain("quickViewCounts.saved_active");
    expect(html).toContain("quickViewCounts.priority");
    expect(html).toContain("quickViewCounts.needs_review");
    expect(html).toContain("quickViewCounts.problems");
    expect(html).toContain("label + countLabel");
    expect(html).toContain("const problemCount = Number(previewStatusCounts.get(\"preview_failed\") || 0) + Number(previewStatusCounts.get(\"rejected\") || 0);");
    expect(html).toContain("visibleMetrics.bestEdgeCents");
    expect(html).toContain("visibleMetrics.bestProfitDollars");
    expect(html).toContain("visibleMetrics.bestDiffCents");
    expect(html).toContain("Preview order");
    expect(html).toContain("Best edge desc");
    expect(html).toContain("Best profit desc");
    expect(html).toContain("Best diff desc");
    expect(html).toContain("Pair");
    expect(html).toContain("Local");
    expect(html).toContain("data-add-preview-result-pairs");
    expect(html).toContain("data-add-verified-priority-preview-result-pairs");
    expect(html).toContain("data-add-filtered-preview-result-pairs");
    expect(html).toContain("data-add-verified-priority-filtered-preview-result-pairs");
    expect(html).toContain("data-add-signal-preview-result-pairs");
    expect(html).toContain("data-add-verified-priority-signal-preview-result-pairs");
    expect(html).toContain("data-star-filtered-preview-result-pairs");
    expect(html).toContain("data-unstar-filtered-preview-result-pairs");
    expect(html).toContain("data-verify-filtered-preview-result-pairs");
    expect(html).toContain("data-unverify-filtered-preview-result-pairs");
    expect(html).toContain("data-pause-filtered-preview-result-pairs");
    expect(html).toContain("data-resume-filtered-preview-result-pairs");
    expect(html).toContain("data-select-preview-result-pairs");
    expect(html).toContain("data-select-signal-preview-result-pairs");
    expect(html).toContain("data-select-filtered-preview-result-pairs");
    expect(html).toContain("data-scan-preview-result-pairs");
    expect(html).toContain("data-scan-signal-preview-result-pairs");
    expect(html).toContain("data-scan-filtered-preview-result-pairs");
    expect(html).toContain("data-start-preview-result-watch");
    expect(html).toContain("data-start-signal-preview-result-watch");
    expect(html).toContain("data-start-filtered-preview-result-watch");
    expect(html).toContain("data-star-preview-result-pairs");
    expect(html).toContain("data-unstar-preview-result-pairs");
    expect(html).toContain("data-verify-preview-result-pairs");
    expect(html).toContain("data-unverify-preview-result-pairs");
    expect(html).toContain("data-pause-preview-result-pairs");
    expect(html).toContain("data-resume-preview-result-pairs");
    expect(html).toContain("data-export-preview-result-pairs-json");
    expect(html).toContain("data-export-preview-result-review-csv");
    expect(html).toContain("data-export-signal-preview-result-pairs-json");
    expect(html).toContain("data-export-signal-preview-result-review-csv");
    expect(html).toContain("data-export-filtered-preview-result-pairs-json");
    expect(html).toContain("data-export-saved-filtered-preview-result-pairs-json");
    expect(html).toContain("data-export-filtered-preview-result-review-csv");
    expect(html).toContain("data-export-saved-preview-result-pairs-json");
    expect(html).toContain("data-export-saved-signal-preview-result-pairs-json");
    expect(html).toContain("data-refresh-filtered-preview-result-pairs");
    expect(html).toContain("data-refresh-preview-result-pairs");
    expect(html).toContain("data-retry-failed-filtered-preview-result-pairs");
    expect(html).toContain("data-retry-failed-preview-result-pairs");
    expect(html).toContain("data-clear-filtered-preview-result-pairs");
    expect(html).toContain("data-preview-status-filter-kind");
    expect(html).toContain("data-preview-status-filter");
    expect(html).toContain("data-clear-preview-status-filter");
    expect(html).toContain("data-clear-preview-result-filters");
    expect(html).toContain("data-preview-pair-status-filter-kind");
    expect(html).toContain("data-preview-pair-status-filter");
    expect(html).toContain("data-clear-preview-pair-status-filter");
    expect(html).toContain("data-preview-local-state-filter-kind");
    expect(html).toContain("data-preview-local-state-filter");
    expect(html).toContain("data-clear-preview-local-state-filter");
    expect(html).toContain("data-preview-review-filter-kind");
    expect(html).toContain("data-preview-review-filter");
    expect(html).toContain("data-clear-preview-review-filter");
    expect(html).toContain("data-clear-preview-result-pairs");
    expect(html).toContain("startPreviewArbResultsWatch");
    expect(html).toContain("startPreviewSpreadResultsWatch");
    expect(html).toContain("startSignalPreviewArbResultsWatch");
    expect(html).toContain("startSignalPreviewSpreadResultsWatch");
    expect(html).toContain("startFilteredPreviewArbResultsWatch");
    expect(html).toContain("startFilteredPreviewSpreadResultsWatch");
    expect(html).toContain("Add preview ' + html(label) + ' pairs");
    expect(html).toContain("Add verified priority preview ' + html(label) + ' pairs");
    expect(html).toContain("Add filtered preview ' + html(label) + ' pairs");
    expect(html).toContain("Add verified priority filtered preview ' + html(label) + ' pairs");
    expect(html).toContain("Add signal preview ' + html(label) + ' pairs");
    expect(html).toContain("Add verified priority signal preview ' + html(label) + ' pairs");
    expect(html).toContain("Star saved preview ' + html(label) + ' pairs");
    expect(html).toContain("Unstar saved preview ' + html(label) + ' pairs");
    expect(html).toContain("Verify saved preview ' + html(label) + ' pairs");
    expect(html).toContain("Unverify saved preview ' + html(label) + ' pairs");
    expect(html).toContain("Pause saved preview ' + html(label) + ' pairs");
    expect(html).toContain("Resume saved preview ' + html(label) + ' pairs");
    expect(html).toContain("Star saved filtered preview ' + html(label) + ' pairs");
    expect(html).toContain("Unstar saved filtered preview ' + html(label) + ' pairs");
    expect(html).toContain("Verify saved filtered preview ' + html(label) + ' pairs");
    expect(html).toContain("Unverify saved filtered preview ' + html(label) + ' pairs");
    expect(html).toContain("Pause saved filtered preview ' + html(label) + ' pairs");
    expect(html).toContain("Resume saved filtered preview ' + html(label) + ' pairs");
    expect(html).toContain("Select saved preview ' + html(label) + ' pairs");
    expect(html).toContain("Select saved signal preview ' + html(label) + ' pairs");
    expect(html).toContain("Select saved filtered preview ' + html(label) + ' pairs");
    expect(html).toContain("Scan saved preview ' + html(label) + ' pairs");
    expect(html).toContain("Scan saved signal preview ' + html(label) + ' pairs");
    expect(html).toContain("Scan saved filtered preview ' + html(label) + ' pairs");
    expect(html).toContain("Start saved preview ' + html(label) + ' watch");
    expect(html).toContain("Start saved signal preview ' + html(label) + ' watch");
    expect(html).toContain("Start saved filtered preview ' + html(label) + ' watch");
    expect(html).toContain("Export preview ' + html(label) + ' pairs JSON");
    expect(html).toContain("Export preview ' + html(label) + ' review CSV");
    expect(html).toContain("Export signal preview ' + html(label) + ' pairs JSON");
    expect(html).toContain("Export signal preview ' + html(label) + ' review CSV");
    expect(html).toContain("Export filtered preview ' + html(label) + ' pairs JSON");
    expect(html).toContain("Export saved filtered preview ' + html(label) + ' pairs JSON");
    expect(html).toContain("Export filtered preview ' + html(label) + ' review CSV");
    expect(html).toContain("Export saved preview ' + html(label) + ' pairs JSON");
    expect(html).toContain("Export saved signal preview ' + html(label) + ' pairs JSON");
    expect(html).toContain("Refresh filtered preview ' + html(label) + ' rows");
    expect(html).toContain("Refresh preview ' + html(label) + ' rows");
    expect(html).toContain("Retry failed filtered preview ' + html(label) + ' rows");
    expect(html).toContain("Retry failed preview ' + html(label) + ' rows");
    expect(html).toContain("Clear filtered preview ' + html(label) + ' rows");
    expect(html).toContain("Clear preview ' + html(label) + ' rows");
    expect(html).toContain("Clear preview filters");
    expect(html).toContain("All preview statuses");
    expect(html).toContain("Status ' + html(name) + ': ' + html(count)");
    expect(html).toContain("All preview pair statuses");
    expect(html).toContain("Pair ' + html(name) + ': ' + html(count)");
    expect(html).toContain("All preview local states");
    expect(html).toContain("Local ' + html(name) + ': ' + html(count)");
    expect(html).toContain("All preview reviews");
    expect(html).toContain("Review ' + html(name) + ': ' + html(count)");
    expect(html).toContain("All preview problem reasons");
    expect(html).toContain("Problem reason ' + html(name) + ': ' + html(count)");
    expect(html).toContain("arbResultPreview");
    expect(html).toContain("spreadResultPreview");
    expect(html).toContain("Pair Status");
    expect(html).toContain("Local State");
    expect(html).toContain("Review");
    expect(html).toContain("Note");
    expect(html).toContain("Best Edge");
    expect(html).toContain("Best Profit");
    expect(html).toContain("Best Diff");
    expect(html).toContain("Action");
    expect(html).toContain("resultPairActions(pairId)");
    expect(html).toContain("resultPairReviewLabel(pairId, reviewContext)");
    expect(html).toContain("$(\"arbResultPreview\").addEventListener(\"click\", handleResultActionClick)");
    expect(html).toContain("$(\"spreadResultPreview\").addEventListener(\"click\", handleResultActionClick)");
    expect(html).toContain("No successful preview ");
    expect(html).toContain("No successful filtered preview ");
    expect(html).toContain("No current-signal preview ");
    expect(html).toContain("Saving, verifying, and starring preview result pairs");
    expect(html).toContain("Saving, verifying, and starring filtered preview result pairs");
    expect(html).toContain("Saving, verifying, and starring current-signal preview result pairs");
    expect(html).toContain("Saving filtered preview result pairs");
    expect(html).toContain("Saving current-signal preview result pairs");
    expect(html).toContain("Saving preview result pairs");
    expect(html).toContain("Saved ");
    expect(html).toContain("new preview ");
    expect(html).toContain("new filtered preview ");
    expect(html).toContain("new signal preview ");
    expect(html).toContain("All filtered preview ");
    expect(html).toContain("All current-signal preview ");
    expect(html).toContain("No saved preview ");
    expect(html).toContain("No saved signal preview ");
    expect(html).toContain("No saved filtered preview ");
    expect(html).toContain("No starred saved filtered preview ");
    expect(html).toContain("No unverified saved filtered preview ");
    expect(html).toContain("No verified saved filtered preview ");
    expect(html).toContain("No paused saved filtered preview ");
    expect(html).toContain("No active saved filtered preview ");
    expect(html).toContain("pair(s) to export. Add preview pairs first.");
    expect(html).toContain("pair(s) to export. Add signal preview pairs first.");
    expect(html).toContain("pair(s) to export. Add filtered preview pairs first.");
    expect(html).toContain("Add filtered preview pairs first.");
    expect(html).toContain("to scan. Add preview pairs first.");
    expect(html).toContain("to scan. Add signal preview pairs first.");
    expect(html).toContain("to scan. Add filtered preview pairs first.");
    expect(html).toContain("to watch. Add preview pairs first.");
    expect(html).toContain("to watch. Add signal preview pairs first.");
    expect(html).toContain("to watch. Add filtered preview pairs first.");
    expect(html).toContain("Selected ");
    expect(html).toContain("saved preview ");
    expect(html).toContain("saved signal preview ");
    expect(html).toContain("saved filtered preview ");
    expect(html).toContain("preview-arb-results");
    expect(html).toContain("preview-spread-results");
    expect(html).toContain("signal-preview-arb-results");
    expect(html).toContain("signal-preview-spread-results");
    expect(html).toContain("filtered-preview-arb-results");
    expect(html).toContain("filtered-preview-spread-results");
    expect(html).toContain("Preview arb-result watch");
    expect(html).toContain("Preview spread-result watch");
    expect(html).toContain("Signal preview arb-result watch");
    expect(html).toContain("Signal preview spread-result watch");
    expect(html).toContain("Filtered preview arb-result watch");
    expect(html).toContain("Filtered preview spread-result watch");
    expect(html).toContain("preview-arb-results-watch");
    expect(html).toContain("preview-spread-results-watch");
    expect(html).toContain("signal-preview-arb-results-watch");
    expect(html).toContain("signal-preview-spread-results-watch");
    expect(html).toContain("filtered-preview-arb-results-watch");
    expect(html).toContain("filtered-preview-spread-results-watch");
    expect(html).toContain("cross-venue-preview-arb-pairs-");
    expect(html).toContain("cross-venue-preview-spread-pairs-");
    expect(html).toContain("cross-venue-preview-arb-review-");
    expect(html).toContain("cross-venue-preview-spread-review-");
    expect(html).toContain("cross-venue-signal-preview-arb-pairs-");
    expect(html).toContain("cross-venue-signal-preview-spread-pairs-");
    expect(html).toContain("cross-venue-signal-preview-arb-review-");
    expect(html).toContain("cross-venue-signal-preview-spread-review-");
    expect(html).toContain("cross-venue-filtered-preview-arb-pairs-");
    expect(html).toContain("cross-venue-filtered-preview-spread-pairs-");
    expect(html).toContain("cross-venue-filtered-preview-arb-review-");
    expect(html).toContain("cross-venue-filtered-preview-spread-review-");
    expect(html).toContain("cross-venue-saved-preview-arb-pairs-");
    expect(html).toContain("cross-venue-saved-preview-spread-pairs-");
    expect(html).toContain("cross-venue-saved-signal-preview-arb-pairs-");
    expect(html).toContain("cross-venue-saved-signal-preview-spread-pairs-");
    expect(html).toContain("cross-venue-saved-filtered-preview-arb-pairs-");
    expect(html).toContain("cross-venue-saved-filtered-preview-spread-pairs-");
    expect(html).toContain("Preview arb pairs JSON exported locally.");
    expect(html).toContain("Preview spread pairs JSON exported locally.");
    expect(html).toContain("Preview arb review CSV exported locally.");
    expect(html).toContain("Preview spread review CSV exported locally.");
    expect(html).toContain("Signal preview arb pairs JSON exported locally.");
    expect(html).toContain("Signal preview spread pairs JSON exported locally.");
    expect(html).toContain("Signal preview arb review CSV exported locally.");
    expect(html).toContain("Signal preview spread review CSV exported locally.");
    expect(html).toContain("Filtered preview arb pairs JSON exported locally.");
    expect(html).toContain("Filtered preview spread pairs JSON exported locally.");
    expect(html).toContain("Filtered preview arb review CSV exported locally.");
    expect(html).toContain("Filtered preview spread review CSV exported locally.");
    expect(html).toContain("Saved preview arb pairs JSON exported locally.");
    expect(html).toContain("Saved preview spread pairs JSON exported locally.");
    expect(html).toContain("Saved signal preview arb pairs JSON exported locally.");
    expect(html).toContain("Saved signal preview spread pairs JSON exported locally.");
    expect(html).toContain("Saved filtered preview arb pairs JSON exported locally.");
    expect(html).toContain("Saved filtered preview spread pairs JSON exported locally.");
    expect(html).toContain("No preview \" + label + \" row(s) to refresh.");
    expect(html).toContain("No filtered preview \" + label + \" row(s) to refresh.");
    expect(html).toContain("No filtered preview \" + label + \" pair(s) to export.");
    expect(html).toContain("No filtered preview \" + label + \" result rows to export for review.");
    expect(html).toContain("Refreshing \" + entries.length + \" preview \" + label + \" row(s) with read-only orderbooks");
    expect(html).toContain("Refreshing \" + entries.length + \" filtered preview \" + label + \" row(s) with read-only orderbooks");
    expect(html).toContain("Refreshed \" + previews.length + \" preview \" + label + \" row(s)");
    expect(html).toContain("Refreshed \" + entries.length + \" filtered preview \" + label + \" row(s)");
    expect(html).toContain("No failed preview \" + label + \" row(s) to retry.");
    expect(html).toContain("No failed filtered preview \" + label + \" row(s) to retry.");
    expect(html).toContain("No filtered preview \" + label + \" row(s) to clear.");
    expect(html).toContain("No active preview \" + label + \" filters. Use Clear preview rows to clear all.");
    expect(html).toContain("Retrying \" + failedEntries.length + \" failed preview \" + label + \" row(s) with read-only orderbooks");
    expect(html).toContain("Retrying \" + failedEntries.length + \" failed filtered preview \" + label + \" row(s) with read-only orderbooks");
    expect(html).toContain("Retried \" + failedEntries.length + \" failed preview \" + label + \" row(s)");
    expect(html).toContain("Retried \" + failedEntries.length + \" failed filtered preview \" + label + \" row(s)");
    expect(html).toContain("Cleared \" + entries.length + \" filtered preview \" + label + \" row(s); preview is empty.");
    expect(html).toContain("Cleared \" + entries.length + \" filtered preview \" + label + \" row(s); \" + nextPreviews.length + \" preview row(s) remain.");
    expect(html).toContain("Preview \" + label + \" row is no longer available.");
    expect(html).toContain("Removed preview \" + label + \" row; preview is empty.");
    expect(html).toContain("Removed preview \" + label + \" row; \" + nextPreviews.length + \" preview row(s) remain.");
    expect(html).toContain("still failed.");
    expect(html).toContain("Preview \" + label + \" rows filtered to status \" + next + \".");
    expect(html).toContain("Preview \" + label + \" status filter cleared.");
    expect(html).toContain("Preview \" + label + \" rows filtered to pair status \" + next + \".");
    expect(html).toContain("Preview \" + label + \" pair-status filter cleared.");
    expect(html).toContain("Preview \" + label + \" rows filtered to local state \" + next + \".");
    expect(html).toContain("Preview \" + label + \" local-state filter cleared.");
    expect(html).toContain("Preview \" + label + \" rows filtered to review \" + next + \".");
    expect(html).toContain("Preview \" + label + \" review filter cleared.");
    expect(html).toContain("Preview \" + label + \" rows filtered to problem reason \" + next + \".");
    expect(html).toContain("Preview \" + label + \" problem-reason filter cleared.");
    expect(html).toContain("\"problemReasons\"");
    expect(html).toContain("previewProblemReasons(item).join(\"|\")");
    expect(html).toContain("Preview \" + label + \" rows sorted by \" + previewSortLabel(kind) + \".");
    expect(html).toContain("Preview \" + label + \" sort reset to preview order.");
    expect(html).toContain("Preview \" + label + \" rows searched for \" + next + \".");
    expect(html).toContain("Preview \" + label + \" search cleared.");
    expect(html).toContain("Preview \" + label + \" signal view applied.");
    expect(html).toContain("Preview \" + label + \" saved-active view applied.");
    expect(html).toContain("Preview \" + label + \" priority view applied.");
    expect(html).toContain("Preview \" + label + \" needs-review view applied.");
    expect(html).toContain("Preview \" + label + \" problem view applied.");
    expect(html).toContain("Preview \" + label + \" view reset.");
    expect(html).toContain("previewResultSort: {");
    expect(html).toContain("resultPreviewSearch[kind]");
    expect(html).toContain("state.previewResultSort[kind] = kind === \"arbs\" ? \"edge_desc\" : \"diff_desc\";");
    expect(html).toContain("state.previewResultSort[kind] = \"preview_order\";");
    expect(html).toContain("return \"Custom\";");
    expect(html).toContain("arbs: String(state.previewResultSort.arbs");
    expect(html).toContain("spreads: String(state.previewResultSort.spreads");
    expect(html).toContain("parsed.previewResultSort.arbs");
    expect(html).toContain("parsed.previewResultSort.spreads");
    expect(html).toContain("No preview \" + label + \" filters to clear.");
    expect(html).toContain("Preview \" + label + \" filters cleared.");
    expect(html).toContain("Preview arb rows cleared.");
    expect(html).toContain("Preview spread rows cleared.");
    expect(html).toContain("No preview ");
    expect(html).toContain("No current-signal preview ");
    expect(html).toContain("Starring saved preview ");
    expect(html).toContain("Unstarring saved preview ");
    expect(html).toContain("Verifying saved preview ");
    expect(html).toContain("Unverifying saved preview ");
    expect(html).toContain("Pausing saved preview ");
    expect(html).toContain("Resuming saved preview ");
    expect(html).toContain("Starring saved filtered preview ");
    expect(html).toContain("Unstarring saved filtered preview ");
    expect(html).toContain("Verifying saved filtered preview ");
    expect(html).toContain("Unverifying saved filtered preview ");
    expect(html).toContain("Pausing saved filtered preview ");
    expect(html).toContain("Resuming saved filtered preview ");
    expect(html).toContain("No starred saved preview ");
    expect(html).toContain("No verified saved preview ");
    expect(html).toContain("No paused saved preview ");
    expect(html).toContain("No active saved preview ");
    expect(html).toContain("Starred ");
    expect(html).toContain("Unstarred ");
    expect(html).toContain("Verified ");
    expect(html).toContain("Unverified ");
    expect(html).toContain("Paused ");
    expect(html).toContain("Resumed ");
    expect(html).toContain("setOptionalDisabled");
    expect(html).toContain("Add preview result pairs failed");
    expect(html).toContain("Add verified priority preview result pairs failed");
    expect(html).toContain("Add filtered preview result pairs failed");
    expect(html).toContain("Add verified priority filtered preview result pairs failed");
    expect(html).toContain("Add signal preview result pairs failed");
    expect(html).toContain("Add verified priority signal preview result pairs failed");
    expect(html).toContain("Scan preview result pairs failed");
    expect(html).toContain("Scan signal preview result pairs failed");
    expect(html).toContain("Scan filtered preview result pairs failed");
    expect(html).toContain("Refresh filtered preview result pairs failed");
    expect(html).toContain("Refresh preview result pairs failed");
    expect(html).toContain("Retry failed filtered preview result pairs failed");
    expect(html).toContain("Retry failed preview result pairs failed");
    expect(html).toContain("Star preview result pairs failed");
    expect(html).toContain("Unstar preview result pairs failed");
    expect(html).toContain("Verify preview result pairs failed");
    expect(html).toContain("Unverify preview result pairs failed");
    expect(html).toContain("Pause preview result pairs failed");
    expect(html).toContain("Resume preview result pairs failed");
    expect(html).toContain("Star filtered preview result pairs failed");
    expect(html).toContain("Unstar filtered preview result pairs failed");
    expect(html).toContain("Verify filtered preview result pairs failed");
    expect(html).toContain("Unverify filtered preview result pairs failed");
    expect(html).toContain("Pause filtered preview result pairs failed");
    expect(html).toContain("Resume filtered preview result pairs failed");
    expect(html).toContain("No saved visible arb result pairs to watch.");
    expect(html).toContain("No saved visible spread result pairs to watch.");
    expect(html).toContain("No active saved visible arb result pairs to pause.");
    expect(html).toContain("No active saved visible spread result pairs to pause.");
    expect(html).toContain("Pausing visible arb result pairs");
    expect(html).toContain("Pausing visible spread result pairs");
    expect(html).toContain("No paused saved visible arb result pairs to resume.");
    expect(html).toContain("No paused saved visible spread result pairs to resume.");
    expect(html).toContain("Resuming visible arb result pairs");
    expect(html).toContain("Resuming visible spread result pairs");
    expect(html).toContain("Resumed ");
    expect(html).toContain("No unverified saved visible arb result pairs to verify.");
    expect(html).toContain("No unverified saved visible spread result pairs to verify.");
    expect(html).toContain("No verified saved visible arb result pairs to unverify.");
    expect(html).toContain("No verified saved visible spread result pairs to unverify.");
    expect(html).toContain("Verifying visible arb result pairs");
    expect(html).toContain("Verifying visible spread result pairs");
    expect(html).toContain("Unverifying visible arb result pairs");
    expect(html).toContain("Unverifying visible spread result pairs");
    expect(html).toContain("Verified ");
    expect(html).toContain("Unverified ");
    expect(html).toContain("visible arb result pair(s).");
    expect(html).toContain("visible spread result pair(s).");
    expect(html).toContain("No visible arb result pairs to export.");
    expect(html).toContain("No visible spread result pairs to export.");
    expect(html).toContain("No visible arb result rows to export for review.");
    expect(html).toContain("No visible spread result rows to export for review.");
    expect(html).toContain("visible-arb-results-watch");
    expect(html).toContain("visible-spread-results-watch");
    expect(html).toContain("Visible arb-result watch");
    expect(html).toContain("Visible spread-result watch");
    expect(html).toContain("cross-venue-visible-arb-pairs-");
    expect(html).toContain("cross-venue-visible-spread-pairs-");
    expect(html).toContain("cross-venue-visible-arb-review-");
    expect(html).toContain("cross-venue-visible-spread-review-");
    expect(html).toContain("Visible arb result pairs JSON exported locally.");
    expect(html).toContain("Visible spread result pairs JSON exported locally.");
    expect(html).toContain("Visible arb review CSV exported locally.");
    expect(html).toContain("Visible spread review CSV exported locally.");
    expect(html).toContain("kalshiUrl");
    expect(html).toContain("polymarketUrl");
    expect(html).toContain("unsaved result pair(s) skipped.");
    expect(html).toContain("Add visible arbs failed");
    expect(html).toContain("Add verified visible arbs failed");
    expect(html).toContain("Add verified priority visible arbs failed");
    expect(html).toContain("Star visible arbs failed");
    expect(html).toContain("Unstar visible arbs failed");
    expect(html).toContain("Select visible arbs failed");
    expect(html).toContain("Preview visible arbs failed");
    expect(html).toContain("Scan visible arbs failed");
    expect(html).toContain("Start visible arbs watch failed");
    expect(html).toContain("Pause visible arbs failed");
    expect(html).toContain("Resume visible arbs failed");
    expect(html).toContain("Verify visible arbs failed");
    expect(html).toContain("Unverify visible arbs failed");
    expect(html).toContain("Export visible arb pairs JSON failed");
    expect(html).toContain("Export visible arb review CSV failed");
    expect(html).toContain("Add visible spreads failed");
    expect(html).toContain("Add verified visible spreads failed");
    expect(html).toContain("Add verified priority visible spreads failed");
    expect(html).toContain("Star visible spreads failed");
    expect(html).toContain("Unstar visible spreads failed");
    expect(html).toContain("Select visible spreads failed");
    expect(html).toContain("Preview visible spreads failed");
    expect(html).toContain("Scan visible spreads failed");
    expect(html).toContain("Start visible spreads watch failed");
    expect(html).toContain("Pause visible spreads failed");
    expect(html).toContain("Resume visible spreads failed");
    expect(html).toContain("Verify visible spreads failed");
    expect(html).toContain("Unverify visible spreads failed");
    expect(html).toContain("Export visible spread pairs JSON failed");
    expect(html).toContain("Export visible spread review CSV failed");
    expect(html).toContain("scanConfiguredPair");
    expect(html).toContain("Saving scan result pair to local watchlist");
    expect(html).toContain("Scan result pair saved locally.");
    expect(html).toContain("Add result pair failed");
    expect(html).toContain("Add verified result pair failed");
    expect(html).toContain("Add priority");
    expect(html).toContain("Saving scan result pair as priority");
    expect(html).toContain("Scan result pair saved as priority.");
    expect(html).toContain("Add priority result pair failed");
    expect(html).toContain("Add verified priority");
    expect(html).toContain("Saving scan result pair as verified priority");
    expect(html).toContain("Scan result pair saved as verified priority.");
    expect(html).toContain("Add verified priority result pair failed");
    expect(html).toContain("Saving scan result pair as manually verified");
    expect(html).toContain("Scan result pair saved as manually verified.");
    expect(html).toContain("single-pair");
    expect(html).toContain("Single-pair scan failed");
    expect(html).toContain("Pair is not in the local configured watchlist.");
    expect(html).toContain("getVisibleArbs");
    expect(html).toContain("getVisiblePriceSpreads");
    expect(html).toContain("arbSummary");
    expect(html).toContain("spreadSummary");
    expect(html).toContain("renderArbSummary");
    expect(html).toContain("renderSpreadSummary");
    expect(html).toContain("summarizeVisibleArbMetrics");
    expect(html).toContain("summarizeVisibleSpreadMetrics");
    expect(html).toContain("summarizeArbVenues");
    expect(html).toContain("summarizeSpreadSides");
    expect(html).toContain("arbVenueFilter");
    expect(html).toContain("spreadSideFilter");
    expect(html).toContain("setArbVenueFilter");
    expect(html).toContain("setSpreadSideFilter");
    expect(html).toContain("data-arb-venue-filter");
    expect(html).toContain("data-clear-arb-venue-filter");
    expect(html).toContain("data-spread-side-filter");
    expect(html).toContain("data-clear-spread-side-filter");
    expect(html).toContain("matchesArbVenue");
    expect(html).toContain("matchesSpreadSide");
    expect(html).toContain("Min profit $");
    expect(html).toContain("minResultProfitDollars");
    expect(html).toContain("Min spread c");
    expect(html).toContain("minResultSpreadCents");
    expect(html).toContain("Top rows");
    expect(html).toContain("resultLimitRows");
    expect(html).toContain("Arb sort");
    expect(html).toContain("arbResultSort");
    expect(html).toContain("Spread sort");
    expect(html).toContain("spreadResultSort");
    expect(html).toContain("Report order");
    expect(html).toContain("Profit desc");
    expect(html).toContain("Net edge desc");
    expect(html).toContain("ROI desc");
    expect(html).toContain("Size desc");
    expect(html).toContain("Diff desc");
    expect(html).toContain("showReviewedResults");
    expect(html).toContain("showPriorityResults");
    expect(html).toContain("showNewResultCandidates");
    expect(html).toContain("showNeedsReviewResults");
    expect(html).toContain("Reviewed view");
    expect(html).toContain("Priority view");
    expect(html).toContain("New candidates");
    expect(html).toContain("Needs-review view");
    expect(html).toContain("applyResultQuickView");
    expect(html).toContain("resultQuickViewStatus");
    expect(html).toContain("Reviewed result view applied.");
    expect(html).toContain("Priority result view applied.");
    expect(html).toContain("New candidate result view applied.");
    expect(html).toContain("Needs-review result view applied.");
    expect(html).toContain("needs_review");
    expect(html).toContain("sortVisibleArbs");
    expect(html).toContain("sortVisiblePriceSpreads");
    expect(html).toContain("ARB_RESULT_SORT_VALUES");
    expect(html).toContain("SPREAD_RESULT_SORT_VALUES");
    expect(html).toContain("arbResultSort: String(state.arbResultSort");
    expect(html).toContain("spreadResultSort: String(state.spreadResultSort");
    expect(html).toContain("parsed.arbResultSort");
    expect(html).toContain("parsed.spreadResultSort");
    expect(html).toContain("Sort: ");
    expect(html).toContain("limitVisibleResults");
    expect(html).toContain("matchesMinResultProfit");
    expect(html).toContain("matchesMinResultSpread");
    expect(html).toContain("readOptionalPositiveIntegerInput");
    expect(html).toContain("resultLimitRows: readOptionalPositiveIntegerInput");
    expect(html).toContain("parsed.resultLimitRows");
    expect(html).toContain("readOptionalNumberInput");
    expect(html).toContain("Min profit: $");
    expect(html).toContain("Min spread: ");
    expect(html).toContain("Clear result filters");
    expect(html).toContain("clearResultFilters");
    expect(html).toContain("Result filters cleared.");
    expect(html).toContain("Arbs: ");
    expect(html).toContain("Visible arbs:");
    expect(html).toContain("Visible best edge:");
    expect(html).toContain("Visible best profit:");
    expect(html).toContain("Top rows: ");
    expect(html).toContain("Spreads: ");
    expect(html).toContain("Visible spreads:");
    expect(html).toContain("Visible best diff:");
    expect(html).toContain("All arbs");
    expect(html).toContain("All spreads");
    expect(html).toContain("exportVisibleArbsCsv");
    expect(html).toContain("exportVisibleSpreadsCsv");
    expect(html).toContain("Visible arbs CSV exported locally.");
    expect(html).toContain("Visible price spreads CSV exported locally.");
    expect(html).toContain("No visible arbs to export.");
    expect(html).toContain("No visible price spreads to export.");
    expect(html).toContain("cross-venue-visible-arbs-");
    expect(html).toContain("cross-venue-visible-spreads-");
    expect(html).toContain("buildNearMatchesCsv");
    expect(html).toContain("buildPairReviewCsv");
    expect(html).toContain("exportPairReviewCsv");
    expect(html).toContain("Pair review CSV exported locally.");
    expect(html).toContain("Review export failed");
    expect(html).toContain("needs_review");
    expect(html).toContain("downloadText");
    expect(html).toContain("Best Arb");
    expect(html).toContain("Best Spread");
    expect(html).toContain("bestOpportunity");
    expect(html).toContain("bestPriceSpread");
    expect(html).toContain("data-sort-column");
    expect(html).toContain("sortTableByHeader");
    expect(html).toContain("compareTableCellText");
    expect(html).toContain("parseSortableNumber");
    expect(html).toContain("Sort column");
    expect(html).toContain("watchIntervalSeconds");
    expect(html).toContain("Notify on arbs");
    expect(html).toContain("Verified alerts only");
    expect(html).toContain("Verified results only");
    expect(html).toContain("Enable notifications");
    expect(html).toContain("crossVenueNotifyOnArbs:v1");
    expect(html).toContain("crossVenueNotifyVerifiedOnly:v1");
    expect(html).toContain("Notification.requestPermission");
    expect(html).toContain("Cross-venue arb candidates");
    expect(html).toContain("Verified cross-venue arb candidates");
    expect(html).toContain("Local arb notifications enabled.");
    expect(html).toContain("notifyVerifiedOnly");
    expect(html).toContain("getNotifiableArbs");
    expect(html).toContain("buildArbNotificationSignature(arbs)");
    expect(html).toContain("Scan History");
    expect(html).toContain("scanHistory");
    expect(html).toContain("scanReadyPairs");
    expect(html).toContain("Clear history");
    expect(html).toContain("crossVenueScanHistory:v1");
    expect(html).toContain("crossVenueDashboardSettings:v1");
    expect(html).toContain("verifiedResultsOnly");
    expect(html).toContain("matchesVerifiedResultPair");
    expect(html).toContain("Verified arbs:");
    expect(html).toContain("Verified spreads:");
    expect(html).toContain("Showing verified only");
    expect(html).toContain("localStorage");
    expect(html).toContain("loadDashboardSettings");
    expect(html).toContain("saveDashboardSettings");
    expect(html).toContain("bindDashboardSettingsPersistence");
    expect(html).toContain("Arbitrage candidates found");
    expect(html).toContain("watchStatus");
    expect(html).toContain("Watch stopped.");
    expect(html).toContain("Configured-pair watch");
    expect(html).toContain("Ready-pair watch");
    expect(html).toContain("running. Waiting for first scan.");
    expect(html).toContain("refreshed at");
    expect(html).toContain("startReadyWatch");
    expect(html).toContain("ready-watch");
    expect(html).toContain("Last watch scan");
    expect(html).toContain("mode=");
    expect(html).toContain("arbs=");
    expect(html).toContain("Scan skipped: previous scan still running.");
    expect(html).toContain("Rejected Pairs");
    expect(html).toContain("Visible rejected:");
    expect(html).toContain("exportRejectedCsv");
    expect(html).toContain("buildRejectedPairsCsv");
    expect(html).toContain("getVisibleRejectedPairs");
    expect(html).toContain("Rejected pairs CSV exported locally.");
    expect(html).toContain("No rejected pairs visible to export.");
    expect(html).toContain("cross-venue-rejected-");
    expect(html).toContain("pauseVisibleRejectedPairs");
    expect(html).toContain("No active visible rejected pairs to pause.");
    expect(html).toContain("Paused ");
    expect(html).toContain("visible rejected pair(s).");
    expect(html).toContain("Pause rejected failed");
    expect(html).toContain("rejectionSummary");
    expect(html).toContain("renderRejectionSummary");
    expect(html).toContain("summarizeRejectionReasons");
    expect(html).toContain("data-rejection-filter");
    expect(html).toContain("data-clear-rejection-filter");
    expect(html).toContain("rejectionReasonFilter");
    expect(html).toContain("setRejectionReasonFilter");
    expect(html).toContain("matchesRejectionReason");
    expect(html).toContain("Rejected: ");
    expect(html).toContain("explainRejectionReason");
    expect(html).toContain("Pair was scanned but not usable as a clean cross-venue arb candidate.");
    expect(html).toContain("minNetCents");
    expect(html).toContain("kalshiFeeCents");
    expect(html).toContain("polymarketFeeCents");
    expect(html).toContain("/api/scan");
    expect(html).toContain("/api/scan-ready");
    expect(html).toContain("/api/pairs");
    expect(html).toContain("/api/pairs/bulk");
    expect(html).toContain("/api/pairs/priority/bulk");
    expect(html).toContain("/api/search");
    expect(html).toContain("Configured Pairs");
    expect(html).toContain("configPairPreview");
    expect(html).toContain("data-preview-config-pair");
    expect(html).toContain("previewConfiguredPair");
    expect(html).toContain("fetchPairPreview");
    expect(html).toContain("Configured Pair Preview");
    expect(html).toContain("Scan Result Pair Preview");
    expect(html).toContain("Pair is not in local configured pairs or the loaded scan report.");
    expect(html).toContain("/api/pairs/note");
    expect(html).toContain("data-edit-note-pair");
    expect(html).toContain("data-clear-note-pair");
    expect(html).toContain("editConfiguredPairNote");
    expect(html).toContain("clearConfiguredPairNote");
    expect(html).toContain("saveConfiguredPairNote");
    expect(html).toContain("setConfiguredPairNote");
    expect(html).toContain("Note selected");
    expect(html).toContain("Clear selected notes");
    expect(html).toContain("noteSelectedPairs");
    expect(html).toContain("clearSelectedPairNotes");
    expect(html).toContain("editSelectedPairNotes");
    expect(html).toContain("saveSelectedPairNotes");
    expect(html).toContain("Selected note edit canceled.");
    expect(html).toContain("Clear selected notes canceled.");
    expect(html).toContain("Saving selected pair notes...");
    expect(html).toContain("Clearing selected pair notes...");
    expect(html).toContain("Selected pair notes saved locally.");
    expect(html).toContain("Selected pair notes cleared locally.");
    expect(html).toContain("Note selected pairs failed");
    expect(html).toContain("Clear selected pair notes failed");
    expect(html).toContain("Pair note saved locally.");
    expect(html).toContain("Pair note cleared locally.");
    expect(html).toContain("Note save failed");
    expect(html).toContain("Note clear failed");
    expect(html).toContain("Pause visible");
    expect(html).toContain("Resume visible");
    expect(html).toContain("Star visible");
    expect(html).toContain("Unstar visible");
    expect(html).toContain("bulkSetVisiblePairsEnabled");
    expect(html).toContain("bulkSetVisiblePairsPriority");
    expect(html).toContain("No active visible pairs to pause.");
    expect(html).toContain("No paused visible pairs to resume.");
    expect(html).toContain("Visible pairs paused locally.");
    expect(html).toContain("Visible pairs resumed locally.");
    expect(html).toContain("Visible pairs added to priority watchlist.");
    expect(html).toContain("Visible pairs removed from priority watchlist.");
    expect(html).toContain("Visible pause failed");
    expect(html).toContain("Visible resume failed");
    expect(html).toContain("Visible star failed");
    expect(html).toContain("Visible unstar failed");
    expect(html).toContain("Pause selected");
    expect(html).toContain("Resume selected");
    expect(html).toContain("Star selected");
    expect(html).toContain("Unstar selected");
    expect(html).toContain("Remove selected");
    expect(html).toContain("removeSelectedPairs");
    expect(html).toContain("removeConfiguredPair");
    expect(html).toContain("Remove selected canceled.");
    expect(html).toContain("Bulk remove failed");
    expect(html).toContain("selected local pair config");
    expect(html).toContain("Pause needs-review");
    expect(html).toContain("pauseNeedsReviewPairs");
    expect(html).toContain("Paused ");
    expect(html).toContain("No active needs-review pairs to pause.");
    expect(html).toContain("Pause needs-review failed");
    expect(html).toContain("Pause last-rejected");
    expect(html).toContain("pauseLastRejectedPairs");
    expect(html).toContain("No active last-rejected pairs to pause.");
    expect(html).toContain("last-rejected pair(s) locally.");
    expect(html).toContain("Pause last-rejected failed");
    expect(html).toContain("Select visible");
    expect(html).toContain("Clear selection");
    expect(html).toContain("Scan visible");
    expect(html).toContain("Scan selected");
    expect(html).toContain("Scan priority");
    expect(html).toContain("Scan verified");
    expect(html).toContain("Start visible watch");
    expect(html).toContain("Start selected watch");
    expect(html).toContain("Start priority watch");
    expect(html).toContain("Start verified watch");
    expect(html).toContain("Start last-rejected watch");
    expect(html).toContain("Scan last-rejected");
    expect(html).toContain("Export visible review CSV");
    expect(html).toContain("exportVisiblePairReviewCsv");
    expect(html).toContain("Visible pair review CSV exported locally.");
    expect(html).toContain("cross-venue-visible-pair-review-");
    expect(html).toContain("Copy visible review CSV");
    expect(html).toContain("copyVisibleReviewCsv");
    expect(html).toContain("copyVisiblePairReviewCsv");
    expect(html).toContain("Visible pair review CSV copied to clipboard.");
    expect(html).toContain("Copy visible review CSV failed");
    expect(html).toContain("Copy visible summaries");
    expect(html).toContain("copyVisibleSummaries");
    expect(html).toContain("copyVisiblePairSummaries");
    expect(html).toContain("No visible configured pairs to copy.");
    expect(html).toContain("No visible pair summaries available to copy.");
    expect(html).toContain("Visible pair summaries copied to clipboard.");
    expect(html).toContain("Copy visible summaries failed");
    expect(html).toContain("Export selected review CSV");
    expect(html).toContain("exportSelectedPairReviewCsv");
    expect(html).toContain("exportSelectedReviewCsv");
    expect(html).toContain("Selected pair review CSV exported locally.");
    expect(html).toContain("cross-venue-selected-pair-review-");
    expect(html).toContain("Copy selected review CSV");
    expect(html).toContain("copySelectedReviewCsv");
    expect(html).toContain("copySelectedPairReviewCsv");
    expect(html).toContain("Selected pair review CSV copied to clipboard.");
    expect(html).toContain("Copy selected review CSV failed");
    expect(html).toContain("copyTextToClipboard(buildPairReviewCsv(pairs))");
    expect(html).toContain("Copy selected summaries");
    expect(html).toContain("copySelectedSummaries");
    expect(html).toContain("copySelectedPairSummaries");
    expect(html).toContain("No selected pair summaries available to copy.");
    expect(html).toContain("Selected pair summaries copied to clipboard.");
    expect(html).toContain("Copy selected summaries failed");
    expect(html).toContain("copyTextToClipboard(summaries.join");
    expect(html).toContain("Export visible JSON");
    expect(html).toContain("exportVisiblePairsJson");
    expect(html).toContain("Visible pairs JSON exported locally.");
    expect(html).toContain("No visible configured pairs to export.");
    expect(html).toContain("cross-venue-visible-pairs-");
    expect(html).toContain("Copy visible JSON");
    expect(html).toContain("copyVisiblePairsJson");
    expect(html).toContain("Visible pairs JSON copied to clipboard.");
    expect(html).toContain("Copy visible JSON failed");
    expect(html).toContain("Export selected JSON");
    expect(html).toContain("exportSelectedPairsJson");
    expect(html).toContain("Selected pairs JSON exported locally.");
    expect(html).toContain("cross-venue-selected-pairs-");
    expect(html).toContain("Copy selected JSON");
    expect(html).toContain("copySelectedPairsJson");
    expect(html).toContain("Selected pairs JSON copied to clipboard.");
    expect(html).toContain("Copy selected JSON failed");
    expect(html).toContain("Export ready JSON");
    expect(html).toContain("exportReadyPairsJson");
    expect(html).toContain("Ready pairs JSON exported locally.");
    expect(html).toContain("No ready configured pairs to export.");
    expect(html).toContain("cross-venue-ready-pairs-");
    expect(html).toContain("Export priority JSON");
    expect(html).toContain("exportPriorityPairsJson");
    expect(html).toContain("Priority pairs JSON exported locally.");
    expect(html).toContain("No priority configured pairs to export.");
    expect(html).toContain("cross-venue-priority-pairs-");
    expect(html).toContain("Export verified JSON");
    expect(html).toContain("exportVerifiedPairsJson");
    expect(html).toContain("Verified pairs JSON exported locally.");
    expect(html).toContain("No verified configured pairs to export.");
    expect(html).toContain("cross-venue-verified-pairs-");
    expect(html).toContain("Export last-rejected JSON");
    expect(html).toContain("exportLastRejectedPairsJson");
    expect(html).toContain("getLastRejectedConfigPairs");
    expect(html).toContain("Last-rejected pairs JSON exported locally.");
    expect(html).toContain("No last-rejected configured pairs to export.");
    expect(html).toContain("cross-venue-last-rejected-pairs-");
    expect(html).toContain("scanVisiblePairs");
    expect(html).toContain("No visible configured pairs to scan.");
    expect(html).toContain("startVisibleWatch");
    expect(html).toContain("No visible configured pairs to watch.");
    expect(html).toContain("Visible-pair watch");
    expect(html).toContain("visible-watch");
    expect(html).toContain("Visible scan failed");
    expect(html).toContain("scanSelectedPairs");
    expect(html).toContain("scanPriorityPairs");
    expect(html).toContain("getPriorityConfigPairIds");
    expect(html).toContain("No active priority configured pairs to scan.");
    expect(html).toContain("Priority scan failed");
    expect(html).toContain("scanVerifiedPairs");
    expect(html).toContain("getVerifiedConfigPairIds");
    expect(html).toContain("No active verified configured pairs to scan.");
    expect(html).toContain("Verified scan failed");
    expect(html).toContain("scanLastRejectedPairs");
    expect(html).toContain("No last-rejected configured pairs to scan.");
    expect(html).toContain("Last-rejected scan failed");
    expect(html).toContain("startLastRejectedWatch");
    expect(html).toContain("No last-rejected configured pairs to watch.");
    expect(html).toContain("Last-rejected watch");
    expect(html).toContain("last-rejected-watch");
    expect(html).toContain("last-rejected");
    expect(html).toContain("startSelectedWatch");
    expect(html).toContain("startPriorityWatch");
    expect(html).toContain("No active priority configured pairs to watch.");
    expect(html).toContain("Priority-pair watch");
    expect(html).toContain("priority-watch");
    expect(html).toContain("startVerifiedWatch");
    expect(html).toContain("No active verified configured pairs to watch.");
    expect(html).toContain("Verified-pair watch");
    expect(html).toContain("verified-watch");
    expect(html).toContain("/api/scan-selected");
    expect(html).toContain("Selected scan failed");
    expect(html).toContain("Selected-pair watch");
    expect(html).toContain("selected-watch");
    expect(html).toContain("Priority");
    expect(html).toContain("Note");
    expect(html).toContain("Ready");
    expect(html).toContain("Needs review");
    expect(html).toContain("Last arb");
    expect(html).toContain("Last spread");
    expect(html).toContain("Last rejected");
    expect(html).toContain("getConfiguredPairReview");
    expect(html).toContain("isConfiguredPairReady");
    expect(html).toContain("isConfiguredPairLastArb");
    expect(html).toContain("isConfiguredPairLastSpread");
    expect(html).toContain("isConfiguredPairLastRejected");
    expect(html).toContain("shouldShowConfiguredPairForFilter");
    expect(html).toContain("toggleConfiguredPairPriority");
    expect(html).toContain("setConfiguredPairPriority");
    expect(html).toContain("/api/pairs/priority");
    expect(html).toContain("/api/pairs/verified");
    expect(html).toContain("/api/pairs/verified/bulk");
    expect(html).toContain("setConfiguredPairsPriority");
    expect(html).toContain("setConfiguredPairVerified");
    expect(html).toContain("setConfiguredPairsVerified");
    expect(html).toContain("toggleConfiguredPairVerified");
    expect(html).toContain("bulkSetVisiblePairsVerified");
    expect(html).toContain("bulkSetSelectedPairsVerified");
    expect(html).toContain("data-toggle-priority-pair");
    expect(html).toContain("data-toggle-priority");
    expect(html).toContain("data-toggle-verified-pair");
    expect(html).toContain("data-toggle-verified");
    expect(html).toContain("Priority toggle failed");
    expect(html).toContain("Verified toggle failed");
    expect(html).toContain("Verify visible");
    expect(html).toContain("Unverify visible");
    expect(html).toContain("Verify selected");
    expect(html).toContain("Unverify selected");
    expect(html).toContain("Verified: ");
    expect(html).toContain("data-pair-filter=\"verified\"");
    expect(html).toContain("data-pair-filter=\"unverified\"");
    expect(html).toContain("verified");
    expect(html).toContain("unverified");
    expect(html).toContain("missing_resolution_time");
    expect(html).toContain("low_text_overlap");
    expect(html).toContain("duplicate_kalshi_ticker");
    expect(html).toContain("duplicate_polymarket_slug");
    expect(html).toContain("duplicate_token_pair");
    expect(html).toContain("buildConfiguredPairReviewContext");
    expect(html).toContain("normalizedTokenPairKey");
    expect(html).toContain("Review");
    expect(html).toContain("data-select-config-pair");
    expect(html).toContain("selectedConfigPairIds");
    expect(html).toContain("setConfigPairSelected");
    expect(html).toContain("getVisibleConfigPairIds");
    expect(html).toContain("setVisibleConfigPairsSelected");
    expect(html).toContain("bulkSetSelectedPairsEnabled");
    expect(html).toContain("bulkSetSelectedPairsPriority");
    expect(html).toContain("setConfiguredPairsEnabled");
    expect(html).toContain("Selected pairs added to priority watchlist.");
    expect(html).toContain("Selected pairs removed from priority watchlist.");
    expect(html).toContain("Bulk star failed");
    expect(html).toContain("Bulk unstar failed");
    expect(html).toContain("Selected: ");
    expect(html).toContain("configPairSummary");
    expect(html).toContain("Ready: ");
    expect(html).toContain("Last arb: ");
    expect(html).toContain("Last spread: ");
    expect(html).toContain("Last rejected: ");
    expect(html).toContain("Last Scan");
    expect(html).toContain("getPairLastScanStatus");
    expect(html).toContain("not in last scan");
    expect(html).toContain("arb x");
    expect(html).toContain("spread x");
    expect(html).toContain("data-pair-filter=\"all\"");
    expect(html).toContain("data-pair-filter=\"ready\"");
    expect(html).toContain("data-pair-filter=\"active\"");
    expect(html).toContain("data-pair-filter=\"paused\"");
    expect(html).toContain("data-pair-filter=\"review\"");
    expect(html).toContain("data-pair-filter=\"lastArb\"");
    expect(html).toContain("data-pair-filter=\"lastSpread\"");
    expect(html).toContain("data-pair-filter=\"lastRejected\"");
    expect(html).toContain("setConfigPairFilter");
    expect(html).toContain("reviewWarningFilter");
    expect(html).toContain("matchesReviewWarning");
    expect(html).toContain("summarizeReviewWarnings");
    expect(html).toContain("renderConfigReviewWarningSummary");
    expect(html).toContain("setReviewWarningFilter");
    expect(html).toContain("data-review-warning-filter");
    expect(html).toContain("data-clear-review-warning-filter");
    expect(html).toContain("Warning filter: ");
    expect(html).toContain("All warnings");
    expect(html).toContain("lastArb");
    expect(html).toContain("lastSpread");
    expect(html).toContain("lastRejected");
    expect(html).toContain("Filter: ");
    expect(html).toContain("Pair Builder");
    expect(html).toContain("Pair quality");
    expect(html).toContain("Preview selected pair");
    expect(html).toContain("Save verified pair");
    expect(html).toContain("saveVerifiedManualPair");
    expect(html).toContain("selectedPairPreviewId");
    expect(html).toContain("selectedPairPreviewReady");
    expect(html).toContain("updateManualPairButtons");
    expect(html).toContain("Preview this exact pair before saving it as verified");
    expect(html).toContain("Save this previewed pair as manually verified");
    expect(html).toContain("Save as verified only if the mapping and economics make sense");
    expect(html).toContain("Saving local verified pair config");
    expect(html).toContain("Pair saved locally as manually verified");
    expect(html).toContain("Scan verified");
    expect(html).toContain("Start verified watch");
    expect(html).toContain("/api/preview-pair");
    expect(html).toContain("Add pair");
    expect(html).toContain("data-add-pair-key");
    expect(html).toContain("data-add-verified-pair-key");
    expect(html).toContain("data-preview-near-pair-key");
    expect(html).toContain("nearSummary");
    expect(html).toContain("renderNearSummary");
    expect(html).toContain("summarizeNearStatuses");
    expect(html).toContain("data-near-status-filter");
    expect(html).toContain("data-clear-near-status-filter");
    expect(html).toContain("nearStatusFilter");
    expect(html).toContain("setNearStatusFilter");
    expect(html).toContain("matchesNearStatus");
    expect(html).toContain("isAddableNearCandidate");
    expect(html).toContain("Near matches: ");
    expect(html).toContain("Visible near:");
    expect(html).toContain("Addable: ");
    expect(html).toContain("candidateKey");
    expect(html).toContain("previewNearCandidatePair");
    expect(html).toContain("buildPairFromCandidate");
    expect(html).toContain("Near Match Preview");
    expect(html).toContain("nearPairPreview");
    expect(html).toContain("Near match preview loaded.");
    expect(html).toContain("Near preview failed");
    expect(html).toContain("Save verified failed");
    expect(html).toContain("exportNearCsv");
    expect(html).toContain("getVisibleNearCandidates");
    expect(html).toContain("Near matches CSV exported locally.");
    expect(html).toContain("No near matches visible to export.");
    expect(html).toContain("cross-venue-near-matches-");
    expect(html).toContain("Use Kalshi");
    expect(html).toContain("Use Polymarket");
    expect(html).toContain("data-toggle-pair");
    expect(html).toContain("Pause");
    expect(html).toContain("Resume");
    expect(html).toContain("toggleConfiguredPair");
    expect(html).toContain("Remove");
    expect(html).toContain("No live trading");
    expect(html).not.toContain("@polymarket/clob-client");
    expect(html).not.toMatch(/placeOrder|postOrder|buyLimit|sellPosition/);
    expect(html).not.toMatch(/private[_-]?key|seed phrase/i);
  });

  it("scores selected pair quality and warns on mismatches", () => {
    const good = evaluateCrossVenuePairQuality(
      {
        ticker: "KXTEST",
        eventTicker: "KXTESTEVENT",
        title: "Will the test market happen?",
        subtitle: "",
        yesSubTitle: "YES",
        noSubTitle: "NO",
        expectedResolutionAt: Date.UTC(2026, 5, 30),
        yesAsk: 0.45,
        noAsk: 0.56,
        liquidityDollars: 1000,
        volume24h: 25,
        matchScore: 1,
        matchReason: "shared=test,market",
      },
      {
        slug: "will-the-test-market-happen",
        question: "Will the test market happen?",
        yesTokenId: "yes-token",
        noTokenId: "no-token",
        expectedResolutionAt: Date.UTC(2026, 5, 30),
        matchScore: 1,
        matchReason: "shared=test,market",
      },
    );
    const risky = evaluateCrossVenuePairQuality(
      {
        ticker: "KXTEST",
        eventTicker: "KXTESTEVENT",
        title: "Will the test market happen?",
        subtitle: "",
        yesSubTitle: "YES",
        noSubTitle: "NO",
        expectedResolutionAt: Date.UTC(2026, 5, 30),
        yesAsk: 0.45,
        noAsk: 0.56,
        liquidityDollars: 1000,
        volume24h: 25,
        matchScore: 1,
        matchReason: "shared=test,market",
      },
      {
        slug: "will-an-unrelated-election-happen",
        question: "Will an unrelated election happen?",
        yesTokenId: "yes-token",
        noTokenId: "no-token",
        expectedResolutionAt: Date.UTC(2027, 5, 30),
        matchScore: 1,
        matchReason: "shared=happen",
      },
    );

    expect(good.status).toBe("ok");
    expect(good.matchScore).toBeGreaterThan(0.5);
    expect(good.warnings).toEqual([]);
    expect(risky.status).toBe("warning");
    expect(risky.warnings).toContain("resolution_time_mismatch");
  });

  it("serves latest local JSON report without external calls", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-report-"));
    writeFileSync(
      join(reportDir, "cross-venue-arb-2026-06-02.json"),
      JSON.stringify(makeReportData({ opportunities: 2 })),
      "utf8",
    );
    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
    });

    try {
      await once(server, "listening");
      const response = await fetch(`${serverUrl(server)}/api/latest`);
      const json = (await response.json()) as CrossVenueReportData;

      expect(response.status).toBe(200);
      expect(json.summary.opportunities).toBe(2);
    } finally {
      server.close();
    }
  });

  it("serves persistent live feed JSON without external calls", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-live-feed-"));
    const liveFeedPath = join(reportDir, "cross-venue-live-feed.json");
    writeFileSync(
      liveFeedPath,
      JSON.stringify({
        version: 1,
        generatedAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:01:00.000Z",
        lastRunAt: "2026-06-02T00:01:00.000Z",
        lastReportDate: "2026-06-02",
        summary: {
          activeOpportunities: 1,
          activePriceSpreads: 0,
          inactiveEntries: 0,
          totalEntries: 1,
        },
        entries: [
          {
            signature: "opportunity|KXTEST|poly-test|kalshi|polymarket",
            kind: "opportunity",
            active: true,
            firstSeenAt: "2026-06-02T00:00:00.000Z",
            lastSeenAt: "2026-06-02T00:01:00.000Z",
            seenCount: 2,
            pairId: "KXTEST|poly-test",
            title: "Will test happen?",
            outcomeLabel: "YES",
          },
        ],
      }),
      "utf8",
    );
    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      liveFeedPath,
    });

    try {
      await once(server, "listening");
      const response = await fetch(`${serverUrl(server)}/api/live-feed`);
      const json = (await response.json()) as {
        summary: { activeOpportunities: number };
        entries: Array<Record<string, unknown>>;
      };

      expect(response.status).toBe(200);
      expect(json.summary.activeOpportunities).toBe(1);
      expect(json.entries[0]?.pairId).toBe("KXTEST|poly-test");
      expect(JSON.stringify(json)).not.toMatch(/private[_-]?key|seed phrase/i);
    } finally {
      server.close();
    }
  });

  it("runs injected dry-run scan through /api/scan", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-scan-"));
    const jsonPath = join(reportDir, "cross-venue-arb-2026-06-02.json");
    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      scan: async (options) => {
        expect(options.dryRun).toBe(true);
        expect(options.quiet).toBe(true);
        expect(options.gammaSearchLimit).toBe(7);
        expect(options.gammaSearchQueries).toEqual(["inflation", "bitcoin"]);
        expect(options.kalshiEventTickers).toEqual(["KXELONMARS-99"]);
        expect(options.kalshiSeriesTickers).toEqual(["KXBTC", "KXETH"]);
        expect(options.liveFeedPath).toBe(join(reportDir, "cross-venue-live-feed.json"));
        writeFileSync(
          jsonPath,
          JSON.stringify(makeReportData({ opportunities: 1 })),
          "utf8",
        );

        return { jsonPath };
      },
    });

    try {
      await once(server, "listening");
      const response = await fetch(
        `${serverUrl(server)}/api/scan?kalshiSeries=KXBTC,KXETH&kalshiEvents=KXELONMARS-99&gammaSearch=inflation,bitcoin&gammaSearchLimit=7`,
        { method: "POST" },
      );
      const json = (await response.json()) as CrossVenueReportData;

      expect(response.status).toBe(200);
      expect(json.summary.opportunities).toBe(1);
    } finally {
      server.close();
    }
  });

  it("passes configured-pair scan mode through /api/scan", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-configured-scan-"));
    const jsonPath = join(reportDir, "cross-venue-arb-2026-06-02.json");
    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      scan: async (options) => {
        expect(options.autoDiscover).toBe(false);
        writeFileSync(
          jsonPath,
          JSON.stringify(makeReportData({ opportunities: 0 })),
          "utf8",
        );

        return { jsonPath };
      },
    });

    try {
      await once(server, "listening");
      const response = await fetch(
        `${serverUrl(server)}/api/scan?autoDiscover=false`,
        { method: "POST" },
      );
      const json = (await response.json()) as CrossVenueReportData;

      expect(response.status).toBe(200);
      expect(json.summary.opportunities).toBe(0);
    } finally {
      server.close();
    }
  });

  it("passes only ready configured pairs through /api/scan-ready", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-ready-scan-"));
    const pairsPath = join(reportDir, "crossVenuePairs.json");
    const jsonPath = join(reportDir, "cross-venue-arb-2026-06-02.json");

    writeFileSync(
      pairsPath,
      JSON.stringify(
        {
          pairs: [
            {
              id: "KXREADY|ready-market",
              title: "Ready market",
              outcomeLabel: "YES",
              expectedResolutionAt: Date.UTC(2026, 5, 30),
              kalshi: { ticker: "KXREADY" },
              polymarket: {
                slug: "ready-market",
                yesTokenId: "yes-ready",
                noTokenId: "no-ready",
              },
            },
            {
              id: "KXREVIEW|unrelated-market",
              title: "Needs manual review",
              outcomeLabel: "YES",
              expectedResolutionAt: null,
              kalshi: { ticker: "KXREVIEW" },
              polymarket: {
                slug: "unrelated-market",
                yesTokenId: "yes-review",
                noTokenId: "no-review",
              },
            },
            {
              id: "KXPAUSED|paused-market",
              title: "Paused market",
              outcomeLabel: "YES",
              enabled: false,
              expectedResolutionAt: Date.UTC(2026, 5, 30),
              kalshi: { ticker: "KXPAUSED" },
              polymarket: {
                slug: "paused-market",
                yesTokenId: "yes-paused",
                noTokenId: "no-paused",
              },
            },
            {
              id: "KXDUPA|duplicate-market",
              title: "Duplicate market",
              outcomeLabel: "YES",
              expectedResolutionAt: Date.UTC(2026, 5, 30),
              kalshi: { ticker: "KXDUPA" },
              polymarket: {
                slug: "duplicate-market",
                yesTokenId: "yes-dupa",
                noTokenId: "no-dupa",
              },
            },
            {
              id: "KXDUPB|duplicate-market",
              title: "Duplicate market",
              outcomeLabel: "YES",
              expectedResolutionAt: Date.UTC(2026, 5, 30),
              kalshi: { ticker: "KXDUPB" },
              polymarket: {
                slug: "duplicate-market",
                yesTokenId: "yes-dupb",
                noTokenId: "no-dupb",
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      pairsPath,
      scan: async (options) => {
        expect(options.autoDiscover).toBe(false);
        expect(options.pairs?.map((pair) => pair.id)).toEqual([
          "KXREADY|ready-market",
        ]);
        writeFileSync(
          jsonPath,
          JSON.stringify(makeReportData({ opportunities: 0 })),
          "utf8",
        );

        return { jsonPath };
      },
    });

    try {
      await once(server, "listening");
      const response = await fetch(`${serverUrl(server)}/api/scan-ready`, {
        method: "POST",
      });
      const json = (await response.json()) as CrossVenueReportData;

      expect(response.status).toBe(200);
      expect(json.summary.opportunities).toBe(0);
    } finally {
      server.close();
    }
  });

  it("passes only selected configured pairs through /api/scan-selected", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-selected-scan-"));
    const pairsPath = join(reportDir, "crossVenuePairs.json");
    const jsonPath = join(reportDir, "cross-venue-arb-2026-06-02.json");

    writeFileSync(
      pairsPath,
      JSON.stringify(
        {
          pairs: [
            {
              id: "KXONE|market-one",
              title: "Market one",
              outcomeLabel: "YES",
              expectedResolutionAt: Date.UTC(2026, 5, 30),
              kalshi: { ticker: "KXONE" },
              polymarket: {
                slug: "market-one",
                yesTokenId: "yes-one",
                noTokenId: "no-one",
              },
            },
            {
              id: "KXTWO|market-two",
              title: "Market two",
              outcomeLabel: "YES",
              expectedResolutionAt: Date.UTC(2026, 5, 30),
              kalshi: { ticker: "KXTWO" },
              polymarket: {
                slug: "market-two",
                yesTokenId: "yes-two",
                noTokenId: "no-two",
              },
            },
            {
              id: "KXTHREE|market-three",
              title: "Market three",
              outcomeLabel: "YES",
              expectedResolutionAt: Date.UTC(2026, 5, 30),
              kalshi: { ticker: "KXTHREE" },
              polymarket: {
                slug: "market-three",
                yesTokenId: "yes-three",
                noTokenId: "no-three",
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      pairsPath,
      scan: async (options) => {
        expect(options.autoDiscover).toBe(false);
        expect(options.pairs?.map((pair) => pair.id)).toEqual([
          "KXONE|market-one",
          "KXTHREE|market-three",
        ]);
        writeFileSync(
          jsonPath,
          JSON.stringify(makeReportData({ opportunities: 0 })),
          "utf8",
        );

        return { jsonPath };
      },
    });

    try {
      await once(server, "listening");
      const params = new URLSearchParams();
      params.append("id", "KXONE|market-one");
      params.append("id", "KXTHREE|market-three");
      params.append("id", "missing-pair");
      const response = await fetch(
        `${serverUrl(server)}/api/scan-selected?${params.toString()}`,
        { method: "POST" },
      );
      const json = (await response.json()) as CrossVenueReportData;

      expect(response.status).toBe(200);
      expect(json.summary.opportunities).toBe(0);
    } finally {
      server.close();
    }
  });

  it("passes dashboard edge and fee parameters through /api/scan", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-param-scan-"));
    const jsonPath = join(reportDir, "cross-venue-arb-2026-06-02.json");
    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      scan: async (options) => {
        expect(options.minNetCents).toBe(1.2);
        expect(options.feesCents).toEqual({
          kalshi: 0.3,
          polymarket: 0.4,
        });
        writeFileSync(
          jsonPath,
          JSON.stringify(makeReportData({ opportunities: 0 })),
          "utf8",
        );

        return { jsonPath };
      },
    });

    try {
      await once(server, "listening");
      const response = await fetch(
        `${serverUrl(server)}/api/scan?minNetCents=1.2&kalshiFeeCents=0.3&polymarketFeeCents=0.4`,
        { method: "POST" },
      );

      expect(response.status).toBe(200);
    } finally {
      server.close();
    }
  });

  it("previews a selected pair without writing local config", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-preview-"));
    const server = startCrossVenueDashboardServer({
      pairsPath: join(reportDir, "crossVenuePairs.json"),
      port: 0,
      reportDir,
      previewPairScan: async (pairs, options) => {
        expect(pairs).toHaveLength(1);
        expect(pairs[0]).toMatchObject({
          id: "KXPREVIEW|poly-preview",
          kalshi: { ticker: "KXPREVIEW" },
          polymarket: {
            slug: "poly-preview",
            yesTokenId: "yes-preview",
            noTokenId: "no-preview",
          },
        });
        expect(options?.minNetCents).toBe(0.7);
        expect(options?.feesCents).toEqual({
          kalshi: 0.1,
          polymarket: 0.2,
        });

        return {
          opportunities: [],
          orderbookReads: emptyCrossVenueOrderbookReadMetrics(),
          priceSpreads: [
            {
              pairId: "KXPREVIEW|poly-preview",
              title: "Preview pair",
              outcomeLabel: "YES",
              side: "YES",
              cheapVenue: "kalshi",
              richVenue: "polymarket",
              cheapPrice: 0.4,
              richPrice: 0.45,
              diffCents: 5,
              reason: "same_outcome_price_difference",
            },
          ],
          rejected: [],
        noEdge: [],
        };
      },
    });

    try {
      await once(server, "listening");
      const response = await fetch(
        `${serverUrl(server)}/api/preview-pair?minNetCents=0.7&kalshiFeeCents=0.1&polymarketFeeCents=0.2`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pair: {
              id: "KXPREVIEW|poly-preview",
              title: "Preview pair",
              outcomeLabel: "YES",
              kalshi: { ticker: "KXPREVIEW" },
              polymarket: {
                slug: "poly-preview",
                yesTokenId: "yes-preview",
                noTokenId: "no-preview",
              },
            },
          }),
        },
      );
      const json = (await response.json()) as {
        result: { priceSpreads: unknown[] };
      };
      const pairsResponse = await fetch(`${serverUrl(server)}/api/pairs`);
      const pairsJson = (await pairsResponse.json()) as { pairs: unknown[] };

      expect(response.status).toBe(200);
      expect(json.result.priceSpreads).toHaveLength(1);
      expect(pairsJson.pairs).toHaveLength(0);
      expect(JSON.stringify(json)).not.toMatch(/private[_-]?key|seed phrase/i);
    } finally {
      server.close();
    }
  });

  it("serves read-only market search with injected mocks", async () => {
    const server = startCrossVenueDashboardServer({
      port: 0,
      fetchKalshiMarkets: async () => [
        {
          ticker: "KXTEST",
          eventTicker: "KXTESTEVENT",
          title: "Will the test market happen?",
          subtitle: "Test subtitle",
          yesSubTitle: "YES",
          noSubTitle: "NO",
          expectedExpirationTime: null,
          closeTime: Date.UTC(2026, 5, 30),
          yesAsk: 0.45,
          noAsk: 0.56,
          liquidityDollars: 1000,
          volume24h: 25,
        },
        {
          ticker: "KXOTHER",
          eventTicker: "KXOTHEREVENT",
          title: "Unrelated market",
          subtitle: "",
          yesSubTitle: "YES",
          noSubTitle: "NO",
          expectedExpirationTime: null,
          closeTime: null,
          yesAsk: null,
          noAsk: null,
          liquidityDollars: null,
          volume24h: null,
        },
      ],
      fetchGammaEvents: async () => [
        {
          markets: [
            {
              id: "1",
              slug: "will-the-test-market-happen",
              question: "Will the test market happen?",
              clobTokenIds: JSON.stringify(["yes-token", "no-token"]),
              outcomes: JSON.stringify(["Yes", "No"]),
              outcomePrices: JSON.stringify(["0.45", "0.55"]),
            },
          ],
        },
      ],
    });

    try {
      await once(server, "listening");
      const response = await fetch(`${serverUrl(server)}/api/search?q=test`);
      const json = (await response.json()) as {
        kalshi: Array<Record<string, unknown>>;
        polymarket: Array<Record<string, unknown>>;
      };

      expect(response.status).toBe(200);
      expect(json.kalshi).toHaveLength(1);
      expect(json.kalshi[0]).toMatchObject({
        ticker: "KXTEST",
        yesAsk: 0.45,
        noAsk: 0.56,
      });
      expect(json.polymarket).toHaveLength(1);
      expect(json.polymarket[0]).toMatchObject({
        slug: "will-the-test-market-happen",
        yesTokenId: "yes-token",
        noTokenId: "no-token",
      });
      expect(JSON.stringify(json)).not.toMatch(/private[_-]?key|seed phrase/i);
    } finally {
      server.close();
    }
  });

  it("discovers review candidates and saves a verified local pair", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-discovery-review-"));
    const pairsPath = join(reportDir, "crossVenuePairs.json");
    const discoveryReviewPath = join(reportDir, "crossVenueDiscoveryReview.json");
    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      pairsPath,
      discoveryReviewPath,
      fetchKalshiMarkets: async (options) => {
        expect(options?.eventTickers).toEqual(["KXFEDCUT"]);
        expect(options?.status).toBe("open");
        return [makeDashboardKalshiMarket()];
      },
      fetchGammaEvents: async (limit) => {
        expect(limit).toBe(5);
        return [makeDashboardGammaEvent()];
      },
    });

    try {
      await once(server, "listening");
      const discoverResponse = await fetch(
        `${serverUrl(server)}/api/discovery-review/discover?gammaLimit=5&kalshiEvents=KXFEDCUT&minMatchScore=0.5`,
        { method: "POST" },
      );
      const discovered = (await discoverResponse.json()) as {
        discoveryResult: { kalshiMarketCount: number; pairs: unknown[] };
        review: {
          summary: { total: number; new: number };
          entries: Array<{
            id: string;
            status: string;
            candidate: Record<string, unknown>;
          }>;
        };
      };

      expect(discoverResponse.status).toBe(200);
      expect(discovered.discoveryResult.kalshiMarketCount).toBe(1);
      expect(discovered.discoveryResult.pairs).toHaveLength(1);
      expect(discovered.review.summary).toMatchObject({ total: 1, new: 1 });
      expect(discovered.review.entries[0]).toMatchObject({
        status: "new",
        candidate: {
          kalshiTicker: "KXFEDCUT-26JUN",
          polymarketSlug: "fed-cut-rates-in-june",
          yesTokenId: "poly-yes",
          noTokenId: "poly-no",
          canonicalEventId: "event:will-the-fed-cut-rates-in-june-2026-06-30",
          canonicalOutcomeKey: "yes",
          status: "candidate",
        },
      });

      const id = discovered.review.entries[0].id;
      const patchResponse = await fetch(
        `${serverUrl(server)}/api/discovery-review?id=${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note: "Manual text/time check passed.", status: "reviewed" }),
        },
      );
      const patched = (await patchResponse.json()) as {
        summary: { reviewed: number };
        entries: Array<Record<string, unknown>>;
      };

      expect(patchResponse.status).toBe(200);
      expect(patched.summary.reviewed).toBe(1);
      expect(patched.entries[0]).toMatchObject({
        id,
        note: "Manual text/time check passed.",
        status: "reviewed",
      });

      const saveResponse = await fetch(
        `${serverUrl(server)}/api/discovery-review/save?id=${encodeURIComponent(id)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ priority: true, verified: true }),
        },
      );
      const saved = (await saveResponse.json()) as {
        pairs: { pairs: Array<Record<string, unknown>> };
        review: { summary: { saved: number }; entries: Array<Record<string, unknown>> };
      };

      expect(saveResponse.status).toBe(200);
      expect(saved.pairs.pairs).toHaveLength(1);
      expect(saved.pairs.pairs[0]).toMatchObject({
        id: "KXFEDCUT-26JUN|fed-cut-rates-in-june",
        enabled: true,
        priority: true,
        verified: true,
        kalshi: { ticker: "KXFEDCUT-26JUN" },
        polymarket: {
          slug: "fed-cut-rates-in-june",
          yesTokenId: "poly-yes",
          noTokenId: "poly-no",
        },
        canonicalEvent: {
          id: "event:will-the-fed-cut-rates-in-june-2026-06-30",
        },
        canonicalOutcome: {
          outcomeKey: "yes",
        },
      });
      expect(saved.review.summary.saved).toBe(1);
      expect(saved.review.entries[0]).toMatchObject({
        id,
        savedPairId: "KXFEDCUT-26JUN|fed-cut-rates-in-june",
        status: "saved",
      });
      expect(JSON.stringify(saved)).not.toMatch(/private[_-]?key|seed phrase/i);
    } finally {
      server.close();
    }
  });

  it("writes and reads local configured pairs without secrets", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-pairs-report-"));
    const pairsPath = join(reportDir, "crossVenuePairs.json");
    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      pairsPath,
    });

    try {
      await once(server, "listening");
      const response = await fetch(`${serverUrl(server)}/api/pairs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pair: {
            id: "KXTEST|poly-test",
            title: "Will test happen?",
            outcomeLabel: "YES",
            expectedResolutionAt: Date.UTC(2026, 5, 30),
            kalshi: { ticker: "KXTEST" },
            polymarket: {
              slug: "poly-test",
              yesTokenId: "yes-token",
              noTokenId: "no-token",
            },
          },
        }),
      });
      const written = (await response.json()) as { pairs: unknown[] };
      const readResponse = await fetch(`${serverUrl(server)}/api/pairs`);
      const read = (await readResponse.json()) as { pairs: Array<Record<string, unknown>> };

      expect(response.status).toBe(200);
      expect(written.pairs).toHaveLength(1);
      expect(read.pairs[0]).toMatchObject({
        id: "KXTEST|poly-test",
        kalshi: { ticker: "KXTEST" },
        polymarket: {
          slug: "poly-test",
          yesTokenId: "yes-token",
          noTokenId: "no-token",
        },
      });
      expect(JSON.stringify(read)).not.toMatch(/private[_-]?key|seed phrase/i);
    } finally {
      server.close();
    }
  });

  it("subscribes configured pair identifiers to orderbook ingestors", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-orderbook-cache-"));
    const pairsPath = join(reportDir, "crossVenuePairs.json");
    const report = makeReportData({ opportunities: 0 });
    report.orderbookReads.total.reads = 3;
    report.orderbookReads.total.cacheHits = 2;
    report.orderbookReads.total.websocketHits = 2;
    report.orderbookReads.total.restFetches = 1;
    writeFileSync(
      join(reportDir, "cross-venue-arb-2026-06-08.json"),
      JSON.stringify(report),
      "utf8",
    );
    const subscribedPolymarket: string[][] = [];
    const subscribedKalshi: string[][] = [];
    let polymarketStopped = false;
    let kalshiStopped = false;
    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      pairsPath,
      kalshiOrderbookIngestor: {
        start: () => undefined,
        stop: () => {
          kalshiStopped = true;
        },
        subscribe: (marketTickers: string[]) => {
          subscribedKalshi.push(marketTickers);
        },
        status: () => ({
          connected: true,
          marketTickers: subscribedKalshi.flat(),
          stopped: kalshiStopped,
          subscriptionId: 1,
        }),
      },
      polymarketOrderbookIngestor: {
        start: () => undefined,
        stop: () => {
          polymarketStopped = true;
        },
        subscribe: (assetIds: string[]) => {
          subscribedPolymarket.push(assetIds);
        },
        status: () => ({
          assetIds: subscribedPolymarket.flat(),
          connected: true,
          stopped: polymarketStopped,
        }),
      },
    });

    try {
      await once(server, "listening");
      const saveResponse = await fetch(`${serverUrl(server)}/api/pairs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pair: {
            id: "KXWS|poly-ws",
            title: "Will websocket cache work?",
            outcomeLabel: "YES",
            kalshi: { ticker: "KXWS" },
            polymarket: {
              slug: "poly-ws",
              yesTokenId: "yes-ws",
              noTokenId: "no-ws",
            },
          },
        }),
      });
      const statusResponse = await fetch(`${serverUrl(server)}/api/orderbook-cache`);
      const status = (await statusResponse.json()) as {
        latestScanOrderbookReads: { total: { reads: number; cacheHits: number; restFetches: number } };
        kalshiWebSocket: { marketTickers: string[] };
        polymarketWebSocket: { assetIds: string[] };
      };

      expect(saveResponse.status).toBe(200);
      expect(subscribedKalshi).toContainEqual(["KXWS"]);
      expect(subscribedPolymarket).toContainEqual(["yes-ws", "no-ws"]);
      expect(status.latestScanOrderbookReads.total).toMatchObject({
        reads: 3,
        cacheHits: 2,
        restFetches: 1,
      });
      expect(status.kalshiWebSocket.marketTickers).toEqual(["KXWS"]);
      expect(status.polymarketWebSocket.assetIds).toEqual(["yes-ws", "no-ws"]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    expect(kalshiStopped).toBe(true);
    expect(polymarketStopped).toBe(true);
  });

  it("removes local configured pairs by id", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-pairs-delete-"));
    const pairsPath = join(reportDir, "crossVenuePairs.json");
    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      pairsPath,
    });

    try {
      await once(server, "listening");
      await fetch(`${serverUrl(server)}/api/pairs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pair: {
            id: "KXDELETE|poly-delete",
            title: "Will delete happen?",
            outcomeLabel: "YES",
            kalshi: { ticker: "KXDELETE" },
            polymarket: {
              slug: "poly-delete",
              yesTokenId: "yes-delete",
              noTokenId: "no-delete",
            },
          },
        }),
      });

      const response = await fetch(
        `${serverUrl(server)}/api/pairs?id=${encodeURIComponent("KXDELETE|poly-delete")}`,
        { method: "DELETE" },
      );
      const json = (await response.json()) as { pairs: unknown[] };

      expect(response.status).toBe(200);
      expect(json.pairs).toHaveLength(0);
    } finally {
      server.close();
    }
  });

  it("pauses and resumes local configured pairs without secrets", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-pairs-toggle-"));
    const pairsPath = join(reportDir, "crossVenuePairs.json");
    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      pairsPath,
    });

    try {
      await once(server, "listening");
      await fetch(`${serverUrl(server)}/api/pairs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pair: {
            id: "KXTOGGLE|poly-toggle",
            title: "Will toggle happen?",
            outcomeLabel: "YES",
            kalshi: { ticker: "KXTOGGLE" },
            polymarket: {
              slug: "poly-toggle",
              yesTokenId: "yes-toggle",
              noTokenId: "no-toggle",
            },
          },
        }),
      });

      const pauseResponse = await fetch(
        `${serverUrl(server)}/api/pairs?id=${encodeURIComponent("KXTOGGLE|poly-toggle")}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        },
      );
      const paused = (await pauseResponse.json()) as {
        pairs: Array<Record<string, unknown>>;
      };
      const resumeResponse = await fetch(
        `${serverUrl(server)}/api/pairs?id=${encodeURIComponent("KXTOGGLE|poly-toggle")}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: true }),
        },
      );
      const resumed = (await resumeResponse.json()) as {
        pairs: Array<Record<string, unknown>>;
      };

      expect(pauseResponse.status).toBe(200);
      expect(paused.pairs[0]?.enabled).toBe(false);
      expect(resumeResponse.status).toBe(200);
      expect(resumed.pairs[0]?.enabled).toBe(true);
      expect(JSON.stringify(resumed)).not.toMatch(/private[_-]?key|seed phrase/i);
    } finally {
      server.close();
    }
  });

  it("stars and unstars local configured pairs without secrets", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-pairs-priority-"));
    const pairsPath = join(reportDir, "crossVenuePairs.json");
    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      pairsPath,
    });

    try {
      await once(server, "listening");
      await fetch(`${serverUrl(server)}/api/pairs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pair: {
            id: "KXPRIORITY|poly-priority",
            title: "Will priority happen?",
            outcomeLabel: "YES",
            kalshi: { ticker: "KXPRIORITY" },
            polymarket: {
              slug: "poly-priority",
              yesTokenId: "yes-priority",
              noTokenId: "no-priority",
            },
          },
        }),
      });

      const starResponse = await fetch(
        `${serverUrl(server)}/api/pairs/priority?id=${encodeURIComponent("KXPRIORITY|poly-priority")}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ priority: true }),
        },
      );
      const starred = (await starResponse.json()) as {
        pairs: Array<Record<string, unknown>>;
      };
      const unstarResponse = await fetch(
        `${serverUrl(server)}/api/pairs/priority?id=${encodeURIComponent("KXPRIORITY|poly-priority")}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ priority: false }),
        },
      );
      const unstarred = (await unstarResponse.json()) as {
        pairs: Array<Record<string, unknown>>;
      };

      expect(starResponse.status).toBe(200);
      expect(starred.pairs[0]?.priority).toBe(true);
      expect(unstarResponse.status).toBe(200);
      expect(unstarred.pairs[0]?.priority).toBe(false);
      expect(JSON.stringify(unstarred)).not.toMatch(/private[_-]?key|seed phrase/i);
    } finally {
      server.close();
    }
  });

  it("verifies and unverifies local configured pairs without secrets", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-pairs-verified-"));
    const pairsPath = join(reportDir, "crossVenuePairs.json");
    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      pairsPath,
    });

    try {
      await once(server, "listening");
      await fetch(`${serverUrl(server)}/api/pairs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pair: {
            id: "KXVERIFIED|poly-verified",
            title: "Will verified happen?",
            outcomeLabel: "YES",
            kalshi: { ticker: "KXVERIFIED" },
            polymarket: {
              slug: "poly-verified",
              yesTokenId: "yes-verified",
              noTokenId: "no-verified",
            },
          },
        }),
      });

      const verifyResponse = await fetch(
        `${serverUrl(server)}/api/pairs/verified?id=${encodeURIComponent("KXVERIFIED|poly-verified")}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ verified: true }),
        },
      );
      const verified = (await verifyResponse.json()) as {
        pairs: Array<Record<string, unknown>>;
      };
      const unverifyResponse = await fetch(
        `${serverUrl(server)}/api/pairs/verified?id=${encodeURIComponent("KXVERIFIED|poly-verified")}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ verified: false }),
        },
      );
      const unverified = (await unverifyResponse.json()) as {
        pairs: Array<Record<string, unknown>>;
      };

      expect(verifyResponse.status).toBe(200);
      expect(verified.pairs[0]?.verified).toBe(true);
      expect(unverifyResponse.status).toBe(200);
      expect(unverified.pairs[0]?.verified).toBe(false);
      expect(JSON.stringify(unverified)).not.toMatch(/private[_-]?key|seed phrase/i);
    } finally {
      server.close();
    }
  });

  it("writes and clears local configured pair notes without secrets", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-pairs-note-"));
    const pairsPath = join(reportDir, "crossVenuePairs.json");
    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      pairsPath,
    });

    try {
      await once(server, "listening");
      await fetch(`${serverUrl(server)}/api/pairs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pair: {
            id: "KXNOTE|poly-note",
            title: "Will note happen?",
            outcomeLabel: "YES",
            kalshi: { ticker: "KXNOTE" },
            polymarket: {
              slug: "poly-note",
              yesTokenId: "yes-note",
              noTokenId: "no-note",
            },
          },
        }),
      });

      const noteResponse = await fetch(
        `${serverUrl(server)}/api/pairs/note?id=${encodeURIComponent("KXNOTE|poly-note")}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note: "watch mapping quality" }),
        },
      );
      const noted = (await noteResponse.json()) as {
        pairs: Array<Record<string, unknown>>;
      };
      const clearResponse = await fetch(
        `${serverUrl(server)}/api/pairs/note?id=${encodeURIComponent("KXNOTE|poly-note")}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note: "" }),
        },
      );
      const cleared = (await clearResponse.json()) as {
        pairs: Array<Record<string, unknown>>;
      };

      expect(noteResponse.status).toBe(200);
      expect(noted.pairs[0]?.note).toBe("watch mapping quality");
      expect(clearResponse.status).toBe(200);
      expect(cleared.pairs[0]?.note).toBeUndefined();
      expect(JSON.stringify(cleared)).not.toMatch(/private[_-]?key|seed phrase/i);
    } finally {
      server.close();
    }
  });

  it("bulk stars local configured pairs without secrets", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-pairs-priority-bulk-"));
    const pairsPath = join(reportDir, "crossVenuePairs.json");
    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      pairsPath,
    });

    try {
      await once(server, "listening");
      for (const id of ["KXPRIORITY1|poly-priority-1", "KXPRIORITY2|poly-priority-2"]) {
        await fetch(`${serverUrl(server)}/api/pairs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pair: {
              id,
              title: id,
              outcomeLabel: "YES",
              kalshi: { ticker: id.split("|")[0] },
              polymarket: {
                slug: id.split("|")[1],
                yesTokenId: `${id}-yes`,
                noTokenId: `${id}-no`,
              },
            },
          }),
        });
      }

      const response = await fetch(`${serverUrl(server)}/api/pairs/priority/bulk`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          priority: true,
          ids: ["KXPRIORITY1|poly-priority-1", "KXPRIORITY2|poly-priority-2"],
        }),
      });
      const json = (await response.json()) as {
        pairs: Array<Record<string, unknown>>;
      };

      expect(response.status).toBe(200);
      expect(json.pairs.map((pair) => pair.priority)).toEqual([true, true]);
      expect(JSON.stringify(json)).not.toMatch(/private[_-]?key|seed phrase/i);
    } finally {
      server.close();
    }
  });

  it("bulk verifies local configured pairs without secrets", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-pairs-verified-bulk-"));
    const pairsPath = join(reportDir, "crossVenuePairs.json");
    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      pairsPath,
    });

    try {
      await once(server, "listening");
      for (const id of ["KXVERIFIED1|poly-verified-1", "KXVERIFIED2|poly-verified-2"]) {
        await fetch(`${serverUrl(server)}/api/pairs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pair: {
              id,
              title: id,
              outcomeLabel: "YES",
              kalshi: { ticker: id.split("|")[0] },
              polymarket: {
                slug: id.split("|")[1],
                yesTokenId: `${id}-yes`,
                noTokenId: `${id}-no`,
              },
            },
          }),
        });
      }

      const response = await fetch(`${serverUrl(server)}/api/pairs/verified/bulk`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          verified: true,
          ids: ["KXVERIFIED1|poly-verified-1", "KXVERIFIED2|poly-verified-2"],
        }),
      });
      const json = (await response.json()) as {
        pairs: Array<Record<string, unknown>>;
      };

      expect(response.status).toBe(200);
      expect(json.pairs.map((pair) => pair.verified)).toEqual([true, true]);
      expect(JSON.stringify(json)).not.toMatch(/private[_-]?key|seed phrase/i);
    } finally {
      server.close();
    }
  });

  it("bulk pauses local configured pairs without secrets", async () => {
    const reportDir = mkdtempSync(join(tmpdir(), "crossvenue-pairs-bulk-"));
    const pairsPath = join(reportDir, "crossVenuePairs.json");
    const server = startCrossVenueDashboardServer({
      port: 0,
      reportDir,
      pairsPath,
    });

    try {
      await once(server, "listening");
      for (const id of ["KXBULK1|poly-bulk-1", "KXBULK2|poly-bulk-2"]) {
        await fetch(`${serverUrl(server)}/api/pairs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pair: {
              id,
              title: id,
              outcomeLabel: "YES",
              kalshi: { ticker: id.split("|")[0] },
              polymarket: {
                slug: id.split("|")[1],
                yesTokenId: `${id}-yes`,
                noTokenId: `${id}-no`,
              },
            },
          }),
        });
      }

      const response = await fetch(`${serverUrl(server)}/api/pairs/bulk`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: false,
          ids: ["KXBULK1|poly-bulk-1", "KXBULK2|poly-bulk-2"],
        }),
      });
      const json = (await response.json()) as {
        pairs: Array<Record<string, unknown>>;
      };

      expect(response.status).toBe(200);
      expect(json.pairs.map((pair) => pair.enabled)).toEqual([false, false]);
      expect(JSON.stringify(json)).not.toMatch(/private[_-]?key|seed phrase/i);
    } finally {
      server.close();
    }
  });
});

function makeReportData(overrides: { opportunities: number }): CrossVenueReportData {
  return {
    reportDate: "2026-06-02",
    generatedAt: "2026-06-02T00:00:00.000Z",
    configPath: "config/crossVenuePairs.json",
    autoDiscover: true,
    dryRun: true,
    minNetCents: 0.5,
    feesCents: {},
    summary: {
      pairsScanned: 0,
      opportunities: overrides.opportunities,
      priceSpreads: 0,
      rejectedPairs: 0,
    },
    discoveryResult: null,
    orderbookReads: emptyCrossVenueOrderbookReadMetrics(),
    pairs: [],
    opportunities: [],
    priceSpreads: [],
    rejectedPairs: [],
  };
}

function makeDashboardGammaEvent(): GammaRawEvent {
  return {
    endDate: "2026-06-30T23:59:59Z",
    markets: [
      {
        id: "poly-market-id",
        slug: "fed-cut-rates-in-june",
        question: "Will the Fed cut rates in June?",
        clobTokenIds: '["poly-yes","poly-no"]',
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.42","0.58"]',
      },
    ],
  };
}

function makeDashboardKalshiMarket(): KalshiMarket {
  return {
    ticker: "KXFEDCUT-26JUN",
    eventTicker: "KXFEDCUT",
    title: "Will the Fed cut rates in June?",
    subtitle: "Federal Reserve rate decision",
    yesSubTitle: "Yes",
    noSubTitle: "No",
    expectedExpirationTime: Date.UTC(2026, 5, 30, 23, 59, 59),
    closeTime: Date.UTC(2026, 5, 30, 23, 59, 59),
    yesAsk: 0.42,
    noAsk: 0.58,
    liquidityDollars: 1000,
    volume24h: 100,
  };
}

function serverUrl(server: ReturnType<typeof startCrossVenueDashboardServer>): string {
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address.");
  }

  return `http://127.0.0.1:${address.port}`;
}
