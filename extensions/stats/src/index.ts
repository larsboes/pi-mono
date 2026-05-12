// Library entry for pi-stats. CLI lives in src/cli.ts. Extension entry is the
// top-level index.ts (registers /stats slash command).

export { getDashboardStats, getTotalMessageCount, syncAllSessions, getRecentRequests, getRecentErrors, getRequestDetails } from "./aggregator";
export { closeDb } from "./db";
export { startServer } from "./server";
export { parseSinceSpec } from "./cli";
export type {
	AggregatedStats, DashboardStats, FolderStats, MessageStats,
	ModelPerformancePoint, ModelStats, ModelTimeSeriesPoint, StatsSource, TimeSeriesPoint,
} from "./types";
