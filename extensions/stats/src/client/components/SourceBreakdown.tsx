import { useMemo } from "react";
import { MonitorSmartphone, Terminal } from "lucide-react";
import type { ModelStats, TimeSeriesPoint, CostTimeSeriesPoint } from "../types";

interface SourceBreakdownProps {
	byModel: ModelStats[];
	timeSeries: TimeSeriesPoint[];
	costSeries: CostTimeSeriesPoint[];
}

function fmtTokens(n: number): string {
	if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return `${n}`;
}

function fmtCost(n: number): string {
	if (n < 1) return `$${n.toFixed(3)}`;
	return `$${n.toFixed(2)}`;
}

/** SVG sparkline path from values */
function SparklineSVG({ values, color, height = 32, width = 120 }: { values: number[]; color: string; height?: number; width?: number }) {
	if (values.length < 2) return null;
	const max = Math.max(...values, 1);
	const min = Math.min(...values, 0);
	const range = max - min || 1;
	const step = width / (values.length - 1);

	const points = values.map((v, i) => {
		const x = i * step;
		const y = height - ((v - min) / range) * (height - 4) - 2;
		return `${x},${y}`;
	});

	const pathD = `M ${points.join(" L ")}`;
	const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

	return (
		<svg width={width} height={height} className="overflow-visible">
			<defs>
				<linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor={color} stopOpacity="0.3" />
					<stop offset="100%" stopColor={color} stopOpacity="0" />
				</linearGradient>
			</defs>
			<path d={areaD} fill={`url(#grad-${color.replace("#", "")})`} />
			<path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function TrendBadge({ current, previous }: { current: number; previous: number }) {
	if (previous === 0 && current === 0) return <span className="text-xs text-[var(--text-muted)]">—</span>;
	const pct = previous > 0 ? ((current - previous) / previous) * 100 : 100;
	const isUp = pct > 5;
	const isDown = pct < -5;
	const color = isDown ? "var(--accent-green,#4ade80)" : isUp ? "var(--accent-pink)" : "var(--text-muted)";
	const arrow = isUp ? "↑" : isDown ? "↓" : "→";
	return (
		<span className="text-xs font-medium" style={{ color }}>
			{arrow} {Math.abs(Math.round(pct))}%
		</span>
	);
}

export function SourceBreakdown({ byModel, timeSeries, costSeries }: SourceBreakdownProps) {
	const piModels = useMemo(() => byModel.filter((m) => m.source === "pi"), [byModel]);
	const ccModels = useMemo(() => byModel.filter((m) => m.source === "claude-code"), [byModel]);

	const piReqs = piModels.reduce((a, m) => a + m.totalRequests, 0);
	const ccReqs = ccModels.reduce((a, m) => a + m.totalRequests, 0);
	const piCost = piModels.reduce((a, m) => a + m.totalCost, 0);
	const ccCost = ccModels.reduce((a, m) => a + m.totalCost, 0);
	const piTokens = piModels.reduce((a, m) => a + m.totalInputTokens + m.totalOutputTokens, 0);
	const ccTokens = ccModels.reduce((a, m) => a + m.totalInputTokens + m.totalOutputTokens, 0);

	// Aggregate daily cost for sparkline
	const dailyCost = useMemo(() => {
		const buckets = new Map<number, number>();
		for (const p of costSeries) {
			buckets.set(p.timestamp, (buckets.get(p.timestamp) ?? 0) + p.cost);
		}
		return Array.from(buckets.entries())
			.sort((a, b) => a[0] - b[0])
			.map(([, cost]) => cost)
			.slice(-30);
	}, [costSeries]);

	// Aggregate hourly requests for sparkline
	const hourlyReqs = useMemo(() => {
		return timeSeries.slice(-24).map((p) => p.requests);
	}, [timeSeries]);

	// Trend: compare last 7 days vs previous 7 days
	const recentCost = dailyCost.slice(-7).reduce((a, b) => a + b, 0);
	const prevCost = dailyCost.slice(-14, -7).reduce((a, b) => a + b, 0);

	const totalReqs = piReqs + ccReqs;
	const piPct = totalReqs > 0 ? (piReqs / totalReqs) * 100 : 0;
	const ccPct = totalReqs > 0 ? (ccReqs / totalReqs) * 100 : 0;

	return (
		<div className="surface p-5">
			<h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">Source Breakdown</h3>

			{/* Progress bar */}
			<div className="flex h-2 rounded-full overflow-hidden bg-[var(--bg-elevated)] mb-4">
				<div
					className="transition-all duration-500"
					style={{ width: `${ccPct}%`, backgroundColor: "var(--accent-cyan)" }}
				/>
				<div
					className="transition-all duration-500"
					style={{ width: `${piPct}%`, backgroundColor: "var(--accent-violet)" }}
				/>
			</div>

			{/* Source rows */}
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
				<div className="flex items-start gap-3">
					<div className="p-2 rounded-[var(--radius-sm)]" style={{ backgroundColor: "rgba(6,182,212,0.1)" }}>
						<MonitorSmartphone size={18} style={{ color: "var(--accent-cyan)" }} />
					</div>
					<div>
						<p className="text-sm font-medium text-[var(--text-primary)]">Claude Code</p>
						<p className="text-xs text-[var(--text-muted)]">
							{ccReqs.toLocaleString()} reqs · {fmtTokens(ccTokens)} tok · {fmtCost(ccCost)}
						</p>
					</div>
				</div>
				<div className="flex items-start gap-3">
					<div className="p-2 rounded-[var(--radius-sm)]" style={{ backgroundColor: "rgba(139,92,246,0.1)" }}>
						<Terminal size={18} style={{ color: "var(--accent-violet)" }} />
					</div>
					<div>
						<p className="text-sm font-medium text-[var(--text-primary)]">pi</p>
						<p className="text-xs text-[var(--text-muted)]">
							{piReqs.toLocaleString()} reqs · {fmtTokens(piTokens)} tok · {fmtCost(piCost)}
						</p>
					</div>
				</div>
			</div>

			{/* Sparklines */}
			<div className="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--border-subtle)]">
				<div>
					<div className="flex items-center justify-between mb-1">
						<span className="text-xs text-[var(--text-muted)]">Daily Cost (30d)</span>
						<TrendBadge current={recentCost} previous={prevCost} />
					</div>
					<SparklineSVG values={dailyCost} color="var(--accent-pink)" width={140} />
				</div>
				<div>
					<div className="flex items-center justify-between mb-1">
						<span className="text-xs text-[var(--text-muted)]">Hourly Reqs (24h)</span>
					</div>
					<SparklineSVG values={hourlyReqs} color="var(--accent-cyan)" width={140} />
				</div>
			</div>
		</div>
	);
}
