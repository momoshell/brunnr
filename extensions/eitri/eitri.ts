/**
 * Eitri — Meta-agent that builds Pi agents
 *
 * A team of domain-specific research experts (extensions, themes, skills,
 * settings, TUI) gather documentation and patterns. The primary agent
 * synthesizes their findings and WRITES the actual files.
 *
 * The query_experts tool supports two modes:
 *   parallel — all experts run as concurrent subprocesses (max 4 simultaneous)
 *   chain    — experts run sequentially; each question may reference {previous}
 *              to inject the prior expert's output
 *
 * Each expert fetches fresh Pi documentation via firecrawl on first query.
 * Experts are read-only researchers. The primary agent is the only writer.
 *
 * Experts are loaded from the directory bundled alongside this script
 * (`<script-dir>/agents/eitri/`). Eitri is not installed into Pi's
 * extension/agent search paths — it is invoked on-demand via `brunnr eitri`,
 * which runs `pi -e <BRUNNR_HOME>/extensions/eitri/eitri.ts`.
 *
 * Subprocesses honour ctx.signal — Esc cancels running experts cleanly
 * (SIGTERM → SIGKILL after 5s).
 *
 * Commands:
 *   /experts          — list available experts and their status
 *   /experts-grid N   — set dashboard column count (default 3)
 *
 * Usage: pi -e extensions/eitri.ts
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Named Eitri after the master dwarf smith — forger of Mjölnir, Draupnir,
 * and Gullinbursti — paired with brunnr (the well of wisdom that the
 * experts draw from).
 *
 * Features: ctx.signal abort handling (SIGTERM→SIGKILL), script-bundled
 * expert discovery, truncateHead helper for tool output, theme-token
 * border colours, promptSnippet/promptGuidelines, cached orchestrator
 * system prompt, chain mode with {previous} substitution, usage stats
 * accumulation, 4-way concurrency cap, malformed-expert warnings.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, parseFrontmatter } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { spawn } from "child_process";
import { readdirSync, readFileSync, existsSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "fs";
import { join, resolve, dirname, basename } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

// ── Types ────────────────────────────────────────

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

interface ExpertDef {
	name: string;
	description: string;
	tools: string;
	model?: string;
	provider?: string;
	thinkingLevel?: ThinkingLevel;
	systemPrompt: string;
	file: string;
}

const VALID_THINKING_LEVELS: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
function normalizeThinkingLevel(raw: string | undefined): ThinkingLevel | undefined {
	if (!raw) return undefined;
	const v = raw.trim().toLowerCase() as ThinkingLevel;
	return (VALID_THINKING_LEVELS as readonly string[]).includes(v) ? v : undefined;
}

interface ExpertState {
	def: ExpertDef;
	status: "idle" | "researching" | "done" | "error";
	question: string;
	elapsed: number;
	lastLine: string;
	queryCount: number;
	timer?: ReturnType<typeof setInterval>;
	totalUsage: ExpertUsage;
	lastStopReason?: string;
	lastErrorMessage?: string;
}

// Field names mirror pi 0.73.0's `message_end` event payload
// (`usage.input/output/cacheRead/cacheWrite`, `usage.cost.total`).
// The previous shape (`input_tokens`, flat `cost`) silently produced zeros.
interface ExpertUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
}

function emptyUsage(): ExpertUsage {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
}

function addUsage(a: ExpertUsage, b: ExpertUsage): ExpertUsage {
	return {
		input: a.input + b.input,
		output: a.output + b.output,
		cacheRead: a.cacheRead + b.cacheRead,
		cacheWrite: a.cacheWrite + b.cacheWrite,
		cost: a.cost + b.cost,
	};
}

// ── Helpers ──────────────────────────────────────

function displayName(name: string): string {
	return name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function parseAgentFile(filePath: string): ExpertDef | null {
	try {
		const raw = readFileSync(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(raw);
		if (!frontmatter?.name) return null;

		return {
			name: String(frontmatter.name),
			description: String(frontmatter.description || ""),
			tools: String(frontmatter.tools || "read,grep,find,ls"),
			model: frontmatter.model ? String(frontmatter.model) : undefined,
			provider: frontmatter.provider ? String(frontmatter.provider) : undefined,
			thinkingLevel: normalizeThinkingLevel(frontmatter.thinking ?? frontmatter.thinkingLevel),
			systemPrompt: (body || "").trim(),
			file: filePath,
		};
	} catch {
		return null;
	}
}

// Re-launch the same pi binary that's running the orchestrator. Spawning
// "pi" from $PATH risks running a different installation than the parent
// (different version, different auth state, missing entirely on minimal
// shells). Mirrors the canonical subagent example.
function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = (process as any).argv?.[1] as string | undefined;
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript) {
		try {
			if (existsSync(currentScript)) {
				return { command: process.execPath, args: [currentScript, ...args] };
			}
		} catch {}
	}
	const execName = basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}
	return { command: "pi", args };
}

// Long expert system prompts as inline argv risks E2BIG and quoting issues
// on some shells. Pi's --append-system-prompt accepts either text or a file
// path, so write the prompt to a private tempfile and pass the path.
function writePromptToTempFile(name: string, prompt: string): { dir: string; file: string } {
	const dir = mkdtempSync(join(tmpdir(), "eitri-expert-"));
	const safe = name.replace(/[^\w.-]+/g, "_");
	const file = join(dir, `prompt-${safe}.md`);
	writeFileSync(file, prompt, { encoding: "utf-8", mode: 0o600 });
	return { dir, file };
}

// Build a deterministic compaction summary from a session's branch entries.
// Pi's default compactor calls an LLM to summarize messagesToSummarize; for
// eitri sessions that's wasteful — most of the volume is `query_experts`
// tool results (5–50KB of expert response bodies) which we can drop entirely
// in favor of structured one-line records of what was queried, what was
// written, and the orchestrator's brief decisions. Result is a markdown
// string; pi stores it verbatim in the CompactionEntry.
//
// Walks the branch once and bins by content type. Untyped (`any`) so we
// don't have to pull in pi's full message type graph; field shape is
// validated defensively.
function buildEitriCompactionSummary(branchEntries: any[]): string {
	const fileWrites: string[] = [];
	const expertQueries: string[] = [];
	const decisions: string[] = [];
	let firstUserGoal: string | undefined;
	let finalizeSummary: string | undefined;
	let finalizeFiles: string[] = [];

	for (const entry of branchEntries) {
		if (entry?.type !== "message" || !entry.message) continue;
		const msg = entry.message;
		const role = msg.role;
		const content: any[] = Array.isArray(msg.content) ? msg.content : [];

		if (role === "user") {
			if (!firstUserGoal) {
				const t = content.find((p: any) => p?.type === "text")?.text;
				if (t) firstUserGoal = String(t).slice(0, 400).trim();
			}
			continue;
		}

		if (role === "assistant") {
			for (const block of content) {
				if (block?.type !== "toolCall") continue;
				const toolName = String(block.name || "");
				const args = (block.arguments || block.args || {}) as Record<string, any>;
				if ((toolName === "write" || toolName === "edit") && args.file_path) {
					const p = String(args.file_path);
					if (!fileWrites.includes(p)) fileWrites.push(p);
				} else if (toolName === "query_experts") {
					const queries: any[] = Array.isArray(args.queries) ? args.queries : [];
					const mode = String(args.mode || "parallel");
					const names = queries.map(x => String(x?.expert || "?")).filter(Boolean).join(", ");
					if (names) expertQueries.push(`${mode}: ${names}`);
				} else if (toolName === "finalize_build") {
					finalizeSummary = String(args.summary || "").trim() || undefined;
					finalizeFiles = Array.isArray(args.files_written)
						? args.files_written.map((f: any) => String(f))
						: [];
				}
			}
			for (const block of content) {
				if (block?.type !== "text" || typeof block.text !== "string") continue;
				const firstPara = block.text.split("\n\n")[0]?.trim();
				if (firstPara && firstPara.length > 0 && firstPara.length < 400) {
					decisions.push(firstPara);
				}
			}
			continue;
		}
		// Tool results, thinking blocks, custom messages: dropped — they're
		// the bulk we're shedding to keep the summary lean.
	}

	const lines: string[] = ["# Eitri session — compacted summary", ""];
	if (firstUserGoal) {
		lines.push("## Goal", firstUserGoal, "");
	}
	if (expertQueries.length) {
		lines.push("## Expert queries (chronological)");
		for (const q of expertQueries) lines.push(`- ${q}`);
		lines.push("");
	}
	const allFiles = Array.from(new Set([...fileWrites, ...finalizeFiles]));
	if (allFiles.length) {
		lines.push("## Files written / edited");
		for (const f of allFiles) lines.push(`- ${f}`);
		lines.push("");
	}
	if (decisions.length) {
		lines.push("## Recent decisions");
		// Last 8 to keep the summary load-bearing without bloat.
		for (const d of decisions.slice(-8)) lines.push(`- ${d}`);
		lines.push("");
	}
	lines.push("## Build status");
	lines.push(finalizeSummary
		? `✅ finalize_build called — ${finalizeSummary}`
		: "Build in progress (finalize_build not yet called).");

	return lines.join("\n");
}

// Match the brunnr/Pi catalog layout. Returns a short repo-relative tail
// (e.g. "agents/foo.md") if the path looks like a catalog write; undefined
// otherwise. Used to label sessions and gate frontmatter linting.
//
// Recognized shapes:
//   agents/<name>.md
//   prompts/<name>.md
//   skills/<name>/SKILL.md
//   extensions/<name>.ts                    (single-file extension)
//   extensions/<name>/<name>.ts             (directory-style extension)
//   themes/<name>.json
function detectCatalogTail(filePath: string): { tail: string; kind: "agent" | "prompt" | "skill" | "extension" | "theme" } | undefined {
	if (!filePath) return undefined;
	const parts = filePath.split("/").filter(p => p && p !== "." && p !== "..");
	if (parts.length < 2) return undefined;
	const last = parts[parts.length - 1];
	const prev = parts[parts.length - 2];
	const prev2 = parts[parts.length - 3];

	if (prev === "agents" && last.endsWith(".md")) return { tail: `agents/${last}`, kind: "agent" };
	if (prev === "prompts" && last.endsWith(".md")) return { tail: `prompts/${last}`, kind: "prompt" };
	if (last === "SKILL.md" && prev2 === "skills") return { tail: `skills/${prev}/${last}`, kind: "skill" };
	if (prev === "extensions" && last.endsWith(".ts")) return { tail: `extensions/${last}`, kind: "extension" };
	if (prev2 === "extensions" && last.endsWith(".ts")) return { tail: `extensions/${prev}/${last}`, kind: "extension" };
	if (prev === "themes" && last.endsWith(".json")) return { tail: `themes/${last}`, kind: "theme" };
	return undefined;
}

// ── Expert card palette ───────────────────────────
// Each expert gets a distinct theme token for its border, hashed by name so
// a given expert is always the same colour but the colours come from the
// active theme — the previous version baked RGB triplets into raw ANSI
// escapes and ignored the user's theme entirely.
const EXPERT_PALETTE = [
	"syntaxKeyword",
	"syntaxFunction",
	"syntaxString",
	"syntaxNumber",
	"syntaxType",
	"syntaxOperator",
	"syntaxVariable",
	"syntaxComment",
	"syntaxPunctuation",
];

function paletteToken(name: string): string {
	let h = 0;
	for (let i = 0; i < name.length; i++) {
		h = (h * 31 + name.charCodeAt(i)) >>> 0;
	}
	return EXPERT_PALETTE[h % EXPERT_PALETTE.length];
}

// Custom braille spinner used while any expert is researching. Pi's default
// indicator just signals "the orchestrator is streaming", which understates
// the work — eitri may have 4 subprocess pi's grinding in parallel.
const EITRI_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// Slash-prompt template registered via `resources_discover`. Lets the user
// type `/eitri-help` mid-session to re-orient — useful after compaction or
// when the session has drifted off-topic. {{EXPERT_COUNT}} / {{EXPERT_NAMES}}
// substitution happens at discover time so the prompt reflects experts
// loaded right now, not at extension boot.
const EITRI_HELP_PROMPT_TEMPLATE = `---
description: Eitri workflow reference — when to query experts, how to finalize a build, how to tune experts.
---

# Eitri quick reference

You're using **eitri**, a meta-agent that builds Pi components (extensions, themes, skills, prompts, agents). It coordinates a team of {{EXPERT_COUNT}} domain experts and synthesizes their findings into working code.

## Available experts
{{EXPERT_NAMES}}

## Workflow

### 1. Research (parallel)
Call \`query_experts\` with an array of \`{ expert, question }\`:
- Mode \`parallel\` (default): all queries run as concurrent pi subprocesses (cap 4 at a time).
- Mode \`chain\`: sequential; each question may reference \`{previous}\` to inject the prior expert's full output.
- Ask **specific** questions — "How do I register a custom tool with renderCall?", not "Tell me about extensions".

### 2. Build
Synthesize findings, write the actual files (use read/write/edit/bash/grep/find/ls).

### 3. Finalize
Call \`finalize_build\` **exactly once** as your final action with:
- \`summary\`: 1–3 sentences on what was shipped.
- \`files_written\`: every file created or modified (repo-relative).
- \`next_steps\` (optional): follow-ups for the user.

The session terminates cleanly after finalize_build — no extra assistant turn.

## Tuning experts (advanced)

Experts can pin their own preset via frontmatter:

\`\`\`
---
name: my-expert
model: openai/gpt-5.2-codex      # optional pi "provider/id" form
provider: openai                 # optional explicit override
thinking: high                   # off | minimal | low | medium | high | xhigh
tools: read,grep,find,ls
---
\`\`\`

Defaults: orchestrator's model + \`thinking: off\`.

## Commands

- \`/experts\` — list experts and their state
- \`/experts-grid <1–5>\` — set the dashboard column count
- \`/eitri-help\` — re-display this reference

## Optional

- \`BRUNNR_LINT=1\` — block writes of catalog \`.md\` files (agents/prompts/skills) that lack \`name\`/\`description\` frontmatter. Off by default.
- \`BRUNNR_COMPACT_EITRI=1\` — replace pi's LLM-driven compaction with a deterministic summary (preserves goal, expert queries, file writes, recent decisions, build status). Free and predictable; off by default.
- Sessions auto-name themselves on the first successful catalog write (e.g. \`eitri: agents/foo.md\`). Existing names are never overwritten.
`;

// ── Extension ────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const experts: Map<string, ExpertState> = new Map();
	let gridCols = 3;
	let widgetCtx: any;

	// Cached rendered orchestrator system prompt — invalidated whenever
	// experts are reloaded. Avoids re-reading + re-templating on every turn.
	let cachedSystemPrompt: string | undefined;
	let cachedOrchestratorPath: string | undefined;

	// Tempdir for the eitri-help.md slash-prompt (registered via
	// resources_discover). Created lazily on first discover, cleaned up on
	// session_shutdown. Per-session so concurrent sessions don't trample.
	let helpPromptDir: string | undefined;

	// Theme the user had selected before eitri auto-switched to "snow" on
	// session_start. Restored in session_shutdown. Undefined if the switch
	// didn't happen (snow unavailable, no UI ctx, or setTheme returned !success).
	let previousThemeName: string | undefined;

	// Experts live next to this script: <script-dir>/agents/eitri/. Eitri
	// is invoked on-demand via `brunnr eitri` (which runs `pi -e <abs-path>`),
	// so import.meta.url resolves to the real on-disk location.
	function bundledExpertsDir(): string {
		return join(dirname(fileURLToPath(import.meta.url)), "agents", "eitri");
	}

	function findOrchestratorPath(): string | undefined {
		const p = join(bundledExpertsDir(), "eitri-orchestrator.md");
		return existsSync(p) ? p : undefined;
	}

	function loadExpertsFromDir(dir: string, ctx: ExtensionContext): void {
		if (!existsSync(dir)) return;
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch (err) {
			if (ctx.hasUI) ctx.ui.notify(`Eitri: cannot read ${dir} — ${(err as Error).message}`, "warning");
			return;
		}
		for (const file of entries) {
			if (!file.endsWith(".md")) continue;
			if (file === "eitri-orchestrator.md") continue;
			const fullPath = resolve(dir, file);
			const def = parseAgentFile(fullPath);
			if (!def) {
				if (ctx.hasUI) ctx.ui.notify(`Eitri: skipping malformed expert ${fullPath} (missing 'name' frontmatter or invalid format)`, "warning");
				continue;
			}
			const key = def.name.toLowerCase();
			experts.set(key, {
				def,
				status: "idle",
				question: "",
				elapsed: 0,
				lastLine: "",
				queryCount: 0,
				totalUsage: emptyUsage(),
			});
		}
	}

	async function loadExperts(ctx: ExtensionContext): Promise<void> {
		experts.clear();
		cachedSystemPrompt = undefined;
		loadExpertsFromDir(bundledExpertsDir(), ctx);
		cachedOrchestratorPath = findOrchestratorPath();
	}

	// ── Grid Rendering ───────────────────────────

	function renderCard(state: ExpertState, colWidth: number, theme: any): string[] {
		const w = colWidth - 2;
		const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max - 3) + "..." : s;

		const statusColor = state.status === "idle" ? "dim"
			: state.status === "researching" ? "accent"
			: state.status === "done" ? "success" : "error";
		const statusIcon = state.status === "idle" ? "○"
			: state.status === "researching" ? "◉"
			: state.status === "done" ? "✓" : "✗";

		const name = displayName(state.def.name);
		const nameStr = theme.fg("accent", theme.bold(truncate(name, w)));
		const nameVisible = Math.min(name.length, w);

		const statusStr = `${statusIcon} ${state.status}`;
		const timeStr = state.status !== "idle" ? ` ${Math.round(state.elapsed / 1000)}s` : "";
		const queriesStr = state.queryCount > 0 ? ` (${state.queryCount})` : "";
		const statusLine = theme.fg(statusColor, statusStr + timeStr + queriesStr);
		const statusVisible = statusStr.length + timeStr.length + queriesStr.length;

		const workRaw = state.question || state.def.description;
		const workText = truncate(workRaw, Math.min(50, w - 1));
		const workLine = theme.fg("muted", workText);
		const workVisible = workText.length;

		const lastRaw = state.lastLine || "";
		const lastText = truncate(lastRaw, Math.min(50, w - 1));
		const lastLineRendered = lastText ? theme.fg("dim", lastText) : theme.fg("dim", "—");
		const lastVisible = lastText ? lastText.length : 1;

		// Border drawn in a theme syntax-* token; per-expert hue is derived
		// from the expert name so the choice is stable but the actual colour
		// comes from the user's active theme. Card interior is uncoloured —
		// previous version had raw RGB backgrounds that fought every theme.
		const token = paletteToken(state.def.name);
		const bord = (s: string) => theme.fg(token, s);

		const top = "┌" + "─".repeat(w) + "┐";
		const bot = "└" + "─".repeat(w) + "┘";

		const border = (content: string, visLen: number) => {
			const pad = " ".repeat(Math.max(0, w - visLen));
			return bord("│") + content + pad + bord("│");
		};

		return [
			bord(top),
			border(" " + nameStr, 1 + nameVisible),
			border(" " + statusLine, 1 + statusVisible),
			border(" " + workLine, 1 + workVisible),
			border(" " + lastLineRendered, 1 + lastVisible),
			bord(bot),
		];
	}

	// Toggle a custom braille spinner whenever any expert is mid-research,
	// then restore pi's default once everyone's idle. Receives the orchestrator
	// ctx (which is what tool-call ctx surfaces); falls back silently if the
	// running pi build doesn't expose setWorkingIndicator.
	function applyWorkingIndicator(ctx: any): void {
		const setIndicator = ctx?.ui?.setWorkingIndicator;
		if (typeof setIndicator !== "function") return;
		const active = Array.from(experts.values()).filter(e => e.status === "researching").length;
		if (active === 0) {
			ctx.ui.setWorkingIndicator(undefined); // restore default
			return;
		}
		ctx.ui.setWorkingIndicator({
			frames: EITRI_SPINNER_FRAMES,
			intervalMs: 80,
		});
	}

	function updateWidget() {
		if (!widgetCtx) return;

		widgetCtx.ui.setWidget("eitri-grid", (_tui: any, theme: any) => {

			return {
				render(width: number): string[] {
					if (experts.size === 0) {
						return ["", theme.fg("dim", "  No experts found. Add agent .md files next to eitri.ts in agents/eitri/")];
					}

					const cols = Math.min(gridCols, experts.size);
					const gap = 1;
					// avoid Text component's ANSI-width miscounting by returning raw lines
					const colWidth = Math.floor((width - gap * (cols - 1)) / cols) - 1;
					const allExperts = Array.from(experts.values());

					const lines: string[] = [""]; // top margin

					for (let i = 0; i < allExperts.length; i += cols) {
						const rowExperts = allExperts.slice(i, i + cols);
						const cards = rowExperts.map(e => renderCard(e, colWidth, theme));

						while (cards.length < cols) {
							cards.push(Array(6).fill(" ".repeat(colWidth)));
						}

						const cardHeight = cards[0].length;
						for (let line = 0; line < cardHeight; line++) {
							lines.push(cards.map(card => card[line] || "").join(" ".repeat(gap)));
						}
					}

					return lines;
				},
				invalidate() {},
			};
		});
	}

	// ── Query Expert ─────────────────────────────

	// Pull token + cost counters off a `message_end` payload. Pi 0.73.0 emits:
	//   usage: { input, output, cacheRead, cacheWrite, totalTokens,
	//            cost: { input, output, cacheRead, cacheWrite, total } }
	// The previous shape (`input_tokens`, flat numeric `cost`) was pre-0.73
	// and silently produced zeros against current pi.
	function extractUsageFromMessage(msg: any): ExpertUsage | undefined {
		const u = msg?.usage;
		if (!u || typeof u !== "object") return undefined;
		const cost = typeof u.cost === "object"
			? Number(u.cost?.total ?? 0)
			: Number(u.cost ?? 0);
		return {
			input: Number(u.input ?? u.input_tokens ?? u.inputTokens ?? 0),
			output: Number(u.output ?? u.output_tokens ?? u.outputTokens ?? 0),
			cacheRead: Number(u.cacheRead ?? u.cache_read_input_tokens ?? u.cacheReadInputTokens ?? 0),
			cacheWrite: Number(u.cacheWrite ?? u.cache_creation_input_tokens ?? u.cacheCreationInputTokens ?? 0),
			cost: isNaN(cost) ? 0 : cost,
		};
	}

	function getAssistantText(msg: any): string {
		if (!msg || !Array.isArray(msg.content)) return "";
		return msg.content
			.filter((p: any) => p?.type === "text" && typeof p.text === "string")
			.map((p: any) => p.text)
			.join("\n");
	}

	function getAssistantToolCalls(msg: any): { name: string; args: any }[] {
		if (!msg || !Array.isArray(msg.content)) return [];
		return msg.content
			.filter((p: any) => p?.type === "toolCall")
			.map((p: any) => ({ name: p.name, args: p.arguments || p.args || {} }));
	}

	interface QueryResult {
		output: string;        // full assistant text concatenated across turns
		exitCode: number;
		elapsed: number;
		usage: ExpertUsage;
		stopReason?: string;
		errorMessage?: string;
		model?: string;
	}

	function queryExpert(
		expertName: string,
		question: string,
		ctx: any,
		signal: AbortSignal | undefined,
	): Promise<QueryResult> {
		const key = expertName.toLowerCase();
		const state = experts.get(key);
		if (!state) {
			return Promise.resolve({
				output: `Expert "${expertName}" not found. Available: ${Array.from(experts.values()).map(s => s.def.name).join(", ")}`,
				exitCode: 1,
				elapsed: 0,
				usage: emptyUsage(),
			});
		}

		if (state.status === "researching") {
			return Promise.resolve({
				output: `Expert "${displayName(state.def.name)}" is already researching. Wait for it to finish.`,
				exitCode: 1,
				elapsed: 0,
				usage: emptyUsage(),
			});
		}

		state.status = "researching";
		state.question = question;
		state.elapsed = 0;
		state.lastLine = "";
		state.lastStopReason = undefined;
		state.lastErrorMessage = undefined;
		state.queryCount++;
		updateWidget();
		applyWorkingIndicator(ctx);

		const startTime = Date.now();
		state.timer = setInterval(() => {
			state.elapsed = Date.now() - startTime;
			updateWidget();
		}, 1000);

		// Per-expert config layers:
		//   provider: explicit frontmatter > derived from "provider/id" model > ctx.model > unset
		//   model:    explicit frontmatter > ctx.model "provider/id" > fallback
		//   thinking: explicit frontmatter > "off" (cheap default for research)
		// Letting an expert pin its own preset means heavyweight reasoners
		// (e.g. pattern-expert) can run on Opus + xhigh while scout-style
		// experts run on Haiku + off in the same eitri session.
		const explicitProvider = state.def.provider;
		const modelArg = state.def.model
			? state.def.model
			: ctx.model
				? `${ctx.model.provider}/${ctx.model.id}`
				: "openrouter/google/gemini-3-flash-preview";
		const thinkingArg = state.def.thinkingLevel ?? "off";

		const args: string[] = [
			"--mode", "json",
			"-p",
			"--no-session",
			"--no-extensions",
		];
		if (explicitProvider) args.push("--provider", explicitProvider);
		args.push("--model", modelArg);
		args.push("--tools", state.def.tools);
		args.push("--thinking", thinkingArg);

		// Write the system prompt to a private tempfile and pass the path —
		// avoids E2BIG / shell-quoting hazards for long expert prompts. Pi's
		// --append-system-prompt accepts text or a file path.
		let promptTmp: { dir: string; file: string } | undefined;
		if (state.def.systemPrompt && state.def.systemPrompt.trim()) {
			try {
				promptTmp = writePromptToTempFile(state.def.name, state.def.systemPrompt);
				args.push("--append-system-prompt", promptTmp.file);
			} catch {
				// Fall back to inline if the tempfile write fails.
				args.push("--append-system-prompt", state.def.systemPrompt);
			}
		}
		args.push(question);

		const textParts: string[] = [];
		let runUsage = emptyUsage();
		let stopReason: string | undefined;
		let errorMessage: string | undefined;
		let resolvedModel: string | undefined;
		let stderrBuf = "";

		return new Promise<QueryResult>((resolve) => {
			const invocation = getPiInvocation(args);
			const proc = spawn(invocation.command, invocation.args, {
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env },
			});

			// Abort: SIGTERM then SIGKILL after 5s — mirrors the canonical
			// subagent extension. Without this, Esc leaves subprocesses running.
			let killTimer: ReturnType<typeof setTimeout> | undefined;
			const onAbort = () => {
				if (proc.killed) return;
				try { proc.kill("SIGTERM"); } catch {}
				killTimer = setTimeout(() => {
					if (!proc.killed) {
						try { proc.kill("SIGKILL"); } catch {}
					}
				}, 5000);
			};
			if (signal) {
				if (signal.aborted) onAbort();
				else signal.addEventListener("abort", onAbort, { once: true });
			}

			let buffer = "";

			const handleEvent = (event: any) => {
				// Authoritative source for this turn: pi 0.73.0's message_end
				// payload. Older streaming text_delta events are absent on this
				// version, so listening only for those produced empty output.
				if (event.type === "message_end" && event.message?.role === "assistant") {
					const msg = event.message;
					const text = getAssistantText(msg);
					if (text) {
						textParts.push(text);
						const lastTextLine = text.split("\n").filter((l: string) => l.trim()).pop();
						if (lastTextLine) state.lastLine = lastTextLine;
					} else {
						// No text this turn — show the latest tool call as progress.
						const calls = getAssistantToolCalls(msg);
						const last = calls[calls.length - 1];
						if (last) state.lastLine = `→ ${last.name}`;
					}

					const u = extractUsageFromMessage(msg);
					if (u) runUsage = addUsage(runUsage, u);
					if (msg.stopReason) stopReason = msg.stopReason;
					if (msg.errorMessage) errorMessage = msg.errorMessage;
					if (msg.model && !resolvedModel) resolvedModel = msg.model;
					updateWidget();
					return;
				}

				// Tool result content can be useful as a "what's happening now"
				// signal in the grid widget while the run continues.
				if (event.type === "tool_result_end" && event.message) {
					const m = event.message;
					if (Array.isArray(m.content)) {
						const firstResult = m.content.find((p: any) => p?.type === "toolResult");
						const preview = (firstResult?.output || firstResult?.content || "").toString().split("\n").find((l: string) => l.trim());
						if (preview) state.lastLine = preview.slice(0, 80);
						updateWidget();
					}
					return;
				}

				// Best-effort: if a future/older pi version emits incremental
				// text deltas, surface them in the live grid. Not authoritative.
				if (event.type === "message_update") {
					const delta = event.assistantMessageEvent;
					if (delta?.type === "text_delta" && typeof delta.delta === "string") {
						const last = delta.delta.split("\n").filter((l: string) => l.trim()).pop();
						if (last) {
							state.lastLine = last;
							updateWidget();
						}
					}
				}
			};

			proc.stdout!.setEncoding("utf-8");
			proc.stdout!.on("data", (chunk: string) => {
				buffer += chunk;
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) {
					if (!line.trim()) continue;
					try { handleEvent(JSON.parse(line)); } catch {}
				}
			});

			proc.stderr!.setEncoding("utf-8");
			proc.stderr!.on("data", (chunk: string) => { stderrBuf += chunk; });

			proc.on("close", (code) => {
				if (buffer.trim()) {
					try { handleEvent(JSON.parse(buffer)); } catch {}
				}
				if (killTimer) clearTimeout(killTimer);
				if (signal) signal.removeEventListener("abort", onAbort);
				if (promptTmp) {
					try { unlinkSync(promptTmp.file); } catch {}
					try { rmdirSync(promptTmp.dir); } catch {}
				}

				clearInterval(state.timer);
				state.elapsed = Date.now() - startTime;
				const fullOutput = textParts.join("\n");

				// An expert "succeeded" only if the process exited 0 AND the
				// model's last turn didn't stop in error/aborted state. Without
				// this, a 400 from the API surfaces as a green ✓ with no body.
				const isError = (code !== 0) || stopReason === "error" || stopReason === "aborted";
				state.status = isError ? "error" : "done";
				state.totalUsage = addUsage(state.totalUsage, runUsage);
				state.lastStopReason = stopReason;
				state.lastErrorMessage = errorMessage;

				if (isError && errorMessage) {
					state.lastLine = `${stopReason || "error"}: ${errorMessage.slice(0, 80)}`;
				} else if (!state.lastLine && fullOutput) {
					const last = fullOutput.split("\n").filter((l: string) => l.trim()).pop();
					if (last) state.lastLine = last;
				}
				updateWidget();
				applyWorkingIndicator(ctx);

				// Suppress per-expert toasts on cancel — user just hit Esc, no
				// need to follow up with N "expert error" notifications.
				if (!signal?.aborted) {
					ctx.ui.notify(
						`${displayName(state.def.name)} ${state.status} in ${Math.round(state.elapsed / 1000)}s` +
							(isError && errorMessage ? ` — ${errorMessage}` : ""),
						state.status === "done" ? "success" : "error",
					);
				}

				// On error, prefer the explicit errorMessage over an empty body
				// so callers don't see a phantom "(no output)".
				const output = isError && errorMessage
					? `[${stopReason || "error"}] ${errorMessage}${stderrBuf ? `\n\n--- stderr ---\n${stderrBuf.trim()}` : ""}`
					: fullOutput;

				resolve({
					output,
					exitCode: code ?? (isError ? 1 : 0),
					elapsed: state.elapsed,
					usage: runUsage,
					stopReason,
					errorMessage,
					model: resolvedModel,
				});
			});

			proc.on("error", (err) => {
				if (killTimer) clearTimeout(killTimer);
				if (signal) signal.removeEventListener("abort", onAbort);
				if (promptTmp) {
					try { unlinkSync(promptTmp.file); } catch {}
					try { rmdirSync(promptTmp.dir); } catch {}
				}
				clearInterval(state.timer);
				state.status = "error";
				state.lastLine = `Error: ${err.message}`;
				state.lastErrorMessage = err.message;
				updateWidget();
				applyWorkingIndicator(ctx);
				resolve({
					output: `Error spawning expert: ${err.message}`,
					exitCode: 1,
					elapsed: Date.now() - startTime,
					usage: runUsage,
					stopReason: "error",
					errorMessage: err.message,
				});
			});
		});
	}

	// ── query_experts Tool (parallel) ───────────

	pi.registerTool({
		name: "query_experts",
		label: "Query Experts",
		description:
`Query Pi domain experts (extensions, themes, skills, settings, TUI, prompts, agents, keybindings, CLI) for fresh documentation and patterns.

Modes:
  parallel (default) — run all queries simultaneously as concurrent subprocesses
  chain              — run sequentially; substitute {previous} in each question with the prior expert's output

Each query specifies an expert name and a specific question. Ask about WHAT to build, not WHETHER to build it.`,

		promptSnippet: "query_experts — ask Pi documentation experts in parallel or chain to gather fresh docs and patterns before building.",

		promptGuidelines: [
			"Use query_experts for any Pi-specific implementation question — the experts fetch fresh upstream docs each session.",
			"Prefer mode='parallel' when queries are independent; switch to mode='chain' when one expert's output should inform the next (use the {previous} placeholder).",
			"Pose specific questions like 'How do I register a tool with renderCall?', not 'tell me about extensions'.",
		],

		parameters: Type.Object({
			mode: Type.Optional(Type.String({
				description: "'parallel' (default) runs queries simultaneously. 'chain' runs them sequentially, substituting {previous} in each question with the prior expert's output.",
			})),
			queries: Type.Array(
				Type.Object({
					expert: Type.String({
						description: "Expert name. Typical Eitri roster: ext-expert, theme-expert, skill-expert, config-expert, tui-expert, prompt-expert, agent-expert, keybinding-expert, cli-expert.",
					}),
					question: Type.String({
						description: "Specific question. In chain mode, may include {previous} which is replaced with the prior expert's full output.",
					}),
				}),
				{ description: "Queries to run. Order matters in chain mode." },
			),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const { queries, mode } = params as {
				queries: { expert: string; question: string }[];
				mode?: string;
			};
			const runMode: "parallel" | "chain" = mode === "chain" ? "chain" : "parallel";

			if (!queries || queries.length === 0) {
				return {
					content: [{ type: "text", text: "No queries provided." }],
					details: { results: [], status: "error" },
				};
			}

			const names = queries.map(q => displayName(q.expert)).join(", ");
			if (onUpdate) {
				onUpdate({
					content: [{ type: "text", text: `Querying ${queries.length} experts (${runMode}): ${names}` }],
					details: { queries, mode: runMode, status: "researching", results: [] },
				});
			}

			type RunResult = {
				expert: string;
				question: string;
				status: "done" | "error";
				elapsed: number;
				exitCode: number;
				output: string;
				fullOutput: string;
				truncated: boolean;
				outputBytes: number;
				totalBytes: number;
				usage: ExpertUsage;
				stopReason?: string;
				errorMessage?: string;
				model?: string;
			};

			const buildRunResult = (
				query: { expert: string; question: string },
				raw: QueryResult,
			): RunResult => {
				const trunc = truncateHead(raw.output, {
					maxLines: DEFAULT_MAX_LINES,
					maxBytes: DEFAULT_MAX_BYTES,
				});
				// Treat model-side error/aborted stops as failures even if pi
				// itself exited 0 — the canonical subagent example does the same.
				const isError = raw.exitCode !== 0
					|| raw.stopReason === "error"
					|| raw.stopReason === "aborted";
				return {
					expert: query.expert,
					question: query.question,
					status: isError ? "error" : "done",
					elapsed: raw.elapsed,
					exitCode: raw.exitCode,
					output: trunc.content,
					fullOutput: raw.output,
					truncated: trunc.truncated,
					outputBytes: trunc.outputBytes,
					totalBytes: trunc.totalBytes,
					usage: raw.usage,
					stopReason: raw.stopReason,
					errorMessage: raw.errorMessage,
					model: raw.model,
				};
			};

			const errorResult = (
				query: { expert: string; question: string },
				message: string,
			): RunResult => ({
				expert: query.expert,
				question: query.question,
				status: "error",
				elapsed: 0,
				exitCode: 1,
				output: message,
				fullOutput: "",
				truncated: false,
				outputBytes: 0,
				totalBytes: 0,
				usage: emptyUsage(),
				stopReason: "error",
				errorMessage: message,
			});

			let results: RunResult[] = [];

			if (runMode === "chain") {
				// Sequential: each query may reference {previous} to inject the
				// prior expert's full (untruncated) output. Halt on first failure.
				let previous = "";
				let halted = false;
				for (const q of queries) {
					if (halted || signal?.aborted) {
						results.push(errorResult(q, halted
							? "Skipped — earlier step in chain failed."
							: "Cancelled before this expert ran."));
						continue;
					}
					const question = q.question.replace(/\{previous\}/g, previous);
					try {
						const raw = await queryExpert(q.expert, question, ctx, signal);
						const r = buildRunResult({ expert: q.expert, question }, raw);
						results.push(r);
						if (r.status !== "done") halted = true;
						else previous = raw.output;
					} catch (err) {
						results.push(errorResult({ expert: q.expert, question }, `Error: ${(err as Error).message}`));
						halted = true;
					}
				}
			} else {
				// Parallel with concurrency cap. Bare allSettled fanned out N at
				// once; canonical subagent caps at 4 simultaneous to keep the
				// terminal readable and not flood the API.
				const MAX_CONCURRENT = 4;
				const out = new Array<RunResult>(queries.length);
				let nextIndex = 0;

				const runOne = async (): Promise<void> => {
					while (nextIndex < queries.length) {
						const i = nextIndex++;
						const q = queries[i];
						if (signal?.aborted) {
							out[i] = errorResult(q, "Cancelled.");
							continue;
						}
						try {
							const raw = await queryExpert(q.expert, q.question, ctx, signal);
							out[i] = buildRunResult(q, raw);
						} catch (err) {
							out[i] = errorResult(q, `Error: ${(err as Error).message}`);
						}
					}
				};

				const workers: Promise<void>[] = [];
				for (let i = 0; i < Math.min(MAX_CONCURRENT, queries.length); i++) {
					workers.push(runOne());
				}
				await Promise.all(workers);
				results = out;
			}

			const totalUsage = results.reduce((acc, r) => addUsage(acc, r.usage), emptyUsage());

			const sections = results.map(r => {
				const icon = r.status === "done" ? "✓" : "✗";
				const truncNote = r.truncated
					? `\n\n*[output truncated: showing ${r.outputBytes} of ${r.totalBytes} bytes — full output stored in tool result details]*`
					: "";
				const errLine = r.status === "error" && r.errorMessage
					? `\n\n**Error (${r.stopReason || "exit " + r.exitCode}):** ${r.errorMessage}`
					: "";
				return `## [${icon}] ${displayName(r.expert)} (${Math.round(r.elapsed / 1000)}s)${errLine}\n\n${r.output}${truncNote}`;
			});

			return {
				content: [{ type: "text", text: sections.join("\n\n---\n\n") }],
				details: {
					results,
					mode: runMode,
					totalUsage,
					status: results.every(r => r.status === "done") ? "done" : "partial",
				},
			};
		},

		renderCall(args, theme) {
			const a = args as any;
			const queries = a.queries || [];
			const mode: "parallel" | "chain" = a.mode === "chain" ? "chain" : "parallel";
			const names = queries.map((q: any) => displayName(q.expert || "?")).join(", ");
			return new Text(
				theme.fg("toolTitle", theme.bold("query_experts ")) +
				theme.fg("accent", `${queries.length} ${mode}`) +
				theme.fg("dim", " — ") +
				theme.fg("muted", names),
				0, 0,
			);
		},

		renderResult(result, options, theme) {
			const details = result.details as any;
			if (!details?.results) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (options.isPartial || details.status === "researching") {
				const count = details.queries?.length || "?";
				const mode = details.mode === "chain" ? "in chain" : "in parallel";
				return new Text(
					theme.fg("accent", `◉ ${count} experts`) +
					theme.fg("dim", ` researching ${mode}...`),
					0, 0,
				);
			}

			const lines = (details.results as any[]).map((r: any) => {
				const icon = r.status === "done" ? "✓" : "✗";
				const color = r.status === "done" ? "success" : "error";
				const elapsed = typeof r.elapsed === "number" ? Math.round(r.elapsed / 1000) : 0;
				return theme.fg(color, `${icon} ${displayName(r.expert)}`) +
					theme.fg("dim", ` ${elapsed}s`);
			});

			const totalUsage = details.totalUsage as ExpertUsage | undefined;
			const usageStr = totalUsage && (totalUsage.input || totalUsage.output || totalUsage.cost)
				? theme.fg("dim", ` · ↑${totalUsage.input} ↓${totalUsage.output}` +
					(totalUsage.cacheRead ? ` R${totalUsage.cacheRead}` : "") +
					(totalUsage.cacheWrite ? ` W${totalUsage.cacheWrite}` : "") +
					(totalUsage.cost ? ` $${totalUsage.cost.toFixed(4)}` : ""))
				: "";

			const header = lines.join(theme.fg("dim", " · ")) + usageStr;

			if (options.expanded && details.results) {
				const expanded = (details.results as any[]).map((r: any) => {
					// Prefer the already-truncated `output` for display; fullOutput
					// is preserved in details for downstream/programmatic access.
					const body = r.output || "";
					const errHeader = r.status === "error" && r.errorMessage
						? "\n" + theme.fg("error", `[${r.stopReason || "error"}] ${r.errorMessage}`) + "\n"
						: "";
					return theme.fg("accent", `── ${displayName(r.expert)} ──`) + errHeader + "\n" + theme.fg("muted", body);
				});
				return new Text(header + "\n\n" + expanded.join("\n\n"), 0, 0);
			}

			return new Text(header, 0, 0);
		},
	});

	// ── finalize_build Tool ─────────────────────

	// Terminating tool for the orchestrator's final action of a build session.
	// Setting `terminate: true` lets pi end after this tool result without
	// paying for an extra LLM follow-up turn — net savings: one assistant
	// round-trip per build. Pattern: examples/extensions/structured-output.ts.
	pi.registerTool({
		name: "finalize_build",
		label: "Finalize Build",
		description:
`Emit the FINAL summary of a build session and terminate the turn. Call this exactly once, as your last action, after every file is written and verified.

Use this for any build path — extensions, themes, skills, prompts, agents — and include the full list of files created or modified in files_written. The orchestrator turn ends after this tool result; do not emit another assistant message in the same turn.`,

		promptSnippet: "finalize_build — emit the build summary as the terminating final action.",
		promptGuidelines: [
			"Call finalize_build EXACTLY ONCE per build, as your final action, after writing all files.",
			"Do NOT call finalize_build mid-build — only after every output file exists on disk.",
			"summary: 1–3 sentences focused on what was actually shipped (the artifact), not the process.",
			"files_written: every file you created OR modified, repo-relative. Empty array if you only edited.",
			"After finalize_build returns, do not produce another assistant message in the same turn.",
		],

		parameters: Type.Object({
			summary: Type.String({
				description: "1–3 sentence description of what was built. Focus on the artifact, not the process.",
			}),
			files_written: Type.Array(Type.String(), {
				description: "Every file created or modified during this build, repo-relative paths.",
			}),
			next_steps: Type.Optional(Type.Array(Type.String(), {
				description: "Optional follow-ups the user should know about (tests to run, library.yaml entries to add, etc.).",
			})),
		}),

		async execute(_toolCallId, params) {
			const p = params as { summary: string; files_written: string[]; next_steps?: string[] };
			const fileLines = p.files_written.length
				? p.files_written.map(f => `- ${f}`).join("\n")
				: "(no files written)";
			const nextLines = p.next_steps?.length
				? `\n\nNext steps:\n${p.next_steps.map(s => `- ${s}`).join("\n")}`
				: "";
			return {
				content: [{
					type: "text",
					text: `✅ ${p.summary}\n\nFiles:\n${fileLines}${nextLines}`,
				}],
				details: {
					summary: p.summary,
					files_written: p.files_written,
					next_steps: p.next_steps ?? [],
				},
				terminate: true,
			};
		},

		renderCall(args, theme) {
			const a = args as { summary?: string; files_written?: string[] };
			const fileCount = Array.isArray(a.files_written) ? a.files_written.length : 0;
			const summary = (a.summary || "").slice(0, 60);
			return new Text(
				theme.fg("toolTitle", theme.bold("finalize_build ")) +
				theme.fg("success", `${fileCount} file${fileCount === 1 ? "" : "s"}`) +
				theme.fg("dim", " — ") +
				theme.fg("muted", summary),
				0, 0,
			);
		},

		renderResult(result, _options, theme) {
			const d = result.details as
				| { summary?: string; files_written?: string[]; next_steps?: string[] }
				| undefined;
			if (!d) {
				const t = result.content[0];
				return new Text(t?.type === "text" ? t.text : "", 0, 0);
			}
			const lines: string[] = [];
			lines.push(theme.fg("success", "✅ ") + theme.fg("toolTitle", theme.bold(d.summary || "Build complete")));
			if (d.files_written && d.files_written.length) {
				lines.push("");
				lines.push(theme.fg("muted", "Files:"));
				for (const f of d.files_written) {
					lines.push("  " + theme.fg("accent", f));
				}
			}
			if (d.next_steps && d.next_steps.length) {
				lines.push("");
				lines.push(theme.fg("muted", "Next steps:"));
				for (const s of d.next_steps) {
					lines.push("  " + theme.fg("dim", "→ ") + theme.fg("text", s));
				}
			}
			return new Text(lines.join("\n"), 0, 0);
		},
	});

	// ── Commands ─────────────────────────────────

	pi.registerCommand("experts", {
		description: "List available Eitri experts and their status",
		handler: async (_args, _ctx) => {
			widgetCtx = _ctx;
			const lines = Array.from(experts.values())
				.map(s => `${displayName(s.def.name)} (${s.status}, queries: ${s.queryCount}): ${s.def.description}`)
				.join("\n");
			_ctx.ui.notify(lines || "No experts loaded", "info");
		},
	});

	pi.registerCommand("experts-grid", {
		description: "Set expert grid columns: /experts-grid <1-5>",
		handler: async (args, _ctx) => {
			widgetCtx = _ctx;
			const n = parseInt(args?.trim() || "", 10);
			if (n >= 1 && n <= 5) {
				gridCols = n;
				_ctx.ui.notify(`Grid set to ${gridCols} columns`, "info");
				updateWidget();
			} else {
				_ctx.ui.notify("Usage: /experts-grid <1-5>", "error");
			}
		},
	});

	// ── System Prompt ────────────────────────────

	function buildSystemPrompt(): string {
		const orchestratorPath = cachedOrchestratorPath;
		if (!orchestratorPath) {
			return `Error: Could not locate eitri-orchestrator.md in ${bundledExpertsDir()}.`;
		}
		try {
			const raw = readFileSync(orchestratorPath, "utf-8");
			const { body } = parseFrontmatter<Record<string, string>>(raw);
			const template = (body || raw).trim();

			const expertCatalog = Array.from(experts.values())
				.map(s => `### ${displayName(s.def.name)}\n**Query as:** \`${s.def.name}\`\n${s.def.description}`)
				.join("\n\n");
			const expertNames = Array.from(experts.values()).map(s => displayName(s.def.name)).join(", ");

			return template
				.replace("{{EXPERT_COUNT}}", experts.size.toString())
				.replace("{{EXPERT_NAMES}}", expertNames)
				.replace("{{EXPERT_CATALOG}}", expertCatalog);
		} catch (err) {
			return `Error: Could not read ${orchestratorPath} — ${(err as Error).message}`;
		}
	}

	pi.on("before_agent_start", async (_event, _ctx) => {
		// Cache the rendered prompt — experts only change on session_start
		// (or future explicit reload), so re-templating per turn is wasted work.
		if (!cachedSystemPrompt) cachedSystemPrompt = buildSystemPrompt();
		return { systemPrompt: cachedSystemPrompt };
	});

	// ── Resources Discover ──────────────────────
	// Register `/eitri-help` as a discoverable slash-prompt. Pattern from
	// examples/extensions/dynamic-resources/. We render the template with the
	// live expert roster at discover time (not boot time) so the help prompt
	// always reflects what's currently loaded.
	pi.on("resources_discover", async () => {
		try {
			if (!helpPromptDir) {
				helpPromptDir = mkdtempSync(join(tmpdir(), "eitri-prompts-"));
			}
			const expertNames = experts.size === 0
				? "(no experts loaded)"
				: Array.from(experts.values()).map(s => `- **${displayName(s.def.name)}** — ${s.def.description}`).join("\n");
			const rendered = EITRI_HELP_PROMPT_TEMPLATE
				.replace("{{EXPERT_COUNT}}", experts.size.toString())
				.replace("{{EXPERT_NAMES}}", expertNames);
			const filePath = join(helpPromptDir, "eitri-help.md");
			writeFileSync(filePath, rendered, { encoding: "utf-8", mode: 0o600 });
			return { promptPaths: [filePath] };
		} catch {
			// Best-effort: discovery failures are non-fatal — eitri still works
			// without the slash-prompt.
			return {};
		}
	});

	pi.on("session_shutdown", async () => {
		// Restore the user's previous theme if we swapped it on session_start.
		if (previousThemeName) {
			try { (widgetCtx?.ui as any)?.setTheme?.(previousThemeName); } catch {}
			previousThemeName = undefined;
		}
		if (!helpPromptDir) return;
		try { unlinkSync(join(helpPromptDir, "eitri-help.md")); } catch {}
		try { rmdirSync(helpPromptDir); } catch {}
		helpPromptDir = undefined;
	});

	// ── Custom compaction (opt-in) ──────────────
	// Gated behind BRUNNR_COMPACT_EITRI=1. When enabled, replaces pi's
	// default LLM-driven compaction with a deterministic summary built from
	// the branch entries. The default compactor sends messagesToSummarize
	// (often 50KB+ of expert response bodies for eitri sessions) to an LLM
	// for a paragraph summary; ours produces a structured load-bearing
	// summary in microseconds for free, preserving:
	//   - the original user goal
	//   - which experts were queried (one line per call)
	//   - all files written/edited (deduped)
	//   - last 8 short orchestrator decision paragraphs
	//   - whether finalize_build was reached
	//
	// Off by default — the first release cycle for this should be observed
	// in real sessions before changing the default.
	const COMPACT_EITRI_ENABLED = process.env.BRUNNR_COMPACT_EITRI === "1";
	if (COMPACT_EITRI_ENABLED) {
		pi.on("session_before_compact", async (event) => {
			try {
				const summary = buildEitriCompactionSummary(event.branchEntries);
				return {
					compaction: {
						summary,
						firstKeptEntryId: event.preparation.firstKeptEntryId,
						tokensBefore: event.preparation.tokensBefore,
					},
				};
			} catch {
				// Any failure → fall through to pi's default compaction. Never
				// fail the user's compaction because of a bug in our handler.
				return {};
			}
		});
	}

	// ── Auto-name session on catalog write ─────
	// When the orchestrator successfully writes a catalog file, label the
	// session with that path so the session selector ("eitri: agents/foo.md")
	// is meaningful. Only sets if the user hasn't already named the session,
	// and only on the FIRST matching write — subsequent writes don't relabel.
	let sessionAutoNamed = false;
	pi.on("tool_result", async (event, ctx) => {
		if (sessionAutoNamed) return;
		if (event.isError) return;
		if (event.toolName !== "write" && event.toolName !== "edit") return;
		const filePath = String((event.input as any)?.file_path || "");
		const match = detectCatalogTail(filePath);
		if (!match) return;
		try {
			const current = ctx.getSessionName?.();
			if (current && current.trim().length > 0) {
				// User-named or already-named — don't trample.
				sessionAutoNamed = true;
				return;
			}
			ctx.setSessionName?.(`eitri: ${match.tail}`);
			sessionAutoNamed = true;
		} catch {
			// Best-effort: a failure to rename the session is never worth
			// failing the actual tool call.
		}
	});

	// ── Catalog frontmatter lint (opt-in) ───────
	// Gated behind BRUNNR_LINT=1. When enabled, blocks `write` calls to
	// catalog .md files (agents/prompts/skills) that lack mandatory `name`
	// and `description` frontmatter — caught at write-time instead of
	// surfacing later in PR review. Off by default because blocking writes
	// mid-task is a strong action.
	const LINT_ENABLED = process.env.BRUNNR_LINT === "1";
	if (LINT_ENABLED) {
		pi.on("tool_call", async (event) => {
			if (event.toolName !== "write") return;
			const input = event.input as { file_path?: string; content?: string };
			const filePath = String(input?.file_path || "");
			const match = detectCatalogTail(filePath);
			if (!match) return;
			// Only .md files have frontmatter. Skip extensions/themes for now.
			if (match.kind !== "agent" && match.kind !== "prompt" && match.kind !== "skill") return;
			const content = String(input?.content || "");
			let frontmatter: Record<string, unknown> | undefined;
			try {
				const parsed = parseFrontmatter<Record<string, unknown>>(content);
				frontmatter = parsed?.frontmatter;
			} catch {
				return { block: true, reason: `BRUNNR_LINT: malformed frontmatter in ${match.tail}. Expected '---\\n...\\n---' at the top of the file.` };
			}
			if (!frontmatter || typeof frontmatter !== "object") {
				return { block: true, reason: `BRUNNR_LINT: missing frontmatter block in ${match.tail}. Catalog ${match.kind} files require '---\\nname: ...\\ndescription: ...\\n---' at the top.` };
			}
			if (!frontmatter.name || String(frontmatter.name).trim().length === 0) {
				return { block: true, reason: `BRUNNR_LINT: missing 'name:' in frontmatter of ${match.tail}.` };
			}
			if (!frontmatter.description || String(frontmatter.description).trim().length === 0) {
				return { block: true, reason: `BRUNNR_LINT: missing 'description:' in frontmatter of ${match.tail}.` };
			}
		});
	}

	// ── Session Start ────────────────────────────

	pi.on("session_start", async (_event, _ctx) => {
		if (widgetCtx) {
			widgetCtx.ui.setWidget("eitri-grid", undefined);
		}
		widgetCtx = _ctx;

		// Auto-switch to the snow theme for eitri sessions. The brunnr eitri
		// recipe makes snow.json discoverable via --theme; here we activate it
		// and remember the previous theme so session_shutdown can restore.
		// Silent no-op if snow isn't available or the API isn't present.
		try {
			const ui = _ctx?.ui as any;
			if (ui?.setTheme && ui?.getAllThemes) {
				const available = (ui.getAllThemes() || []).map((t: any) => t?.name);
				if (available.includes("snow")) {
					const current = ui.theme?.name;
					const result = ui.setTheme("snow");
					if (result?.success && current && current !== "snow") {
						previousThemeName = current;
					}
				}
			}
		} catch { /* don't block session_start on theme failure */ }

		await loadExperts(_ctx);
		updateWidget();

		// Reset per-session flags. The extension closure persists across
		// sessions (new/resume/fork), so without this reset a fresh session
		// inheriting sessionAutoNamed=true would never get its catalog label.
		sessionAutoNamed = false;

		const expertNames = Array.from(experts.values()).map(s => displayName(s.def.name)).join(", ");
		_ctx.ui.setStatus("eitri", `Eitri (${experts.size} experts)`);
		_ctx.ui.notify(
			`Eitri loaded — ${experts.size} experts: ${expertNames}\n\n` +
			`/experts          List experts and status\n` +
			`/experts-grid N   Set grid columns (1-5)\n\n` +
			`Ask me to build any Pi agent component!`,
			"info",
		);

		// Custom footer — surfaces cumulative session cost (real $/tokens),
		// not just "context % full". Eitri sessions burn money fast (4-way
		// parallel Opus calls per query_experts) so the user benefits from
		// seeing the running bill at a glance. Walks sessionManager's branch
		// for ground-truth usage stats. Pattern: examples/extensions/custom-footer.ts.
		_ctx.ui.setFooter((_tui, theme, _footerData) => ({
			dispose: () => {},
			invalidate() {},
			render(width: number): string[] {
				const model = _ctx.model?.id || "no-model";

				// Tally cumulative usage from every assistant message in the
				// current branch. Branch already excludes alternate forks, so
				// the sum matches what's actually been billed for this thread.
				let inputTok = 0, outputTok = 0, cacheRead = 0, cacheWrite = 0, costTotal = 0;
				try {
					const branch = _ctx.sessionManager?.getBranch?.() ?? [];
					for (const e of branch as any[]) {
						if (e?.type !== "message" || e?.message?.role !== "assistant") continue;
						const u = e.message.usage;
						if (!u) continue;
						inputTok += Number(u.input || 0);
						outputTok += Number(u.output || 0);
						cacheRead += Number(u.cacheRead || 0);
						cacheWrite += Number(u.cacheWrite || 0);
						const c = u.cost;
						costTotal += typeof c === "object" ? Number(c?.total || 0) : Number(c || 0);
					}
				} catch {
					// If sessionManager isn't available on this pi build, fall
					// through with zeros — the footer still renders correctly.
				}

				const ctxUsage = _ctx.getContextUsage();
				const pct = ctxUsage ? ctxUsage.percent : 0;
				const filled = Math.round(pct / 10);
				const bar = "#".repeat(filled) + "-".repeat(10 - filled);

				const active = Array.from(experts.values()).filter(e => e.status === "researching").length;
				const done = Array.from(experts.values()).filter(e => e.status === "done").length;

				const fmt = (n: number): string =>
					n < 1000 ? `${n}` : n < 1_000_000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1_000_000).toFixed(1)}M`;

				const stats: string[] = [];
				if (inputTok) stats.push(`↑${fmt(inputTok)}`);
				if (outputTok) stats.push(`↓${fmt(outputTok)}`);
				if (cacheRead) stats.push(`R${fmt(cacheRead)}`);
				if (cacheWrite) stats.push(`W${fmt(cacheWrite)}`);
				if (costTotal) stats.push(`$${costTotal.toFixed(4)}`);
				const statsStr = stats.length ? theme.fg("dim", " " + stats.join(" ")) : "";

				const left = theme.fg("dim", ` ${model}`) +
					theme.fg("muted", " · ") +
					theme.fg("accent", "Eitri") +
					statsStr;
				const mid = active > 0
					? theme.fg("accent", ` ◉ ${active} researching`)
					: done > 0
					? theme.fg("success", ` ✓ ${done} done`)
					: "";
				const right = theme.fg("dim", `[${bar}] ${Math.round(pct)}% `);
				const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(mid) - visibleWidth(right)));

				return [truncateToWidth(left + mid + pad + right, width)];
			},
		}));
	});
}
