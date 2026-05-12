import { Activity, RefreshCw } from "lucide-react";

type Tab = "overview" | "requests" | "errors" | "models" | "costs";

export type RangeKey = "all" | "90d" | "30d" | "7d" | "24h";

export const RANGE_MS: Record<RangeKey, number | null> = {
	all: null,
	"90d": 90 * 86400000,
	"30d": 30 * 86400000,
	"7d": 7 * 86400000,
	"24h": 24 * 3600000,
};

interface HeaderProps {
	activeTab: Tab;
	onTabChange: (tab: Tab) => void;
	onSync: () => void;
	syncing: boolean;
	activeRange: RangeKey;
	onRangeChange: (range: RangeKey) => void;
}

const tabs: Tab[] = ["overview", "requests", "errors", "models", "costs"];
const ranges: RangeKey[] = ["all", "90d", "30d", "7d", "24h"];

export function Header({ activeTab, onTabChange, onSync, syncing, activeRange, onRangeChange }: HeaderProps) {
	return (
		<header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-8 border-b border-[var(--border-subtle)]">
			<div className="flex items-center gap-3">
				<div className="w-10 h-10 rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--accent-pink)] to-[var(--accent-cyan)] flex items-center justify-center shadow-lg">
					<Activity className="w-5 h-5 text-white" />
				</div>
				<div>
					<h1 className="text-xl font-semibold text-[var(--text-primary)]">AI Usage</h1>
					<p className="text-sm text-[var(--text-muted)]">Statistics & Analytics</p>
				</div>
			</div>

			<div className="flex items-center gap-3 flex-wrap">
				<div className="flex bg-[var(--bg-surface)] rounded-[var(--radius-md)] p-1 border border-[var(--border-subtle)]">
					{ranges.map(r => (
						<button
							key={r}
							type="button"
							onClick={() => onRangeChange(r)}
							className={`tab-btn uppercase ${activeRange === r ? "active" : ""}`}
							title={r === "all" ? "All time" : `Last ${r}`}
						>
							{r}
						</button>
					))}
				</div>

				<div className="flex bg-[var(--bg-surface)] rounded-[var(--radius-md)] p-1 border border-[var(--border-subtle)]">
					{tabs.map(tab => (
						<button
							key={tab}
							type="button"
							onClick={() => onTabChange(tab)}
							className={`tab-btn capitalize ${activeTab === tab ? "active" : ""}`}
						>
							{tab}
						</button>
					))}
				</div>

				<button type="button" onClick={onSync} disabled={syncing} className="btn btn-primary">
					<RefreshCw size={16} className={syncing ? "spin" : ""} />
					{syncing ? "Syncing..." : "Sync"}
				</button>
			</div>
		</header>
	);
}
