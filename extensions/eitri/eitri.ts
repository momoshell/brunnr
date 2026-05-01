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
 * Experts are loaded from:
 *   ~/.pi/agent/agents/eitri/    (user-level, trusted)
 *   .pi/agents/eitri/            (project-level, requires confirmation)
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
 * Origin: based on https://github.com/badlogic/pi-vs-claude-code (upstream
 * extensions/pi-pi.ts). Renamed Eitri in brunnr after the master dwarf
 * smith — forger of Mjölnir, Draupnir, and Gullinbursti — paired with the
 * brunnr (well of wisdom) that the experts draw from.
 *
 * Hardened in brunnr: ctx.signal abort handling (SIGTERM→SIGKILL), user/
 * project agent scope split with confirmation, truncateHead helper for tool
 * output, theme-token border colours, promptSnippet/promptGuidelines, cached
 * orchestrator system prompt, chain mode with {previous} substitution, usage
 * stats accumulation, 4-way concurrency cap, malformed-expert warnings.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { spawn } from "child_process";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

// ── Types ────────────────────────────────────────

interface ExpertDef {
	name: string;
	description: string;
	tools: string;
	systemPrompt: string;
	file: string;
}

interface ExpertState {
	def: ExpertDef;
	source: "user" | "project";
	status: "idle" | "researching" | "done" | "error";
	question: string;
	elapsed: number;
	lastLine: string;
	queryCount: number;
	timer?: ReturnType<typeof setInterval>;
	totalUsage: ExpertUsage;
}

interface ExpertUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreateTokens: number;
	cost: number;
}

function emptyUsage(): ExpertUsage {
	return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, cost: 0 };
}

function addUsage(a: ExpertUsage, b: ExpertUsage): ExpertUsage {
	return {
		inputTokens: a.inputTokens + b.inputTokens,
		outputTokens: a.outputTokens + b.outputTokens,
		cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
		cacheCreateTokens: a.cacheCreateTokens + b.cacheCreateTokens,
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
		const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
		if (!match) return null;

		const frontmatter: Record<string, string> = {};
		for (const line of match[1].split("\n")) {
			const idx = line.indexOf(":");
			if (idx > 0) {
				frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
			}
		}

		if (!frontmatter.name) return null;

		return {
			name: frontmatter.name,
			description: frontmatter.description || "",
			tools: frontmatter.tools || "read,grep,find,ls",
			systemPrompt: match[2].trim(),
			file: filePath,
		};
	} catch {
		return null;
	}
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

// ── Extension ────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const experts: Map<string, ExpertState> = new Map();
	let gridCols = 3;
	let widgetCtx: any;

	// Cached rendered orchestrator system prompt — invalidated whenever
	// experts are reloaded. Avoids re-reading + re-templating on every turn.
	let cachedSystemPrompt: string | undefined;
	let cachedOrchestratorPath: string | undefined;

	function userDir(): string {
		return join(homedir(), ".pi", "agent", "agents", "eitri");
	}

	function projectDir(cwd: string): string {
		return join(cwd, ".pi", "agents", "eitri");
	}

	// Find the orchestrator template, preferring project-level when present.
	function findOrchestratorPath(cwd: string): string | undefined {
		const candidates = [
			join(projectDir(cwd), "eitri-orchestrator.md"),
			join(userDir(), "eitri-orchestrator.md"),
		];
		for (const p of candidates) {
			if (existsSync(p)) return p;
		}
		return undefined;
	}

	function loadExpertsFromDir(dir: string, source: "user" | "project", ctx: ExtensionContext): void {
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
			// Project-level definitions shadow user-level on name collision.
			// We always load user first, so a later project entry overwrites.
			experts.set(key, {
				def,
				source,
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

		// 1) User-level experts: trusted, always loaded
		loadExpertsFromDir(userDir(), "user", ctx);

		// 2) Project-level experts: require confirmation before loading because
		//    a malicious checkout could ship arbitrary subagent system prompts.
		const projDir = projectDir(ctx.cwd);
		if (existsSync(projDir)) {
			let candidateFiles: string[] = [];
			try {
				candidateFiles = readdirSync(projDir).filter(f => f.endsWith(".md") && f !== "eitri-orchestrator.md");
			} catch {}

			if (candidateFiles.length > 0) {
				let allow = false;
				if (ctx.hasUI) {
					const names = candidateFiles.map(f => f.replace(/\.md$/, "")).join(", ");
					allow = await ctx.ui.confirm(
						"Load project-level Eitri experts?",
						`Found ${candidateFiles.length} expert .md file(s) in ${projDir}: ${names}\n\nProject-level experts can execute arbitrary subagent system prompts. Only load if you trust this repository.`,
						{},
					);
				}
				// In headless mode (no UI) we never auto-load project experts.
				if (allow) loadExpertsFromDir(projDir, "project", ctx);
			}
		}

		cachedOrchestratorPath = findOrchestratorPath(ctx.cwd);
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

	function updateWidget() {
		if (!widgetCtx) return;

		widgetCtx.ui.setWidget("eitri-grid", (_tui: any, theme: any) => {

			return {
				render(width: number): string[] {
					if (experts.size === 0) {
						return ["", theme.fg("dim", "  No experts found. Add agent .md files to .pi/agents/eitri/")];
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

	// Best-effort usage extraction from Pi's --mode json event stream.
	// Tolerates several known shapes since the exact field naming has shifted
	// between Pi versions; unknown shapes simply yield no usage delta.
	function extractUsage(event: any): ExpertUsage | undefined {
		const candidates: any[] = [
			event?.usage,
			event?.message?.usage,
			event?.assistantMessageEvent?.usage,
		];
		for (const u of candidates) {
			if (!u || typeof u !== "object") continue;
			const inputTokens = Number(u.input_tokens ?? u.inputTokens ?? 0);
			const outputTokens = Number(u.output_tokens ?? u.outputTokens ?? 0);
			const cacheReadTokens = Number(u.cache_read_input_tokens ?? u.cacheReadInputTokens ?? u.cacheReadTokens ?? 0);
			const cacheCreateTokens = Number(u.cache_creation_input_tokens ?? u.cacheCreationInputTokens ?? u.cacheCreateTokens ?? 0);
			const cost = Number(u.cost ?? u.totalCost ?? 0);
			if (inputTokens || outputTokens || cost) {
				return { inputTokens, outputTokens, cacheReadTokens, cacheCreateTokens, cost };
			}
		}
		return undefined;
	}

	interface QueryResult {
		output: string;
		exitCode: number;
		elapsed: number;
		usage: ExpertUsage;
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
		state.queryCount++;
		updateWidget();

		const startTime = Date.now();
		state.timer = setInterval(() => {
			state.elapsed = Date.now() - startTime;
			updateWidget();
		}, 1000);

		const model = ctx.model
			? `${ctx.model.provider}/${ctx.model.id}`
			: "openrouter/google/gemini-3-flash-preview";

		const args = [
			"--mode", "json",
			"-p",
			"--no-session",
			"--no-extensions",
			"--model", model,
			"--tools", state.def.tools,
			"--thinking", "off",
			"--append-system-prompt", state.def.systemPrompt,
			question,
		];

		const textChunks: string[] = [];
		let runUsage = emptyUsage();

		return new Promise<QueryResult>((resolve) => {
			const proc = spawn("pi", args, {
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
				if (event.type === "message_update") {
					const delta = event.assistantMessageEvent;
					if (delta?.type === "text_delta") {
						textChunks.push(delta.delta || "");
						const full = textChunks.join("");
						const last = full.split("\n").filter((l: string) => l.trim()).pop() || "";
						state.lastLine = last;
						updateWidget();
					}
				}
				const u = extractUsage(event);
				if (u) runUsage = addUsage(runUsage, u);
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
			proc.stderr!.on("data", () => {});

			proc.on("close", (code) => {
				if (buffer.trim()) {
					try { handleEvent(JSON.parse(buffer)); } catch {}
				}
				if (killTimer) clearTimeout(killTimer);
				if (signal) signal.removeEventListener("abort", onAbort);

				clearInterval(state.timer);
				state.elapsed = Date.now() - startTime;
				state.status = code === 0 ? "done" : "error";
				state.totalUsage = addUsage(state.totalUsage, runUsage);

				const full = textChunks.join("");
				state.lastLine = full.split("\n").filter((l: string) => l.trim()).pop() || "";
				updateWidget();

				// Suppress per-expert toasts on cancel — user just hit Esc, no
				// need to follow up with N "expert error" notifications.
				if (!signal?.aborted) {
					ctx.ui.notify(
						`${displayName(state.def.name)} ${state.status} in ${Math.round(state.elapsed / 1000)}s`,
						state.status === "done" ? "success" : "error",
					);
				}

				resolve({
					output: full,
					exitCode: code ?? 1,
					elapsed: state.elapsed,
					usage: runUsage,
				});
			});

			proc.on("error", (err) => {
				if (killTimer) clearTimeout(killTimer);
				if (signal) signal.removeEventListener("abort", onAbort);
				clearInterval(state.timer);
				state.status = "error";
				state.lastLine = `Error: ${err.message}`;
				updateWidget();
				resolve({
					output: `Error spawning expert: ${err.message}`,
					exitCode: 1,
					elapsed: Date.now() - startTime,
					usage: runUsage,
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
						description: "Expert name. Typical Pi-Pi roster: ext-expert, theme-expert, skill-expert, config-expert, tui-expert, prompt-expert, agent-expert, keybinding-expert, cli-expert.",
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
			};

			const buildRunResult = (
				query: { expert: string; question: string },
				raw: QueryResult,
			): RunResult => {
				const trunc = truncateHead(raw.output, {
					maxLines: DEFAULT_MAX_LINES,
					maxBytes: DEFAULT_MAX_BYTES,
				});
				const status: "done" | "error" = raw.exitCode === 0 ? "done" : "error";
				return {
					expert: query.expert,
					question: query.question,
					status,
					elapsed: raw.elapsed,
					exitCode: raw.exitCode,
					output: trunc.content,
					fullOutput: raw.output,
					truncated: trunc.truncated,
					outputBytes: trunc.outputBytes,
					totalBytes: trunc.totalBytes,
					usage: raw.usage,
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
				return `## [${icon}] ${displayName(r.expert)} (${Math.round(r.elapsed / 1000)}s)\n\n${r.output}${truncNote}`;
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
			const usageStr = totalUsage && (totalUsage.inputTokens || totalUsage.outputTokens || totalUsage.cost)
				? theme.fg("dim", ` · ↑${totalUsage.inputTokens} ↓${totalUsage.outputTokens}` +
					(totalUsage.cost ? ` $${totalUsage.cost.toFixed(4)}` : ""))
				: "";

			const header = lines.join(theme.fg("dim", " · ")) + usageStr;

			if (options.expanded && details.results) {
				const expanded = (details.results as any[]).map((r: any) => {
					// Prefer the already-truncated `output` for display; fullOutput
					// is preserved in details for downstream/programmatic access.
					const body = r.output || "";
					return theme.fg("accent", `── ${displayName(r.expert)} ──`) + "\n" + theme.fg("muted", body);
				});
				return new Text(header + "\n\n" + expanded.join("\n\n"), 0, 0);
			}

			return new Text(header, 0, 0);
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
			return "Error: Could not locate eitri-orchestrator.md in either ~/.pi/agent/agents/eitri/ or .pi/agents/eitri/.";
		}
		try {
			const raw = readFileSync(orchestratorPath, "utf-8");
			const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
			const template = match ? match[2].trim() : raw;

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

	// ── Session Start ────────────────────────────

	pi.on("session_start", async (_event, _ctx) => {
		if (widgetCtx) {
			widgetCtx.ui.setWidget("eitri-grid", undefined);
		}
		widgetCtx = _ctx;

		await loadExperts(_ctx);
		updateWidget();

		const expertNames = Array.from(experts.values()).map(s => displayName(s.def.name)).join(", ");
		_ctx.ui.setStatus("eitri", `Eitri (${experts.size} experts)`);
		_ctx.ui.notify(
			`Eitri loaded — ${experts.size} experts: ${expertNames}\n\n` +
			`/experts          List experts and status\n` +
			`/experts-grid N   Set grid columns (1-5)\n\n` +
			`Ask me to build any Pi agent component!`,
			"info",
		);

		// Custom footer
		_ctx.ui.setFooter((_tui, theme, _footerData) => ({
			dispose: () => {},
			invalidate() {},
			render(width: number): string[] {
				const model = _ctx.model?.id || "no-model";
				const usage = _ctx.getContextUsage();
				const pct = usage ? usage.percent : 0;
				const filled = Math.round(pct / 10);
				const bar = "#".repeat(filled) + "-".repeat(10 - filled);

				const active = Array.from(experts.values()).filter(e => e.status === "researching").length;
				const done = Array.from(experts.values()).filter(e => e.status === "done").length;

				const left = theme.fg("dim", ` ${model}`) +
					theme.fg("muted", " · ") +
					theme.fg("accent", "Eitri");
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
