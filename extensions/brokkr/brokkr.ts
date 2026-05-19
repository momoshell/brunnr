/**
 * Brokkr — TUI shell for the autoresearch skill-optimization workflow.
 *
 * Named after Brokkr, Eitri's brother in Norse myth. They worked the same
 * forge: Eitri shaped the metal, Brokkr worked the bellows to keep the heat
 * perfectly tempered. The metaphor maps cleanly — eitri builds Pi
 * components, brokkr refines them.
 *
 * Phase 1: skill picker + action picker + dispatch via pi.sendUserMessage.
 * The extension never runs the optimization itself; it just collects inputs
 * and fires the existing /autoresearch-pipeline (or /gen-evals) prompt into
 * the chat, which Pi's main agent + the autoresearch-* sub-agents handle.
 *
 * Multi-skill projects: eval files are resolved per skill in this order:
 * evals/<skill-name>.json → evals/<short-name>.json → evals/evals.json.
 * See resolveEvalFile() for details.
 *
 * Future phases (separate commits):
 *   2. Live progress widget watching results.tsv
 *   3. Resume picker + eval review TUI + per-agent model/thinking tuning
 *
 * Loaded on-demand via `brunnr brokkr`, never installed into Pi's extension
 * search paths.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getSelectListTheme } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { SelectList, visibleWidth } from "@mariozechner/pi-tui";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";

// ── Bordered overlay wrapper ─────────────────────────────────────────────
// Same pattern as eitri's /experts-tune. SelectList is Component but NOT
// Focusable; wrapping in a vanilla Container kills keyboard input because
// Pi's TUI dispatches to focusedComponent.handleInput. This wrapper
// implements both and renders heavy box drawing in theme.bold(borderAccent).
class Bordered implements Component {
	focused = false;
	constructor(
		private inner: Component & { handleInput?(data: string): void },
		private colorize: (s: string) => string,
	) {}
	invalidate(): void { this.inner.invalidate(); }
	handleInput(data: string): void { this.inner.handleInput?.(data); }
	render(width: number): string[] {
		const innerWidth = Math.max(width - 4, 20);
		const innerLines = this.inner.render(innerWidth);
		const horiz = "━".repeat(Math.max(width - 2, 0));
		const top    = this.colorize(`┏${horiz}┓`);
		const bottom = this.colorize(`┗${horiz}┛`);
		const v      = this.colorize("┃");
		const out: string[] = [top];
		for (const line of innerLines) {
			const vis = visibleWidth(line);
			const pad = " ".repeat(Math.max(0, innerWidth - vis));
			out.push(`${v} ${line}${pad} ${v}`);
		}
		out.push(bottom);
		return out;
	}
}

async function pickFromList(
	ctx: ExtensionContext,
	items: { value: string; label: string; description?: string }[],
	preselectValue?: string,
): Promise<string | undefined> {
	if (items.length === 0) return undefined;
	return await ctx.ui.custom<string | undefined>(
		(_tui, theme, _kb, done) => {
			const list = new SelectList(items, Math.min(items.length, 14), getSelectListTheme(), {
				minPrimaryColumnWidth: 20,
				maxPrimaryColumnWidth: 56,
			});
			if (preselectValue !== undefined) {
				const idx = items.findIndex(i => i.value === preselectValue);
				if (idx >= 0) list.setSelectedIndex(idx);
			}
			list.onSelect = (item) => done(item.value);
			list.onCancel = () => done(undefined);
			const colorize = (s: string) => theme.bold(theme.fg("borderAccent", s));
			return new Bordered(list, colorize);
		},
		{ overlay: true },
	);
}

// ── Skill discovery ──────────────────────────────────────────────────────

interface SkillRef {
	name: string;
	path: string;
	scope: "project" | "global";
}

function discoverSkills(cwd: string): SkillRef[] {
	const skills: SkillRef[] = [];

	const projDir = join(cwd, ".pi", "skills");
	if (existsSync(projDir)) {
		for (const entry of readdirSync(projDir)) {
			const skillFile = join(projDir, entry, "SKILL.md");
			if (existsSync(skillFile)) {
				skills.push({ name: entry, path: skillFile, scope: "project" });
			}
		}
	}

	const globalDir = process.env.PI_CODING_AGENT_DIR
		? join(process.env.PI_CODING_AGENT_DIR, "skills")
		: join(process.env.HOME || "", ".pi/agent/skills");
	if (existsSync(globalDir)) {
		for (const entry of readdirSync(globalDir)) {
			const skillFile = join(globalDir, entry, "SKILL.md");
			if (existsSync(skillFile)) {
				skills.push({ name: entry, path: skillFile, scope: "global" });
			}
		}
	}

	return skills;
}

// ── Per-skill eval file resolution ───────────────────────────────────────
// Multi-skill projects need per-skill eval files: a single evals/evals.json
// gets overwritten when /gen-evals runs against a second skill. We resolve
// in order: full skill name → short name (strip first hyphen-prefix) →
// legacy evals/evals.json. The legacy fallback keeps single-skill projects
// working unchanged.
//
// Examples for skill "argon-stance-map":
//   evals/argon-stance-map.json   (full)
//   evals/stance-map.json         (short — current convention)
//   evals/evals.json              (legacy)

function shortNameForSkill(name: string): string {
	const i = name.indexOf("-");
	return i >= 0 ? name.slice(i + 1) : name;
}

function resolveEvalFile(cwd: string, skillName: string): { path: string; exists: boolean } {
	const candidates = [
		join(cwd, "evals", `${skillName}.json`),
		join(cwd, "evals", `${shortNameForSkill(skillName)}.json`),
		join(cwd, "evals", "evals.json"),
	];
	for (const p of candidates) {
		if (existsSync(p)) return { path: p, exists: true };
	}
	return { path: defaultEvalFileForSkill(cwd, skillName), exists: false };
}

function defaultEvalFileForSkill(cwd: string, skillName: string): string {
	// In a project with one skill, write to the legacy evals/evals.json so
	// existing single-skill projects see no behavior change. In a project
	// with multiple skills, write to a per-skill file so generating evals
	// for skill B does not clobber skill A's evals.
	const projectSkillCount = discoverSkills(cwd).filter(s => s.scope === "project").length;
	if (projectSkillCount <= 1) return join(cwd, "evals", "evals.json");
	return join(cwd, "evals", `${shortNameForSkill(skillName)}.json`);
}

function isInGitRepo(filePath: string): boolean {
	try {
		const dir = filePath.replace(/\/[^/]+$/, "") || ".";
		execSync(`git -C "${dir}" rev-parse --show-toplevel`, { stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

function gitRepoRoot(filePath: string): string | undefined {
	try {
		const dir = filePath.replace(/\/[^/]+$/, "") || ".";
		return execSync(`git -C "${dir}" rev-parse --show-toplevel`, { stdio: ["pipe", "pipe", "ignore"] })
			.toString().trim();
	} catch {
		return undefined;
	}
}

function todayTag(): string {
	const now = new Date();
	const yyyy = now.getFullYear();
	const mm = String(now.getMonth() + 1).padStart(2, "0");
	const dd = String(now.getDate()).padStart(2, "0");
	return `${yyyy}${mm}${dd}`;
}

// ── Extension entry point ────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let widgetCtx: any;

	// Theme the user had selected before brokkr auto-switched to "forge".
	// Restored in session_shutdown. Undefined if the switch didn't happen.
	let previousThemeName: string | undefined;

	// Progress watcher state.
	// After /optimize dispatches the pipeline, we poll the project's results.tsv
	// (written by autoresearch-* agents) and render a bordered dashboard widget
	// above the editor so the user sees stage / experiment / pass-rates / history
	// without leaving the chat.
	interface ProgressSnapshot {
		skillName: string;
		stage: string;                 // "stage1" | "gepa" | "compact" | ""
		expCount: number;              // rows after header
		latestExp: string;
		latestTrain: string;
		latestHoldout: string;
		latestStatus: string;          // baseline | keep | discard | crash
		baselineTrain?: number;
		baselineHoldout?: number;
		bestTrain?: number;
		bestHoldout?: number;
		history: string[];             // last 24 statuses (oldest first)
		trainSeries: number[];         // all parseable train rates, oldest first
		holdoutSeries: number[];       // ditto for holdout
		// Phase 2 additions
		totalTokens: number;           // summed from `tokens` column
		costEstimate: number;          // totalTokens × $/M
		elapsedSec: number;            // seconds since watcher started
		etaSec?: number;               // estimated remaining seconds (only if cap is known)
		maxExperiments?: number;       // from dispatch kickoff, if user set it
		consecutiveDiscards: number;   // for plateau preview
		stopped: boolean;              // detected end of run (no changes for >= STOPPED_THRESHOLD_MS)
		// Live mid-experiment progress (from .pi/autoresearch/<skill>/progress.json)
		// Written by the autoresearch agents after each eval+run completes; lets
		// the widget surface activity during the long gap between experiment rows.
		live?: {
			experiment?: number;
			currentEval?: number;
			totalEvals?: number;
			currentRun?: number;
			totalRuns?: number;
			latestPass?: number;
			latestTotal?: number;
			ts?: string;               // ISO-8601 from the agent
		};
	}

	// Live activity tracked directly from Pi events. Independent of whether
	// the agent writes results.tsv or progress.json — these handlers fire on
	// every tool call and turn boundary, so the widget always has something
	// to show even when the agent ignores the file-based protocol.
	interface LiveActivity {
		turn: number;
		currentTool?: { name: string; summary: string; startedAt: number; toolCallId: string };
		lastTool?:    { name: string; summary: string; endedAt: number };
		toolCounts: Record<string, number>;
		totals: {
			input: number;
			output: number;
			cacheRead: number;
			cacheWrite: number;
			cost: number;        // dollars, summed from AssistantMessage.usage.cost.total
		};
		// Layer 2: synthetic experiment tracking derived from tool-call patterns.
		// Used as a fallback display when results.tsv has no rows.
		experiments: ("keep" | "discard")[];
		// True after we observe an edit on *SKILL.md; reset after a
		// commit/reset closes the cycle. Bridges edit→evals→commit-or-reset.
		skillEditedSinceLastBoundary: boolean;
		// Wall-clock of the most recent agent event (turn_start, tool_call,
		// tool_execution_end, turn_end, agent_end). Used by detectStop() to
		// derive "agent idle for >= STOPPED_THRESHOLD_MS" — a much more reliable
		// completion signal than agent_end alone, which fires after EVERY agent
		// loop (every time the agent yields to the user).
		lastActivityAt: number;
		// Set when sustained-idle stop is detected. Cleared on turn_start so a
		// resumed conversation un-marks the widget.
		stoppedAt?: number;
		stopNotified?: boolean;
	}

	const liveActivity: LiveActivity = {
		turn: 0,
		toolCounts: {},
		totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
		experiments: [],
		skillEditedSinceLastBoundary: false,
		lastActivityAt: 0,
	};

	// Armed by /optimize when it dispatches /gen-evals. When agent_end fires
	// next and the eval file went from absent->present during this dispatch's
	// lifetime, Brokkr auto-commits it on the user's behalf — eliminating the
	// manual `git add && git commit` between /gen-evals and
	// /autoresearch-pipeline. Safety: only commits the specific evalFile path,
	// never `git add -A`. Disarmed after a commit attempt (success or fail) or
	// when the user runs another /optimize action.
	let pendingGenEvalsCommit: {
		evalFile: string;
		skillName: string;
		fileExistedAtDispatch: boolean;
		armedAt: number;
		repoRoot: string;
	} | undefined;

	// Blended token rate — sonnet-ish ballpark. Users with different model mixes
	// can override via env. Single rate is intentional: results.tsv has one
	// `tokens` column (combined), not separated input/output.
	const DEFAULT_TOKEN_RATE_PER_MILLION = parseFloat(process.env.BROKKR_TOKEN_RATE || "5");
	const STOPPED_THRESHOLD_MS = 90_000;  // 90s of no results.tsv changes = pipeline done

	const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

	// Render a sparkline normalized to [0, 100] (pass-rate semantics).
	// Returns at most `maxLen` block characters.
	function sparkline(values: number[], maxLen = 28): string {
		if (values.length === 0) return "";
		const clipped = values.slice(-maxLen);
		return clipped.map(v => {
			const clamped = Math.max(0, Math.min(100, v));
			const idx = Math.min(SPARK_CHARS.length - 1, Math.floor((clamped / 100) * SPARK_CHARS.length));
			return SPARK_CHARS[idx];
		}).join("");
	}

	function formatDuration(sec: number): string {
		if (!isFinite(sec) || sec < 0) return "—";
		if (sec < 60) return `${Math.round(sec)}s`;
		const m = Math.floor(sec / 60);
		if (m < 60) return `${m}m`;
		const h = Math.floor(m / 60);
		return `${h}h ${m % 60}m`;
	}

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
		return `${n}`;
	}

	// Build the live-activity rows from the LiveActivity closure state.
	// Returns 0 rows when nothing has happened yet, 1-3 rows when active.
	// Caller is responsible for padding/border.
	function renderLiveActivity(theme: any, _inner: number): string[] {
		if (liveActivity.turn === 0) return [];
		const dim = (s: string) => theme.fg("dim", s);
		const text = (s: string) => theme.fg("text", s);
		const accent = (s: string) => theme.fg("accent", s);
		const out: string[] = [];

		// Row 1: Turn N · Now: <current-tool>  OR  Last: <last-tool>
		const turnPart = `${dim("Turn ")}${accent(String(liveActivity.turn))}`;
		let nowPart = "";
		if (liveActivity.currentTool) {
			const elapsed = ((Date.now() - liveActivity.currentTool.startedAt) / 1000).toFixed(0);
			nowPart = `${dim("  Now: ")}${text(liveActivity.currentTool.summary)}${dim(` · ${elapsed}s`)}`;
		} else if (liveActivity.lastTool) {
			nowPart = `${dim("  Last: ")}${text(liveActivity.lastTool.summary)}`;
		}
		out.push(turnPart + nowPart);

		// Row 2: usage totals — ↑input ↓output R/W cache · $cost
		const t = liveActivity.totals;
		if (t.input > 0 || t.output > 0 || t.cost > 0) {
			const parts: string[] = [];
			if (t.input > 0)      parts.push(`↑${formatTokens(t.input)}`);
			if (t.output > 0)     parts.push(`↓${formatTokens(t.output)}`);
			if (t.cacheRead > 0)  parts.push(`R${formatTokens(t.cacheRead)}`);
			if (t.cacheWrite > 0) parts.push(`W${formatTokens(t.cacheWrite)}`);
			if (t.cost > 0)       parts.push(`$${t.cost.toFixed(3)}`);
			out.push(dim(parts.join("  ")));
		}

		// Row 3: tool-call tally
		const counts = Object.entries(liveActivity.toolCounts)
			.filter(([, n]) => n > 0)
			.sort((a, b) => b[1] - a[1]);
		if (counts.length > 0) {
			const tally = counts.map(([name, n]) => `${name} ${n}`).join(" · ");
			out.push(`${dim("Tools: ")}${text(tally)}`);
		}

		return out;
	}

	// Compact one-liner describing a tool call. Modeled after the pi subagent
	// example's formatToolCall. Returns plain text — caller themes it.
	function formatToolCall(toolName: string, input: any): string {
		const basename = (p: string) => (typeof p === "string" ? p.split("/").pop() || p : "?");
		const truncate = (s: string, max: number) =>
			s.length > max ? `${s.slice(0, max)}…` : s;
		switch (toolName) {
			case "bash": {
				const cmd = typeof input?.command === "string" ? input.command : "";
				return `$ ${truncate(cmd.replace(/\s+/g, " "), 56)}`;
			}
			case "edit": {
				const path = basename(input?.path);
				const n = Array.isArray(input?.edits) ? input.edits.length : 0;
				return `edit ${path} (${n} edit${n === 1 ? "" : "s"})`;
			}
			case "write": {
				const path = basename(input?.path);
				const size = typeof input?.content === "string" ? input.content.length : 0;
				return `write ${path} (${formatTokens(size)}b)`;
			}
			case "read": {
				return `read ${basename(input?.path)}`;
			}
			case "grep": {
				const pattern = typeof input?.pattern === "string" ? input.pattern : "";
				return `grep ${truncate(pattern, 40)}`;
			}
			case "find": {
				const pattern = typeof input?.pattern === "string" ? input.pattern : "";
				return `find ${truncate(pattern, 40)}`;
			}
			case "ls": {
				return `ls ${basename(input?.path)}`;
			}
			default:
				return toolName;
		}
	}

	// Trend arrow comparing the last ~5 values against the preceding ~5.
	// Returns { glyph, colorToken } so the renderer can theme it.
	function trendArrow(values: number[]): { glyph: string; color: string } {
		if (values.length < 4) return { glyph: "·", color: "muted" };
		const half = Math.max(2, Math.floor(Math.min(5, values.length / 2)));
		const recent = values.slice(-half);
		const earlier = values.slice(-2 * half, -half);
		if (earlier.length === 0) return { glyph: "·", color: "muted" };
		const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
		const delta = avg(recent) - avg(earlier);
		if (delta >  2) return { glyph: "↗", color: "success" };
		if (delta < -2) return { glyph: "↘", color: "error"   };
		return { glyph: "→", color: "muted" };
	}

	let progressTimer: NodeJS.Timeout | undefined;
	let progressLastMtime = 0;
	let progressLastSize  = 0;
	let progressSnapshot: ProgressSnapshot | undefined;

	// Re-register the widget with the standard factory. Used both for the
	// initial idle widget on session_start and to refresh the widget after
	// a watcher stops (so the snapshot=undefined idle state appears).
	function registerIdleWidget(): void {
		if (!widgetCtx) return;
		try {
			widgetCtx.ui.setWidget("brokkr-progress", (_tui: any, theme: any) => ({
				dispose: () => {},
				invalidate: () => {},
				render: (width: number) => renderProgressDashboard(progressSnapshot, width, theme, widgetCtx),
			}));
		} catch { /* widget API may be unavailable in some modes */ }
	}

	function stopProgressWatcher(): void {
		if (progressTimer) { clearInterval(progressTimer); progressTimer = undefined; }
		progressSnapshot = undefined;
		// Keep the widget registered so the user always sees Brokkr's status
		// (model + thinking + "no run in progress"). The widget is only
		// fully removed on session_shutdown.
		registerIdleWidget();
	}

	// Read the latest thinking-level change entry from the session, if any.
	// Pi records thinking changes as session entries; we walk backwards to
	// find the current value. Returns undefined if never explicitly set.
	function getCurrentThinkingLevel(ctx: any): string | undefined {
		try {
			const entries = ctx?.sessionManager?.getEntries?.();
			if (!Array.isArray(entries)) return undefined;
			for (let i = entries.length - 1; i >= 0; i--) {
				const e = entries[i];
				if (e && e.type === "thinking_level_change" && typeof e.thinkingLevel === "string") {
					return e.thinkingLevel;
				}
			}
		} catch { /* fall through */ }
		return undefined;
	}

	// Format a single-line "Model: X · Thinking: Y" snippet using the
	// current parent-session model and thinking level. Returns null when
	// no ctx is available (so callers can skip the row entirely).
	function formatModelThinking(ctx: any, theme: any): string | null {
		if (!ctx) return null;
		const modelId = ctx?.model?.id ? String(ctx.model.id) : undefined;
		const thinking = getCurrentThinkingLevel(ctx);
		const dim = (s: string) => theme.fg("dim", s);
		const fg  = (s: string) => theme.fg("text", s);
		const modelPart    = `${dim("Model: ")}${fg(modelId ?? "—")}`;
		const thinkingPart = `${dim("Thinking: ")}${fg(thinking ?? "default")}`;
		return `${modelPart}   ${thinkingPart}`;
	}

	function renderProgressDashboard(snap: ProgressSnapshot | undefined, width: number, theme: any, ctx?: any): string[] {
		const inner = Math.max(width - 4, 30);
		const horiz = "━".repeat(Math.max(width - 2, 0));
		const accent = (s: string) => theme.bold(theme.fg("accent", s));
		const v = accent("┃");
		const top    = accent(`┏${horiz}┓`);
		const bottom = accent(`┗${horiz}┛`);
		const pad = (line: string) => {
			const vis = visibleWidth(line);
			return `${v} ${line}${" ".repeat(Math.max(0, inner - vis))} ${v}`;
		};

		const modelLine = formatModelThinking(ctx ?? widgetCtx, theme);

		// Event-driven live activity rows. Always rendered when there's any
		// turn data. Independent of results.tsv / progress.json.
		const liveRows = renderLiveActivity(theme, inner);

		if (!snap) {
			const titleLine = liveActivity.turn > 0
				? theme.bold(theme.fg("accent", "Brokkr")) + theme.fg("dim", " · ") + theme.fg("text", "active session")
				: theme.fg("dim", "Brokkr · no run in progress");
			const out = [top, pad(titleLine)];
			if (modelLine) out.push(pad(modelLine));
			if (liveRows.length > 0) {
				out.push(pad(""));
				for (const row of liveRows) out.push(pad(row));
			}
			out.push(bottom);
			return out;
		}

		const lines: string[] = [top];
		// Title row
		const title = theme.bold(theme.fg("accent", "Brokkr")) + theme.fg("dim", " · ") + theme.fg("text", snap.skillName);
		lines.push(pad(title));
		if (modelLine) lines.push(pad(modelLine));
		// Live event-driven activity rows. These render before stage/latest so
		// users see real-time agent activity at the top of the dashboard.
		if (liveRows.length > 0) {
			lines.push(pad(""));
			for (const row of liveRows) lines.push(pad(row));
		}
		lines.push(pad(""));

		// Stage row
		const stageLabel: Record<string, string> = {
			stage1:  "Stage 1 · hill-climb",
			gepa:    "Stage 2 · GEPA reflection",
			compact: "Stage 3 · compaction",
		};
		const stageText = stageLabel[snap.stage] || (snap.stage || "Stage —");
		// Prefer file-based experiment count when available; fall back to the
		// event-derived synthetic count (Layer 2). The synthetic count is a
		// best-effort pattern match on git commit / git reset --hard following
		// a SKILL.md edit — labeled with "~" to flag the approximation.
		const expDisplay = snap.expCount > 0
			? `experiments: ${snap.expCount}`
			: liveActivity.experiments.length > 0
				? `experiments: ~${liveActivity.experiments.length}`
				: `experiments: 0`;
		lines.push(pad(theme.fg("warning", stageText) + theme.fg("dim", `   ${expDisplay}`)));

		// Live mid-experiment activity row (from progress.json). Hidden when the
		// agent hasn't written one yet — keeps the widget compact for skills that
		// finish experiments fast enough to make this redundant.
		if (snap.live && (snap.live.currentEval !== undefined || snap.live.experiment !== undefined)) {
			const bits: string[] = [];
			if (snap.live.experiment !== undefined) bits.push(`exp ${snap.live.experiment}`);
			if (snap.live.currentEval !== undefined && snap.live.totalEvals !== undefined) {
				bits.push(`eval ${snap.live.currentEval}/${snap.live.totalEvals}`);
			} else if (snap.live.currentEval !== undefined) {
				bits.push(`eval ${snap.live.currentEval}`);
			}
			if (snap.live.currentRun !== undefined && snap.live.totalRuns !== undefined) {
				bits.push(`run ${snap.live.currentRun}/${snap.live.totalRuns}`);
			}
			if (snap.live.latestPass !== undefined && snap.live.latestTotal !== undefined) {
				const passColor = snap.live.latestPass === snap.live.latestTotal ? "success" : "warning";
				bits.push(`last ${theme.fg(passColor, `${snap.live.latestPass}/${snap.live.latestTotal}`)}`);
			}
			if (snap.live.ts) {
				// Show only HH:MM:SS if the timestamp is ISO-8601; otherwise use as-is.
				const m = snap.live.ts.match(/T(\d{2}:\d{2}:\d{2})/);
				bits.push(theme.fg("dim", m ? m[1] : snap.live.ts));
			}
			if (bits.length > 0) {
				lines.push(pad(theme.fg("dim", "Now: ") + bits.join(theme.fg("dim", " · "))));
			}
		}

		// Latest row
		const statusColor: Record<string, string> = {
			keep:     "success",
			baseline: "muted",
			discard:  "muted",
			crash:    "error",
		};
		const sColor = statusColor[snap.latestStatus] || "text";
		const latestStatus = theme.fg(sColor, snap.latestStatus.padEnd(8));
		const latestLine = `Latest: ${latestStatus}  train ${theme.fg("accent", snap.latestTrain + "%")}  holdout ${theme.fg("accent", snap.latestHoldout + "%")}`;
		lines.push(pad(latestLine));

		// Best row + delta
		if (snap.bestTrain !== undefined && snap.bestHoldout !== undefined) {
			const bestLine = `Best:             train ${theme.fg("success", snap.bestTrain.toFixed(1) + "%")}  holdout ${theme.fg("success", snap.bestHoldout.toFixed(1) + "%")}`;
			lines.push(pad(bestLine));
			if (snap.baselineTrain !== undefined && snap.baselineHoldout !== undefined) {
				const dt = snap.bestTrain - snap.baselineTrain;
				const dh = snap.bestHoldout - snap.baselineHoldout;
				const fmt = (n: number) => {
					const sign = n >= 0 ? "+" : "";
					const color = n > 0 ? "success" : n < 0 ? "error" : "muted";
					return theme.fg(color, `${sign}${n.toFixed(1)} pts`);
				};
				lines.push(pad(theme.fg("dim", "Δ vs baseline: ") + `train ${fmt(dt)}  ·  holdout ${fmt(dh)}`));
			}
		}

		// Sparklines — train and holdout pass-rate trajectory with trend arrow.
		// Each block character = one experiment. Normalized to [0, 100].
		if (snap.trainSeries.length >= 2 || snap.holdoutSeries.length >= 2) {
			lines.push(pad(""));
			const renderSpark = (label: string, series: number[]) => {
				if (series.length === 0) return null;
				const sl = sparkline(series, 28);
				const last = series[series.length - 1];
				const lastStr = isFinite(last) ? `${last.toFixed(1)}%` : "—";
				const arrow = trendArrow(series);
				const labelPart = theme.fg("dim", `${label.padEnd(8)}`);
				const sparkPart = theme.fg("accent", sl);
				const valuePart = theme.fg("text", `  ${lastStr.padStart(6)}`);
				const arrowPart = `  ${theme.bold(theme.fg(arrow.color, arrow.glyph))}`;
				return labelPart + sparkPart + valuePart + arrowPart;
			};
			const trainLine   = renderSpark("Train",   snap.trainSeries);
			const holdoutLine = renderSpark("Holdout", snap.holdoutSeries);
			if (trainLine)   lines.push(pad(trainLine));
			if (holdoutLine) lines.push(pad(holdoutLine));
		}

		// Cost + ETA row
		if (snap.totalTokens > 0 || snap.elapsedSec > 0) {
			lines.push(pad(""));
			const tokensStr = formatTokens(snap.totalTokens);
			const costStr   = `$${snap.costEstimate.toFixed(2)}`;
			const elapsedStr = formatDuration(snap.elapsedSec);
			const etaPart = snap.etaSec !== undefined
				? `   ETA ${theme.fg("warning", formatDuration(snap.etaSec))}${snap.maxExperiments ? theme.fg("dim", `  (${snap.expCount}/${snap.maxExperiments} exp)`) : ""}`
				: "";
			const costLine = `${theme.fg("dim", "Cost ")}${theme.fg("text", tokensStr.padStart(6) + " tokens · ")}${theme.fg("accent", costStr)}${theme.fg("dim", "    Elapsed ")}${theme.fg("text", elapsedStr)}${etaPart}`;
			lines.push(pad(costLine));
		}

		// Plateau watch — only shows if we're climbing the discard streak
		if (snap.consecutiveDiscards >= 3) {
			const plateauColor = snap.consecutiveDiscards >= 7 ? "warning" : "muted";
			lines.push(pad(theme.fg(plateauColor, `Plateau watch: ${snap.consecutiveDiscards}/10 consecutive non-kept experiments`)));
		}

		// History strip (last 24 statuses, K/D/X/B color-coded). When results.tsv
		// has rows, use those (full per-experiment status). Otherwise fall back
		// to the Layer-2 synthetic history derived from observed git commits /
		// resets — labeled "~History" to flag the approximation.
		const glyph: Record<string, string> = { keep: "K", baseline: "B", discard: "D", crash: "X" };
		if (snap.history.length > 0) {
			lines.push(pad(""));
			const colored = snap.history.slice(-24).map(s => {
				const g = glyph[s] || "?";
				const c = statusColor[s] || "text";
				return theme.fg(c, g);
			}).join(" ");
			lines.push(pad(theme.fg("dim", "History: ") + colored));
		} else if (liveActivity.experiments.length > 0) {
			lines.push(pad(""));
			const colored = liveActivity.experiments.slice(-24).map(s => {
				const g = glyph[s] || "?";
				const c = statusColor[s] || "text";
				return theme.fg(c, g);
			}).join(" ");
			lines.push(pad(theme.fg("dim", "~History: ") + colored));
		}

		// Stopped banner
		if (snap.stopped) {
			lines.push(pad(""));
			lines.push(pad(theme.bold(theme.fg("success", "✓ Pipeline finished — see chat for summary"))));
		}

		lines.push(bottom);
		return lines;
	}

	// Read the live progress.json written by autoresearch agents mid-experiment.
	// Returns undefined if the file is missing or malformed — callers treat that
	// as "no live data yet", same as the agent simply not having written one.
	function readLiveProgress(repoRoot: string, skillName: string): ProgressSnapshot["live"] | undefined {
		const p = join(repoRoot, ".pi", "autoresearch", skillName, "progress.json");
		if (!existsSync(p)) return undefined;
		try {
			const raw = readFileSync(p, "utf-8");
			const j = JSON.parse(raw);
			if (typeof j !== "object" || j === null) return undefined;
			return {
				experiment:   typeof j.experiment   === "number" ? j.experiment   : undefined,
				currentEval:  typeof j.currentEval  === "number" ? j.currentEval  : undefined,
				totalEvals:   typeof j.totalEvals   === "number" ? j.totalEvals   : undefined,
				currentRun:   typeof j.currentRun   === "number" ? j.currentRun   : undefined,
				totalRuns:    typeof j.totalRuns    === "number" ? j.totalRuns    : undefined,
				latestPass:   typeof j.latestPass   === "number" ? j.latestPass   : undefined,
				latestTotal:  typeof j.latestTotal  === "number" ? j.latestTotal  : undefined,
				ts:           typeof j.ts           === "string" ? j.ts           : undefined,
			};
		} catch { return undefined; }
	}

	// Find the most recent *-report.md file in .pi/autoresearch/<skill>/.
	// The autoresearch agent writes the report as the *last* step of its wrap-up
	// loop — so a report file appearing post-start is a "pipeline done" signal,
	// but only when nothing in the tree was modified after it (see detectStop).
	function findLatestReport(repoRoot: string, skillName: string): { path: string; mtimeMs: number } | undefined {
		const dir = join(repoRoot, ".pi", "autoresearch", skillName);
		if (!existsSync(dir)) return undefined;
		try {
			let best: { path: string; mtimeMs: number } | undefined;
			for (const entry of readdirSync(dir)) {
				if (!entry.endsWith("-report.md")) continue;
				const p = join(dir, entry);
				try {
					const s = statSync(p);
					if (!s.isFile()) continue;
					if (!best || s.mtimeMs > best.mtimeMs) best = { path: p, mtimeMs: s.mtimeMs };
				} catch { /* skip */ }
			}
			return best;
		} catch { return undefined; }
	}

	// Walk .pi/autoresearch/<skill>/ recursively (bounded depth) and return
	// the freshest mtime found anywhere in the tree.
	//
	// Why recursion: custom eval runners write per-eval output to subdirs
	// like opt-<tag>-run1/eval01_run1.txt. Those writes update the subdir's
	// mtime but NOT the parent dir's mtime. A naive top-level-only scan
	// would see the parent dir frozen at its creation time and falsely
	// declare the run "stopped" after 90s. Walking the tree fixes that.
	//
	// Depth is bounded so a runaway dir (eg from a misbehaving agent) can't
	// hang the watcher. Each scan is throwaway — no caching — because the
	// tree is small (one skill's outputs) and scans run every 2s.
	function lastActivityMtimeMs(repoRoot: string, skillName: string): number {
		const base = join(repoRoot, ".pi", "autoresearch", skillName);
		let max = 0;
		const tsv = join(repoRoot, "results.tsv");
		try {
			if (existsSync(tsv)) {
				const m = statSync(tsv).mtimeMs;
				if (m > max) max = m;
			}
		} catch { /* skip */ }
		if (!existsSync(base)) return max;
		const MAX_DEPTH = 4;
		const stack: { path: string; depth: number }[] = [{ path: base, depth: 0 }];
		while (stack.length > 0) {
			const { path, depth } = stack.pop()!;
			try {
				const s = statSync(path);
				if (s.mtimeMs > max) max = s.mtimeMs;
				if (s.isDirectory() && depth < MAX_DEPTH) {
					for (const entry of readdirSync(path)) {
						stack.push({ path: join(path, entry), depth: depth + 1 });
					}
				}
			} catch { /* skip */ }
		}
		return max;
	}

	function parseTsvRows(tsv: string): { exp: string; trainRate: string; holdoutRate: string; tokens: number; status: string }[] {
		const lines = tsv.trim().split("\n").filter(Boolean);
		if (lines.length < 2) return [];
		const rows = lines.slice(1).map(line => {
			const cols = line.split("\t");
			const tokens = parseInt(cols[5] || "0", 10);
			return {
				exp:         cols[0] || "?",
				trainRate:   cols[2] || "?",
				holdoutRate: cols[3] || "?",
				tokens:      isFinite(tokens) ? tokens : 0,
				status:      (cols[6] || "?").toLowerCase(),
			};
		});
		return rows;
	}

	function startProgressWatcher(
		ctx: ExtensionContext,
		repoRoot: string,
		skillName: string,
		maxExperiments?: number,
	): void {
		stopProgressWatcher();
		progressLastMtime = 0;
		progressLastSize  = 0;
		progressSnapshot  = undefined;

		const startEpochMs = Date.now();
		// Notification-fired state lives on liveActivity so turn_start can
		// re-arm it (a resumed conversation should get a fresh notification
		// when it stops again).
		liveActivity.stopNotified = false;
		// When the run is detected as stopped, this captures the wall-clock
		// instant of stop. Freezing elapsedSec at (stoppedAtMs - startEpochMs)
		// stops the widget timer from ticking after the pipeline has actually
		// finished. Unset while the run is still active.
		let stoppedAtMs: number | undefined;

		const tsvPath = join(repoRoot, "results.tsv");

		// Returns the wall-clock mtime to freeze at when the run is detected
		// as stopped, or undefined while still running. Three paths, first wins:
		//   1. Sustained-idle from Pi events: agent has had zero activity for
		//      STOPPED_THRESHOLD_MS. This is the primary signal — works even
		//      when the agent writes no files. Re-armed automatically when
		//      turn_start fires (so a continued conversation un-stops).
		//   2. A *-report.md file appeared post-start AND nothing in the tree
		//      is newer (defends against placeholder reports).
		//   3. All file indicators quiet for STOPPED_THRESHOLD_MS — file-based
		//      fallback for the rare case where Pi events aren't reaching us.
		const detectStop = (): number | undefined => {
			if (stoppedAtMs !== undefined) return stoppedAtMs;
			// Path 1 — sustained idle. Honor previously-detected stoppedAt
			// from liveActivity (re-armed by turn_start when needed).
			if (liveActivity.stoppedAt && liveActivity.stoppedAt >= startEpochMs) {
				return liveActivity.stoppedAt;
			}
			if (liveActivity.lastActivityAt && liveActivity.lastActivityAt >= startEpochMs
				&& (Date.now() - liveActivity.lastActivityAt) >= STOPPED_THRESHOLD_MS) {
				liveActivity.stoppedAt = liveActivity.lastActivityAt;
				return liveActivity.stoppedAt;
			}
			const activity = lastActivityMtimeMs(repoRoot, skillName);
			const report = findLatestReport(repoRoot, skillName);
			// Path 2 — report file is the last write in the tree.
			if (report && report.mtimeMs >= startEpochMs && report.mtimeMs >= activity - 1) {
				return report.mtimeMs;
			}
			// Path 3 — files have gone quiet (rare fallback).
			if (activity >= startEpochMs && (Date.now() - activity) >= STOPPED_THRESHOLD_MS) {
				return activity;
			}
			return undefined;
		};

		// Register the widget once. Its factory reads progressSnapshot from closure
		// scope, so re-rendering only requires invalidating the underlying TUI —
		// which Pi does automatically when setWidget is called again. To trigger
		// re-render on data change without resetting state, we re-register the
		// widget with a fresh factory each update tick.
		const renderWidget = () => {
			ctx.ui.setWidget("brokkr-progress", (_tui: any, theme: any) => ({
				dispose: () => {},
				invalidate: () => {},
				render: (width: number) => renderProgressDashboard(progressSnapshot, width, theme, ctx),
			}));
		};

		const update = () => {
			if (!existsSync(tsvPath)) {
				// No results.tsv yet — but the agent may have already finished
				// via a custom batch runner that wrote a report without ever
				// populating results.tsv. detectStop() catches that.
				const stopMs = detectStop();
				if (stopMs && stoppedAtMs === undefined) stoppedAtMs = stopMs;
				const elapsedSec = stoppedAtMs
					? (stoppedAtMs - startEpochMs) / 1000
					: (Date.now() - startEpochMs) / 1000;
				const stopped = stoppedAtMs !== undefined;
				progressSnapshot = {
					skillName,
					stage: "",
					expCount: 0,
					latestExp: "—",
					latestTrain: "—",
					latestHoldout: "—",
					latestStatus: stopped ? "done" : "waiting",
					history: [],
					trainSeries: [],
					holdoutSeries: [],
					totalTokens: 0,
					costEstimate: 0,
					elapsedSec,
					maxExperiments,
					consecutiveDiscards: 0,
					stopped,
					live: readLiveProgress(repoRoot, skillName),
				};
				renderWidget();
				if (stopped && !liveActivity.stopNotified) {
					liveActivity.stopNotified = true;
					try { process.stdout.write("\x07"); } catch {}
					try {
						ctx.ui.notify(
							"Pipeline finished — see chat for the full summary.",
							"info",
						);
					} catch {}
				}
				return;
			}
			let st: ReturnType<typeof statSync>;
			try { st = statSync(tsvPath); } catch { return; }

			// Unified stop detection (report file post-start, or all indicators
			// quiet for STOPPED_THRESHOLD_MS). Replaces the old tsv-only check
			// which missed runs that never wrote a results.tsv row.
			const stopMs = detectStop();
			if (stopMs && stoppedAtMs === undefined) stoppedAtMs = stopMs;
			const shouldMarkStopped = stoppedAtMs !== undefined && !(progressSnapshot?.stopped);

			const fileUnchanged = st.mtimeMs === progressLastMtime && st.size === progressLastSize;
			if (fileUnchanged && !shouldMarkStopped) {
				// Still refresh elapsed/ETA-based fields on the existing snapshot so
				// the user sees elapsed clock advance even when no new experiment landed.
				// Also re-read progress.json — the autoresearch agent overwrites it
				// after each eval+run, so this is where live mid-experiment activity
				// surfaces between durable results.tsv updates.
				if (progressSnapshot) {
					progressSnapshot.elapsedSec = stoppedAtMs
						? (stoppedAtMs - startEpochMs) / 1000
						: (Date.now() - startEpochMs) / 1000;
					progressSnapshot.live = readLiveProgress(repoRoot, skillName);
					renderWidget();
				}
				return;
			}

			progressLastMtime = st.mtimeMs;
			progressLastSize  = st.size;

			let content: string;
			try { content = readFileSync(tsvPath, "utf-8"); } catch { return; }
			const rows = parseTsvRows(content);
			if (rows.length === 0) return;

			// Stage detection
			let stage = "";
			try {
				const branch = execSync(`git -C "${repoRoot}" branch --show-current`, { stdio: ["pipe", "pipe", "ignore"] })
					.toString().trim();
				const m = branch.match(/^autoresearch-(skill|skill-gepa|agent)\/.+-(stage1|gepa|compact)$/);
				if (m) stage = m[2];
				else if (branch.startsWith("autoresearch-")) stage = branch.split("/")[0].replace("autoresearch-", "");
			} catch { /* fine */ }

			// Baseline = first row(s) with status="baseline"; take the first one.
			const baseline = rows.find(r => r.status === "baseline");
			const baselineTrain   = baseline ? parseFloat(baseline.trainRate)   : undefined;
			const baselineHoldout = baseline ? parseFloat(baseline.holdoutRate) : undefined;

			// Best = max train + holdout across kept experiments (latest kept usually = best).
			const kepts = rows.filter(r => r.status === "keep");
			const bestTrain = kepts.length > 0
				? Math.max(...kepts.map(r => parseFloat(r.trainRate)).filter(n => !isNaN(n)))
				: baselineTrain;
			const bestHoldout = kepts.length > 0
				? Math.max(...kepts.map(r => parseFloat(r.holdoutRate)).filter(n => !isNaN(n)))
				: baselineHoldout;

			const latest = rows[rows.length - 1];

			// Series for sparklines — keep every parseable row, oldest first.
			const trainSeries   = rows.map(r => parseFloat(r.trainRate)).filter(n => isFinite(n));
			const holdoutSeries = rows.map(r => parseFloat(r.holdoutRate)).filter(n => isFinite(n));

			// Cost: sum tokens, apply blended $/M rate.
			const totalTokens  = rows.reduce((sum, r) => sum + r.tokens, 0);
			const costEstimate = (totalTokens / 1_000_000) * DEFAULT_TOKEN_RATE_PER_MILLION;

			// ETA: avg seconds per experiment × remaining experiments (only if cap known).
			// Elapsed freezes at stoppedAtMs once we've detected pipeline completion.
			const elapsedSec = stoppedAtMs
				? (stoppedAtMs - startEpochMs) / 1000
				: (Date.now() - startEpochMs) / 1000;
			let etaSec: number | undefined;
			if (!stoppedAtMs && maxExperiments && rows.length > 0 && rows.length < maxExperiments) {
				const avgPerExp = elapsedSec / rows.length;
				etaSec = avgPerExp * (maxExperiments - rows.length);
			}

			// Plateau watch: count tail consecutive non-keep, non-baseline rows.
			let consecutiveDiscards = 0;
			for (let i = rows.length - 1; i >= 0; i--) {
				const s = rows[i].status;
				if (s === "discard" || s === "crash") consecutiveDiscards++;
				else break;
			}

			progressSnapshot = {
				skillName,
				stage,
				expCount: rows.length,
				latestExp: latest.exp,
				latestTrain: latest.trainRate,
				latestHoldout: latest.holdoutRate,
				latestStatus: latest.status,
				baselineTrain,
				baselineHoldout,
				bestTrain,
				bestHoldout,
				history: rows.map(r => r.status),
				trainSeries,
				holdoutSeries,
				totalTokens,
				costEstimate,
				elapsedSec,
				etaSec,
				maxExperiments,
				consecutiveDiscards,
				stopped: stoppedAtMs !== undefined,
				live: readLiveProgress(repoRoot, skillName),
			};
			renderWidget();

			// Completion notification — fire bell + chat notify once when we detect
			// the pipeline has wrapped up (report file appeared, or all indicators
			// went quiet for STOPPED_THRESHOLD_MS).
			if (shouldMarkStopped && !liveActivity.stopNotified) {
				liveActivity.stopNotified = true;
				try { process.stdout.write("\x07"); } catch {}
				try {
					ctx.ui.notify(
						`Pipeline finished — ${rows.length} experiments, best train ${bestTrain?.toFixed(1) ?? "—"}% / holdout ${bestHoldout?.toFixed(1) ?? "—"}%. See chat for the full summary.`,
						"info",
					);
				} catch {}
			}
		};

		update();  // render whatever's there now (probably nothing on a fresh kickoff)
		progressTimer = setInterval(update, 2000);
	}

	pi.on("session_start", async (_event, _ctx) => {
		widgetCtx = _ctx;

		// Auto-switch to the forge theme for brokkr sessions. The recipe makes
		// forge.json discoverable via --theme; here we activate it and remember
		// the previous theme so session_shutdown restores it.
		try {
			const ui = _ctx?.ui as any;
			if (ui?.setTheme && ui?.getAllThemes) {
				const available = (ui.getAllThemes() || []).map((t: any) => t?.name);
				if (available.includes("forge")) {
					const current = ui.theme?.name;
					const result = ui.setTheme("forge");
					if (result?.success && current && current !== "forge") {
						previousThemeName = current;
					}
				}
			}
		} catch { /* don't block session_start on theme failure */ }

		_ctx.ui.setStatus("brokkr", "Brokkr");
		_ctx.ui.notify(
			"Brokkr loaded — the bellows keep the fire even.\n\n" +
			"/optimize         Pick a skill, run gen-evals or the pipeline\n" +
			"/optimize-config  Tune model + thinking per optimizer agent\n" +
			"/optimize-stop    Abort the running pipeline cleanly (resume later)\n",
			"info",
		);

		// Show the persistent idle widget right away — model/thinking line +
		// "no run in progress". Replaced by the active dashboard when a run
		// starts; refreshed back to idle when the run ends.
		registerIdleWidget();
	});

	// ── Live-activity event hooks (Layer 1 event-driven monitoring) ─────────
	// These run for *every* Pi turn and tool call regardless of whether the
	// autoresearch agent writes results.tsv / progress.json. The widget pulls
	// from `liveActivity` on every render — see renderProgressDashboard.

	pi.on("turn_start", async (event) => {
		liveActivity.turn = event.turnIndex;
		liveActivity.currentTool = undefined;
		liveActivity.lastActivityAt = Date.now();
		// Re-arm: if a previous idle period tripped the stop banner, clear
		// it now that the agent has resumed working.
		liveActivity.stoppedAt = undefined;
		liveActivity.stopNotified = false;
		invalidateIfActive();
	});

	pi.on("tool_call", async (event) => {
		const input = (event as any).input;
		liveActivity.lastActivityAt = Date.now();
		liveActivity.currentTool = {
			name: event.toolName,
			summary: formatToolCall(event.toolName, input),
			startedAt: Date.now(),
			toolCallId: event.toolCallId,
		};

		// Layer 2: derive experiment cycles from tool-call patterns.
		// edit *SKILL.md  → mark cycle in progress
		// bash 'git commit'     → if in progress, close as "keep"
		// bash 'git reset --hard' → if in progress, close as "discard"
		try {
			if (event.toolName === "edit" && typeof input?.path === "string" && /SKILL\.md$/.test(input.path)) {
				liveActivity.skillEditedSinceLastBoundary = true;
			} else if (event.toolName === "write" && typeof input?.path === "string" && /SKILL\.md$/.test(input.path)) {
				liveActivity.skillEditedSinceLastBoundary = true;
			} else if (event.toolName === "bash" && typeof input?.command === "string") {
				const cmd = input.command;
				const isCommit       = /(^|[\s&;])git\s+commit\b/.test(cmd);
				const isHardReset    = /(^|[\s&;])git\s+reset\s+--hard\b/.test(cmd);
				const isRestoreSkill = /(^|[\s&;])git\s+restore\b.*SKILL\.md/.test(cmd);
				if (liveActivity.skillEditedSinceLastBoundary) {
					if (isCommit) {
						liveActivity.experiments.push("keep");
						liveActivity.skillEditedSinceLastBoundary = false;
					} else if (isHardReset || isRestoreSkill) {
						liveActivity.experiments.push("discard");
						liveActivity.skillEditedSinceLastBoundary = false;
					}
					// Cap history so memory stays bounded.
					if (liveActivity.experiments.length > 256) {
						liveActivity.experiments.splice(0, liveActivity.experiments.length - 256);
					}
				}
			}
		} catch { /* never let event handlers crash the agent loop */ }

		invalidateIfActive();
	});

	pi.on("tool_execution_end", async (event) => {
		liveActivity.lastActivityAt = Date.now();
		if (liveActivity.currentTool && liveActivity.currentTool.toolCallId === event.toolCallId) {
			liveActivity.lastTool = {
				name: liveActivity.currentTool.name,
				summary: liveActivity.currentTool.summary,
				endedAt: Date.now(),
			};
			liveActivity.currentTool = undefined;
		}
		liveActivity.toolCounts[event.toolName] = (liveActivity.toolCounts[event.toolName] || 0) + 1;
		invalidateIfActive();
	});

	pi.on("turn_end", async (event) => {
		const m: any = event.message;
		if (m && m.role === "assistant" && m.usage) {
			liveActivity.totals.input      += m.usage.input      || 0;
			liveActivity.totals.output     += m.usage.output     || 0;
			liveActivity.totals.cacheRead  += m.usage.cacheRead  || 0;
			liveActivity.totals.cacheWrite += m.usage.cacheWrite || 0;
			liveActivity.totals.cost       += m.usage.cost?.total || 0;
		}
		liveActivity.lastActivityAt = Date.now();
		invalidateIfActive();
	});

	// agent_end fires at the END of every agent loop — including when the
	// agent yields to the user mid-pipeline (e.g., preflight aborted, asking
	// to commit). It is NOT a "pipeline finished" signal. We use it as an
	// activity timestamp only; sustained-idle in detectStop() decides when
	// to actually mark the run stopped.
	//
	// agent_end is also the right moment to check whether a pending
	// /gen-evals commit should fire: the agent yielded, the file may be on
	// disk now, ready to lock in.
	pi.on("agent_end", async (_event, ctx) => {
		liveActivity.lastActivityAt = Date.now();
		liveActivity.currentTool = undefined;

		// Check pending /gen-evals auto-commit. Conditions for firing:
		//   1. We armed pendingGenEvalsCommit on the most recent /optimize.
		//   2. The eval file now exists (it was just written by /gen-evals).
		//   3. The file didn't already exist at dispatch (don't auto-commit
		//      a pre-existing file the user might be editing).
		//   4. The arm is < 30min old (sanity bound).
		if (pendingGenEvalsCommit && ctx) {
			const pc = pendingGenEvalsCommit;
			const aged = Date.now() - pc.armedAt > 30 * 60 * 1000;
			if (aged) {
				pendingGenEvalsCommit = undefined;
			} else if (existsSync(pc.evalFile) && !pc.fileExistedAtDispatch) {
				// Disarm BEFORE attempting commit so a failure doesn't loop.
				pendingGenEvalsCommit = undefined;
				try {
					// Only stage the specific file — never `git add -A`.
					execSync(`git -C "${pc.repoRoot}" add "${pc.evalFile}"`, { stdio: "pipe" });
					execSync(
						`git -C "${pc.repoRoot}" commit -m "Add ${pc.skillName} eval suite via /gen-evals"`,
						{ stdio: "pipe" },
					);
					try {
						ctx.ui.notify(
							`Auto-committed ${pc.evalFile.replace(pc.repoRoot + "/", "")} — ready for /autoresearch-pipeline.`,
							"info",
						);
					} catch { /* notify-only failure is non-fatal */ }
				} catch (err: any) {
					// Most common: pre-commit hook failure, signing config, or
					// nothing-to-commit. Surface clearly so the user can fix
					// and commit manually.
					try {
						ctx.ui.notify(
							`Auto-commit of ${pc.evalFile} failed: ${(err?.message ?? err).toString().slice(0, 200)}. Commit manually before /autoresearch-pipeline.`,
							"warning",
						);
					} catch {}
				}
			}
		}

		invalidateIfActive();
	});

	// Re-render the widget if it's currently registered. Used by event handlers.
	function invalidateIfActive(): void {
		if (!widgetCtx) return;
		// The widget reads `progressSnapshot` and `liveActivity` from closure on
		// every render; re-registering with the same factory triggers Pi to
		// invalidate and redraw without resetting any other state.
		registerIdleWidget();
	}

	pi.on("session_shutdown", async () => {
		stopProgressWatcher();
		// Now that the session is ending, remove the widget for real.
		// stopProgressWatcher itself leaves the idle widget visible mid-session.
		try { widgetCtx?.ui?.setWidget?.("brokkr-progress", undefined); } catch {}
		if (previousThemeName) {
			try { (widgetCtx?.ui as any)?.setTheme?.(previousThemeName); } catch {}
			previousThemeName = undefined;
		}
	});

	// Budget caps picker. Returns:
	//   undefined  → user pressed Esc (abort pipeline dispatch)
	//   { maxExperiments?, maxRuntime? } → values to inject into /autoresearch-pipeline
	//                                       (either may be unset → no cap on that axis)
	async function pickBudget(ctx: ExtensionContext): Promise<
		{ maxExperiments?: string; maxRuntime?: string } | undefined
	> {
		// Preset combos cover ~90% of use cases. "Custom" drills into separate pickers.
		const preset = await pickFromList(ctx, [
			{ value: "none",      label: "No caps",                       description: "Plateau + saturation only — best results, no time/cost ceiling" },
			{ value: "quick",     label: "Quick · 20 exp or 30 min",      description: "Testing or exploration" },
			{ value: "medium",    label: "Medium · 40 exp or 1 hour",     description: "Most skills plateau before this" },
			{ value: "long",      label: "Long · 80 exp or 2 hours",      description: "Higher headroom for hard skills" },
			{ value: "overnight", label: "Overnight · 200 exp or 4 hours", description: "Essentially unlimited" },
			{ value: "custom",    label: "Custom…",                       description: "Pick MAX_EXPERIMENTS and MAX_RUNTIME separately" },
		]);
		if (!preset) return undefined;

		switch (preset) {
			case "none":      return {};
			case "quick":     return { maxExperiments: "20",  maxRuntime: "30min" };
			case "medium":    return { maxExperiments: "40",  maxRuntime: "1h" };
			case "long":      return { maxExperiments: "80",  maxRuntime: "2h" };
			case "overnight": return { maxExperiments: "200", maxRuntime: "4h" };
		}

		// Custom: two sequential pickers. Empty value = no cap.
		const maxExp = await pickFromList(ctx, [
			{ value: "",    label: "No cap",        description: "Plateau-only on this axis" },
			{ value: "20",  label: "20 experiments" },
			{ value: "40",  label: "40 experiments" },
			{ value: "80",  label: "80 experiments" },
			{ value: "200", label: "200 experiments" },
		]);
		if (maxExp === undefined) return undefined;

		const maxRun = await pickFromList(ctx, [
			{ value: "",      label: "No cap",       description: "Plateau-only on this axis" },
			{ value: "30min", label: "30 minutes" },
			{ value: "1h",    label: "1 hour" },
			{ value: "2h",    label: "2 hours" },
			{ value: "4h",    label: "4 hours" },
			{ value: "8h",    label: "8 hours (overnight)" },
		]);
		if (maxRun === undefined) return undefined;

		return {
			maxExperiments: maxExp || undefined,
			maxRuntime:     maxRun || undefined,
		};
	}

	// ── Per-agent model/thinking overrides (Phase 4) ──────────────────────────
	// Tunes the optimizer agents' own runtime: which model is running the
	// autoresearch-skill / autoresearch-skill-gepa / autoresearch-agent /
	// eval-designer brains, and at what thinking level.
	//
	// Mechanism: Pi's Task tool reads each sub-agent's frontmatter (`model:`,
	// `thinking:`) at dispatch time, so the override has to live in the
	// frontmatter of the globally-installed agent file at ~/.pi/agent/agents/.
	// Brokkr also records picks in <project>/.pi/brokkr-overrides.json so
	// nothing is lost when `brunnr remove-optimizer && brunnr setup-optimizer`
	// re-copies fresh frontmatter from $BRUNNR_HOME (user re-applies via
	// /optimize-config). The JSON record is the source-of-truth intent; the
	// frontmatter is the in-effect state.

	const OPTIMIZER_AGENTS = [
		"autoresearch-skill",
		"autoresearch-skill-gepa",
		"autoresearch-agent",
		"eval-designer",
		"eval-designer-agent",
	];

	const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

	interface OptimizerOverride {
		model?: string;
		thinking?: string;
	}

	interface BrokkrOverridesFile {
		agents?: Record<string, OptimizerOverride>;
	}

	function piAgentDir(): string {
		return process.env.PI_CODING_AGENT_DIR
			? join(process.env.PI_CODING_AGENT_DIR, "agents")
			: join(process.env.HOME || "", ".pi/agent/agents");
	}

	function optimizerAgentPath(name: string): string {
		return join(piAgentDir(), `${name}.md`);
	}

	function brokkrOverridesPath(): string {
		return join(process.cwd(), ".pi", "brokkr-overrides.json");
	}

	function loadBrokkrOverrides(): BrokkrOverridesFile {
		const p = brokkrOverridesPath();
		if (!existsSync(p)) return {};
		try {
			const parsed = JSON.parse(readFileSync(p, "utf-8"));
			return (parsed && typeof parsed === "object") ? parsed : {};
		} catch { return {}; }
	}

	function saveBrokkrOverrides(o: BrokkrOverridesFile): void {
		const p = brokkrOverridesPath();
		try {
			mkdirSync(dirname(p), { recursive: true });
			writeFileSync(p, JSON.stringify(o, null, 2) + "\n");
		} catch { /* don't block */ }
	}

	// Read a single line scalar field from the frontmatter block (everything
	// between the first two `---` lines). Returns undefined if not present.
	function readAgentField(filePath: string, field: string): string | undefined {
		if (!existsSync(filePath)) return undefined;
		const content = readFileSync(filePath, "utf-8");
		const m = content.match(/^---\n([\s\S]*?)\n---/);
		if (!m) return undefined;
		const lineMatch = m[1].match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
		if (!lineMatch) return undefined;
		return lineMatch[1].trim().replace(/^["']|["']$/g, "");
	}

	function readAgentOverride(name: string): OptimizerOverride {
		const p = optimizerAgentPath(name);
		return {
			model:    readAgentField(p, "model"),
			thinking: readAgentField(p, "thinking"),
		};
	}

	// Replace the frontmatter's `model:` / `thinking:` lines with the override
	// values. Removes the line entirely if the value is undefined/empty. Inserts
	// after the `name:` line if not previously present.
	function applyAgentFrontmatter(name: string, override: OptimizerOverride): boolean {
		const filePath = optimizerAgentPath(name);
		if (!existsSync(filePath)) return false;
		const content = readFileSync(filePath, "utf-8");
		const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
		if (!fmMatch) return false;

		let fm = fmMatch[2];

		const setField = (block: string, field: string, value: string | undefined): string => {
			const re = new RegExp(`^${field}:\\s*.+$\\n?`, "m");
			if (!value) return block.replace(re, "");
			if (re.test(block)) return block.replace(re, `${field}: ${value}\n`);
			// Insert after `name:` line if present, else at top of frontmatter
			if (/^name:.+$/m.test(block)) {
				return block.replace(/^(name:.+)$/m, `$1\n${field}: ${value}`);
			}
			return `${field}: ${value}\n${block}`;
		};

		fm = setField(fm, "model",    override.model);
		fm = setField(fm, "thinking", override.thinking);
		fm = fm.replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "");

		const newContent = fmMatch[1] + fm + fmMatch[3] + content.slice(fmMatch[0].length);
		writeFileSync(filePath, newContent);
		return true;
	}

	pi.registerCommand("optimize-config", {
		description: "Set per-agent model + thinking for the optimizer agents (autoresearch-*, eval-designer-*)",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("This command needs an interactive UI", "warning");
				return;
			}

			// Outer loop: tune as many agents as you want in one /optimize-config call.
			// Esc on the top picker exits.
			while (true) {
				// Build agent items showing CURRENT applied state (read from frontmatter).
				const agentItems = OPTIMIZER_AGENTS.map(name => {
					const cur = readAgentOverride(name);
					const exists = existsSync(optimizerAgentPath(name));
					if (!exists) {
						return {
							value: name,
							label: name + theme(ctx, "  (not installed — run `brunnr setup-optimizer`)", "warning"),
							description: "n/a",
						};
					}
					const bits: string[] = [];
					bits.push(`model=${cur.model || "default"}`);
					bits.push(`thinking=${cur.thinking || "default"}`);
					return {
						value: name,
						label: name + (cur.model || cur.thinking ? "  *" : ""),
						description: bits.join("  ·  "),
					};
				});
				agentItems.push({
					value: "__reset_all__",
					label: "Reset ALL to defaults",
					description: "Clear model/thinking on every optimizer agent",
				});

				const picked = await pickFromList(ctx, agentItems);
				if (!picked) return;

				if (picked === "__reset_all__") {
					const confirm = await pickFromList(ctx, [
						{ value: "yes", label: "Yes, reset every optimizer agent" },
						{ value: "no",  label: "Cancel" },
					]);
					if (confirm !== "yes") continue;
					for (const n of OPTIMIZER_AGENTS) applyAgentFrontmatter(n, {});
					saveBrokkrOverrides({});
					ctx.ui.notify("All optimizer overrides cleared. Frontmatter restored to ship defaults.", "info");
					continue;
				}

				if (!existsSync(optimizerAgentPath(picked))) {
					ctx.ui.notify(`${picked} isn't installed at ${optimizerAgentPath(picked)}. Run \`brunnr setup-optimizer\` first.`, "warning");
					continue;
				}

				const current = readAgentOverride(picked);

				const action = await pickFromList(ctx, [
					{ value: "model",    label: "Set model",          description: current.model    ? `currently: ${current.model}`    : "currently: default (inherits parent session)" },
					{ value: "thinking", label: "Set thinking level", description: current.thinking ? `currently: ${current.thinking}` : "currently: default" },
					{ value: "reset",    label: "Reset this agent",   description: "Remove both overrides" },
				]);
				if (!action) continue;

				if (action === "reset") {
					applyAgentFrontmatter(picked, {});
					const overrides = loadBrokkrOverrides();
					if (overrides.agents) delete overrides.agents[picked];
					saveBrokkrOverrides(overrides);
					ctx.ui.notify(`${picked}: overrides cleared`, "info");
					continue;
				}

				if (action === "model") {
					const available = ctx.modelRegistry.getAvailable();
					if (available.length === 0) {
						ctx.ui.notify("No models with configured auth. Set an API key or `gh auth login` first.", "warning");
						continue;
					}
					const modelItems = available.map((m: any) => ({
						value: `${m.provider?.id ?? m.provider}/${m.id}`,
						label: m.name || m.id,
						description: `${m.provider?.id ?? m.provider}/${m.id}${m.reasoning ? "  · reasoning" : ""}`,
					}));
					const pickedModel = await pickFromList(ctx, modelItems, current.model);
					if (!pickedModel) continue;

					const next: OptimizerOverride = { ...current, model: pickedModel };
					if (!applyAgentFrontmatter(picked, next)) {
						ctx.ui.notify(`Failed to write ${optimizerAgentPath(picked)}`, "error");
						continue;
					}
					const overrides = loadBrokkrOverrides();
					overrides.agents = overrides.agents || {};
					overrides.agents[picked] = next;
					saveBrokkrOverrides(overrides);
					ctx.ui.notify(`${picked}: model → ${pickedModel}`, "info");
					continue;
				}

				if (action === "thinking") {
					const pickedLevel = await pickFromList(ctx,
						THINKING_LEVELS.map(l => ({ value: l, label: l })),
						current.thinking,
					);
					if (!pickedLevel) continue;

					const next: OptimizerOverride = { ...current, thinking: pickedLevel };
					if (!applyAgentFrontmatter(picked, next)) {
						ctx.ui.notify(`Failed to write ${optimizerAgentPath(picked)}`, "error");
						continue;
					}
					const overrides = loadBrokkrOverrides();
					overrides.agents = overrides.agents || {};
					overrides.agents[picked] = next;
					saveBrokkrOverrides(overrides);
					ctx.ui.notify(`${picked}: thinking → ${pickedLevel}`, "info");
					continue;
				}
			}
		},
	});

	// Tiny helper so the agentItems builder above can splice colored snippets
	// into label strings without dragging the SelectList theme into scope.
	// (SelectList itself does most of the colorization via its theme; this is
	// only for inline annotations like "(not installed)".)
	function theme(_ctx: ExtensionContext, text: string, _token: string): string { return text; }

	pi.registerCommand("optimize-stop", {
		description: "Abort the running optimization pipeline cleanly. Resume later with /optimize → Resume.",
		handler: async (_args, ctx) => {
			if (ctx.isIdle()) {
				ctx.ui.notify("No pipeline is running.", "info");
				return;
			}
			try {
				ctx.abort();
				ctx.ui.notify(
					"Pipeline abort requested. The current experiment is being interrupted.\n" +
					"All completed experiments are already checkpointed in results.tsv / branches.\n" +
					"Resume later with /optimize → 'Resume an interrupted run'.",
					"info",
				);
				// Mark stopped in the dashboard immediately so the user sees the change
				// before the agent actually finishes its current turn.
				if (progressSnapshot) {
					progressSnapshot.stopped = true;
					if (widgetCtx) {
						try { widgetCtx.ui.setWidget("brokkr-progress", (_tui: any, theme: any) => ({
							dispose: () => {},
							invalidate: () => {},
							render: (width: number) => renderProgressDashboard(progressSnapshot, width, theme, widgetCtx),
						})); } catch {}
					}
				}
			} catch (err) {
				ctx.ui.notify(`Abort failed: ${(err as Error).message}`, "error");
			}
		},
	});

	pi.registerCommand("optimize", {
		description: "Pick a skill, generate evals, run the optimization pipeline — all from a TUI",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("This command needs an interactive UI", "warning");
				return;
			}

			// Step 1: discover skills
			const skills = discoverSkills(ctx.cwd);
			if (skills.length === 0) {
				ctx.ui.notify(
					"No skills found.\n\n" +
					"Looked in:\n" +
					`  • ${join(ctx.cwd, ".pi/skills/")}  (project)\n` +
					`  • ~/.pi/agent/skills/                 (global)\n\n` +
					"Build a skill with `brunnr eitri`, then re-run /optimize.",
					"warning",
				);
				return;
			}

			// Step 2: pick skill
			const skillItems = skills.map(s => ({
				value: s.path,
				label: s.name + (s.scope === "global" ? "  (global)" : ""),
				description: s.path,
			}));
			const skillPath = await pickFromList(ctx, skillItems);
			if (!skillPath) return;

			const skill = skills.find(s => s.path === skillPath);
			if (!skill) {
				ctx.ui.notify("Internal error: picked skill not found in inventory", "error");
				return;
			}

			// Step 3: enforce git-repo requirement (matches the optimizer agents' preflight)
			const repoRoot = gitRepoRoot(skillPath);
			if (!repoRoot) {
				ctx.ui.notify(
					`The skill at ${skillPath} is not inside a git repo.\n` +
					"Experiment branches need somewhere to live. Run `git init && git add . && git commit` in the project root first, then retry.",
					"error",
				);
				return;
			}

			// Step 4: pick action — depends on whether evals exist.
			// Multi-skill projects use per-skill eval files; see resolveEvalFile.
			const { path: evalFile, exists: hasEvals } = resolveEvalFile(ctx.cwd, skill.name);

			const actionItems: { value: string; label: string; description?: string }[] = hasEvals
				? [
					{ value: "pipeline",  label: "Run optimization pipeline",     description: "hill-climb → GEPA → compaction" },
					{ value: "gen-evals", label: "Regenerate evals",              description: `overwrites ${evalFile}` },
					{ value: "resume",    label: "Resume an interrupted run",    description: "detect from existing branches" },
				]
				: [
					{ value: "gen-evals", label: "Generate evals first",          description: `writes ${evalFile} — review before optimizing` },
					{ value: "pipeline",  label: "Run pipeline anyway (without evals — will fail at preflight)", description: "not recommended" },
				];

			const action = await pickFromList(ctx, actionItems);
			if (!action) return;

			// Step 5: dispatch via sendUserMessage
			if (action === "gen-evals") {
				if (!ctx.isIdle()) {
					ctx.ui.notify("Agent is busy — wait for the current turn to finish, then re-run /optimize", "warning");
					return;
				}
				// Arm the post-gen-evals auto-commit. We snapshot whether the
				// eval file exists pre-dispatch so we only commit a freshly-
				// generated file, never a pre-existing one the user may have
				// edited locally.
				pendingGenEvalsCommit = {
					evalFile,
					skillName: skill.name,
					fileExistedAtDispatch: existsSync(evalFile),
					armedAt: Date.now(),
					repoRoot,
				};
				pi.sendUserMessage(`/gen-evals\n  SKILL_PATH=${skillPath}\n  EVAL_OUTPUT=${evalFile}`);
				return;
			}

			if (action === "resume") {
				// Find existing autoresearch-skill/* branches in the repo
				let branches: string[] = [];
				try {
					branches = execSync(`git -C "${repoRoot}" for-each-ref --format='%(refname:short)' 'refs/heads/autoresearch-skill/*'`)
						.toString().split("\n").map(b => b.trim().replace(/^'|'$/g, "")).filter(Boolean);
				} catch { /* ignore */ }

				// Each pipeline epoch creates three branches with -stage1/-gepa/-compact suffix.
				// Group by EPOCH_TAG.
				const epochs = new Set<string>();
				for (const b of branches) {
					const m = b.match(/^autoresearch-skill\/(.+?)-(stage1|gepa|compact)$/);
					if (m) epochs.add(m[1]);
				}

				if (epochs.size === 0) {
					ctx.ui.notify("No interrupted runs detected (no autoresearch-skill/* branches with -stage1/-gepa/-compact suffixes in this repo).", "info");
					return;
				}

				const epochItems = [...epochs].sort().reverse().map(tag => ({
					value: tag,
					label: tag,
					description: branches.filter(b => b.startsWith(`autoresearch-skill/${tag}-`)).map(b => b.split("-").pop()).join(", "),
				}));

				const picked = await pickFromList(ctx, epochItems);
				if (!picked) return;

				if (!ctx.isIdle()) {
					ctx.ui.notify("Agent is busy — wait for the current turn to finish, then re-run /optimize", "warning");
					return;
				}
				pi.sendUserMessage(`/autoresearch-pipeline\n  SKILL=${skill.name}\n  EPOCH_TAG=${picked}\n  Resume.`);
				startProgressWatcher(ctx, repoRoot, skill.name);
				return;
			}

			if (action === "pipeline") {
				const budget = await pickBudget(ctx);
				if (budget === undefined) return;   // Esc on budget picker = abort dispatch

				const epochTag = `opt-${todayTag()}`;
				const lines = [
					`/autoresearch-pipeline`,
					`  SKILL=${skill.name}`,
					`  SKILL_PATH=${skillPath}`,
					`  EVAL_FILE=${evalFile}`,
					`  RUNS=3`,
					`  EPOCH_TAG=${epochTag}`,
					`  TARGET_PASS_RATE=95`,
				];
				if (budget.maxExperiments) lines.push(`  MAX_EXPERIMENTS=${budget.maxExperiments}`);
				if (budget.maxRuntime)     lines.push(`  MAX_RUNTIME=${budget.maxRuntime}`);

				if (!ctx.isIdle()) {
					ctx.ui.notify("Agent is busy — wait for the current turn to finish, then re-run /optimize", "warning");
					return;
				}
				pi.sendUserMessage(lines.join("\n"));
				// Begin live dashboard updates from the project's results.tsv. The
				// pipeline hasn't written it yet — the watcher tolerates that and
				// renders a "waiting" widget until the first experiment lands.
				const maxExp = budget.maxExperiments ? parseInt(budget.maxExperiments, 10) : undefined;
				startProgressWatcher(ctx, repoRoot, skill.name, maxExp);
				return;
			}
		},
	});
}
