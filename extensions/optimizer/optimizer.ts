/**
 * brunnr-optimizer — TUI shell for the autoresearch skill-optimization workflow.
 *
 * Phase 1: skill picker + action picker + dispatch via pi.sendUserMessage.
 * The extension never runs the optimization itself; it just collects inputs
 * and fires the existing /autoresearch-pipeline (or /gen-evals) prompt into
 * the chat, which Pi's main agent + the autoresearch-* sub-agents handle.
 *
 * Future phases (separate commits):
 *   2. Live progress widget watching results.tsv
 *   3. Resume picker + eval review TUI + per-agent model/thinking tuning
 *
 * Loaded on-demand via `brunnr optimize`, never installed into Pi's extension
 * search paths.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getSelectListTheme } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { SelectList, visibleWidth } from "@mariozechner/pi-tui";
import { execSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

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

	pi.on("session_start", async (_event, _ctx) => {
		widgetCtx = _ctx;
		_ctx.ui.setStatus("optimizer", "Optimizer");
		_ctx.ui.notify(
			"brunnr-optimizer loaded.\n\n" +
			"/optimize    Pick a skill, run gen-evals or the pipeline\n" +
			"\n" +
			"Phase 1 surface; live progress widget and resume browser arrive in follow-ups.",
			"info",
		);
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

			// Step 4: pick action — depends on whether evals exist
			const evalFile = join(ctx.cwd, "evals", "evals.json");
			const hasEvals = existsSync(evalFile);

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
				pi.sendUserMessage(`/gen-evals\n  SKILL_PATH=${skillPath}`);
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
				return;
			}

			if (action === "pipeline") {
				const epochTag = `opt-${todayTag()}`;
				const msg = [
					`/autoresearch-pipeline`,
					`  SKILL=${skill.name}`,
					`  SKILL_PATH=${skillPath}`,
					`  EVAL_FILE=${evalFile}`,
					`  RUNS=3`,
					`  EPOCH_TAG=${epochTag}`,
					`  TARGET_PASS_RATE=95`,
				].join("\n");

				if (!ctx.isIdle()) {
					ctx.ui.notify("Agent is busy — wait for the current turn to finish, then re-run /optimize", "warning");
					return;
				}
				pi.sendUserMessage(msg);
				return;
			}
		},
	});
}
