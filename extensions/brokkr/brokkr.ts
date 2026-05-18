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
	}

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

	function stopProgressWatcher(): void {
		if (progressTimer) { clearInterval(progressTimer); progressTimer = undefined; }
		progressSnapshot = undefined;
		try { widgetCtx?.ui?.setWidget?.("brokkr-progress", undefined); } catch {}
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

		if (!snap) {
			const out = [top, pad(theme.fg("dim", "Brokkr · no run in progress"))];
			if (modelLine) out.push(pad(modelLine));
			out.push(bottom);
			return out;
		}

		const lines: string[] = [top];
		// Title row
		const title = theme.bold(theme.fg("accent", "Brokkr")) + theme.fg("dim", " · ") + theme.fg("text", snap.skillName);
		lines.push(pad(title));
		if (modelLine) lines.push(pad(modelLine));
		lines.push(pad(""));

		// Stage row
		const stageLabel: Record<string, string> = {
			stage1:  "Stage 1 · hill-climb",
			gepa:    "Stage 2 · GEPA reflection",
			compact: "Stage 3 · compaction",
		};
		const stageText = stageLabel[snap.stage] || (snap.stage || "Stage —");
		lines.push(pad(theme.fg("warning", stageText) + theme.fg("dim", `   experiments: ${snap.expCount}`)));

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

		// History strip (last 24 statuses, K/D/X/B color-coded)
		if (snap.history.length > 0) {
			lines.push(pad(""));
			const glyph: Record<string, string> = { keep: "K", baseline: "B", discard: "D", crash: "X" };
			const colored = snap.history.slice(-24).map(s => {
				const g = glyph[s] || "?";
				const c = statusColor[s] || "text";
				return theme.fg(c, g);
			}).join(" ");
			lines.push(pad(theme.fg("dim", "History: ") + colored));
		}

		// Stopped banner
		if (snap.stopped) {
			lines.push(pad(""));
			lines.push(pad(theme.bold(theme.fg("success", "✓ Pipeline finished — see chat for summary"))));
		}

		lines.push(bottom);
		return lines;
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
		let stoppedAnnounced = false;

		const tsvPath = join(repoRoot, "results.tsv");

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
				progressSnapshot = {
					skillName,
					stage: "",
					expCount: 0,
					latestExp: "—",
					latestTrain: "—",
					latestHoldout: "—",
					latestStatus: "waiting",
					history: [],
					trainSeries: [],
					holdoutSeries: [],
					totalTokens: 0,
					costEstimate: 0,
					elapsedSec: (Date.now() - startEpochMs) / 1000,
					maxExperiments,
					consecutiveDiscards: 0,
					stopped: false,
				};
				renderWidget();
				return;
			}
			let st: ReturnType<typeof statSync>;
			try { st = statSync(tsvPath); } catch { return; }

			// Stopped detection — the *only* time we don't bail on unchanged file is
			// when we want to flip stopped=true after the threshold passes.
			const unchangedMs = Date.now() - st.mtimeMs;
			const fileUnchanged = st.mtimeMs === progressLastMtime && st.size === progressLastSize;
			const shouldMarkStopped = fileUnchanged && progressSnapshot && progressSnapshot.expCount > 0 && unchangedMs >= STOPPED_THRESHOLD_MS && !progressSnapshot.stopped;

			if (fileUnchanged && !shouldMarkStopped) {
				// Still refresh elapsed/ETA-based fields on the existing snapshot so
				// the user sees elapsed clock advance even when no new experiment landed.
				if (progressSnapshot) {
					progressSnapshot.elapsedSec = (Date.now() - startEpochMs) / 1000;
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
			const elapsedSec = (Date.now() - startEpochMs) / 1000;
			let etaSec: number | undefined;
			if (maxExperiments && rows.length > 0 && rows.length < maxExperiments) {
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
				stopped: shouldMarkStopped || (progressSnapshot?.stopped ?? false),
			};
			renderWidget();

			// Completion notification — fire bell + chat notify once when we detect
			// the pipeline has wrapped up (no results.tsv changes for STOPPED_THRESHOLD_MS).
			if (shouldMarkStopped && !stoppedAnnounced) {
				stoppedAnnounced = true;
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
	});

	pi.on("session_shutdown", async () => {
		stopProgressWatcher();
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
