/**
 * Hird — on-demand Pi engineering retinue.
 *
 * Hird bundles the dev-team recreation as a Pi extension: one user-facing
 * orchestrator, read-only leads, scoped executors, reviewers, validators, and
 * a Norse longhall theme. It is launched by `brunnr hird`, not installed into
 * Pi's normal project extension search path.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	parseFrontmatter,
	truncateHead,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { spawn } from "child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmdirSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "fs";
import { createHash, randomUUID } from "crypto";
import { homedir, tmpdir } from "os";
import { basename, dirname, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";

// ── Types ────────────────────────────────────────────────────────────────

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

interface HirdAgent {
	name: string;
	description: string;
	tools: string;
	model?: string;
	provider?: string;
	thinking?: ThinkingLevel;
	systemPrompt: string;
	file: string;
}

interface RunResult {
	agent: string;
	prompt: string;
	status: "done" | "error" | "cancelled";
	exitCode: number;
	elapsedMs: number;
	output: string;
	fullOutput: string;
	truncated: boolean;
	stopReason?: string;
	errorMessage?: string;
	model?: string;
}

type HirdRunState = "idle" | "run" | "done" | "error";
type HirdViewMode = "lanes" | "orbit";

interface HirdActivityRun {
	name: string;
	query: string;
	state: HirdRunState;
	startedAt?: number;
	endedAt?: number;
	lastLine: string;
	lastActivityAt?: number;
	activity?: number;
}

type RGB = readonly [number, number, number];
type HirdMemoryScope = "project" | "global";
type HirdMemoryFile = "conventions" | "frontend" | "backend" | "devops" | "qa" | "architecture";
type HirdMemoryAction = "read" | "propose" | "commit" | "status";
type HirdMemoryDeltaStatus = "active" | "deprecated";

interface HirdMemoryProposal {
	id: string;
	target: HirdMemoryScope;
	file: HirdMemoryFile;
	decision: string;
	date: string;
	scope: string;
	status: HirdMemoryDeltaStatus;
	supersedes: string;
	rationale: string;
	createdAt: string;
}

const VALID_THINKING: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
const EXT_DIR = dirname(fileURLToPath(import.meta.url));
const HIRD_AGENT_DIR = join(EXT_DIR, "agents", "hird");
const HIRD_PROMPTS_DIR = join(EXT_DIR, "prompts");
const HIRD_SKILLS_DIR = join(EXT_DIR, "skills");
const HIRD_THEME_NAME = "hird";
const HIRD_FLOW_PROMPTS = {
	onboard: "hird-onboard.md",
	next: "hird-next.md",
	team: "hird-team.md",
	ship: "hird-ship.md",
	workflow: "hird-workflow.md",
	handoverLint: "hird-handover-lint.md",
	qaGate: "hird-qa-gate.md",
	memoryCommit: "hird-memory-commit.md",
	prReview: "hird-pr-review.md",
} as const;
const HIRD_GUIDELINE_FILES = [
	"HIRD_GUIDELINES.md",
	"QA_GUIDELINES.md",
	"ARCHITECTURE_GUIDELINES.md",
	"FRONTEND_GUIDELINES.md",
	"BACKEND_GUIDELINES.md",
	"DEVOPS_GUIDELINES.md",
	"SHIPPING_GUIDELINES.md",
	"BOARD_GUIDELINES.md",
] as const;
const PROJECT_MEMORY_FILES: Record<HirdMemoryFile, string> = {
	conventions: "conventions.md",
	frontend: "frontend-notes.md",
	backend: "backend-notes.md",
	devops: "devops-notes.md",
	qa: "qa-notes.md",
	architecture: "architecture-notes.md",
};
const GLOBAL_MEMORY_FILES: Record<HirdMemoryFile, string> = {
	...PROJECT_MEMORY_FILES,
	conventions: "conventions.md",
};
const MEMORY_HEADER = `# Hird memory\n\nPrecedence: code > project memory > global memory. Entries are durable guidance, not absolute truth. Deprecate stale entries instead of deleting them.\n`;
let hirdProjectCwd = process.cwd();

function isInside(parent: string, child: string): boolean {
	const rel = relative(resolve(parent), resolve(child));
	return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`));
}

function projectHirdRoot(cwd = process.cwd()): string {
	return resolve(cwd, ".pi", "hird");
}

function safeProjectHirdPath(cwd: string, ...parts: string[]): string {
	const root = projectHirdRoot(cwd);
	const path = resolve(root, ...parts);
	if (!isInside(root, path)) throw new Error("Refusing path outside project Hird root");
	return path;
}

function projectMemoryRoot(): string {
	return resolve(projectHirdRoot(hirdProjectCwd), "memory");
}

function globalMemoryRoot(): string {
	return resolve(homedir(), ".pi", "hird", "memory");
}

function memoryRoot(target: HirdMemoryScope): string {
	return target === "global" ? globalMemoryRoot() : projectMemoryRoot();
}

function memoryPath(target: HirdMemoryScope, file: HirdMemoryFile): string {
	const root = memoryRoot(target);
	if (target === "global" && file !== "conventions") {
		throw new Error("Global Hird memory currently supports only conventions.md");
	}
	const name = (target === "global" ? GLOBAL_MEMORY_FILES : PROJECT_MEMORY_FILES)[file];
	const path = resolve(root, name);
	if (!isInside(root, path)) throw new Error("Refusing memory path outside Hird memory root");
	return path;
}

function proposalsPath(target: HirdMemoryScope): string {
	const root = memoryRoot(target);
	const path = resolve(root, "proposals.json");
	if (!isInside(root, path)) throw new Error("Refusing proposal path outside Hird memory root");
	return path;
}

function bootstrapMemory(target: HirdMemoryScope): void {
	const root = memoryRoot(target);
	mkdirSync(root, { recursive: true });
	const files: HirdMemoryFile[] = target === "global"
		? ["conventions"]
		: ["conventions", "frontend", "backend", "devops", "qa", "architecture"];
	for (const f of files) {
		const p = memoryPath(target, f);
		if (!existsSync(p)) writeFileSync(p, MEMORY_HEADER, { encoding: "utf-8", mode: 0o600 });
	}
}

function readMemoryFile(target: HirdMemoryScope, file: HirdMemoryFile): string {
	const p = memoryPath(target, file);
	if (!existsSync(p)) return "";
	return readFileSync(p, "utf-8");
}

function readProposals(target: HirdMemoryScope): HirdMemoryProposal[] {
	const p = proposalsPath(target);
	if (!existsSync(p)) return [];
	try {
		const parsed = JSON.parse(readFileSync(p, "utf-8"));
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function atomicWrite(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	const tmp = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
	try {
		writeFileSync(tmp, content, { encoding: "utf-8", mode: 0o600 });
		renameSync(tmp, path);
	} catch (err) {
		try { if (existsSync(tmp)) unlinkSync(tmp); } catch {}
		throw err;
	}
}

function readSmallTextFile(path: string, maxBytes = 64_000): string | undefined {
	try {
		if (!existsSync(path)) return undefined;
		const stat = statSync(path);
		if (!stat.isFile()) return undefined;
		const raw = readFileSync(path, "utf-8");
		return raw.length > maxBytes ? raw.slice(0, maxBytes) + "\n\n[truncated]" : raw;
	} catch {
		return undefined;
	}
}

function writeProposals(target: HirdMemoryScope, proposals: HirdMemoryProposal[]): void {
	atomicWrite(proposalsPath(target), JSON.stringify(proposals, null, 2) + "\n");
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

function redactedPreview(text: string, maxChars = 160): string {
	return text
		.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
		.replace(/\b(authorization|api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
		.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, maxChars);
}

function stableHash(text: string): string {
	return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function unsafeMemoryReason(text: string): string | undefined {
	if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(text)) return "private key material";
	if (/\b(authorization|api[_-]?key|token|secret|password)\s*[:=]\s*\S+/i.test(text)) return "credential-like key/value";
	if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(text)) return "email/PII-like value";
	if (/\b(TODO|temporary|for this task only|maybe|guess|not sure)\b/i.test(text)) return "speculative or task-local language";
	return undefined;
}

function normalizeMemoryText(text: string, field = "memory"): string {
	const normalized = text.trim().replace(/\s+\n/g, "\n").slice(0, 4000);
	const unsafe = unsafeMemoryReason(normalized);
	if (unsafe) throw new Error(`Refusing ${field}: contains ${unsafe}. Redact or rewrite as durable evidence-backed guidance.`);
	return normalized;
}

function memoryEntry(delta: Omit<HirdMemoryProposal, "id" | "target" | "file" | "createdAt">): string {
	return [
		"",
		`## ${delta.date} — ${delta.decision}`,
		`- scope: ${delta.scope}`,
		`- status: ${delta.status}`,
		`- supersedes: ${delta.supersedes || "none"}`,
		`- rationale: ${delta.rationale}`,
	].join("\n") + "\n";
}

function compactMemoryExcerpt(target: HirdMemoryScope, file: HirdMemoryFile, maxChars = 1800): string {
	const raw = readMemoryFile(target, file).trim();
	if (!raw) return "";
	const withoutHeader = raw.replace(/^# Hird memory\s*[\s\S]*?\n(?=## |$)/, "").trim() || raw;
	const trunc = truncateHead(withoutHeader, { maxBytes: maxChars, maxLines: 40 });
	return trunc.content.trim();
}

function hirdMemoryContext(): string {
	const sections: string[] = [];
	const add = (label: string, target: HirdMemoryScope, file: HirdMemoryFile, max = 1400) => {
		try {
			const excerpt = compactMemoryExcerpt(target, file, max);
			if (excerpt) sections.push(`### ${label}\n${excerpt}`);
		} catch {}
	};
	add("Project conventions (.pi/hird/memory/conventions.md)", "project", "conventions");
	add("Project architecture (.pi/hird/memory/architecture-notes.md)", "project", "architecture");
	add("Project frontend (.pi/hird/memory/frontend-notes.md)", "project", "frontend", 900);
	add("Project backend (.pi/hird/memory/backend-notes.md)", "project", "backend", 900);
	add("Project devops (.pi/hird/memory/devops-notes.md)", "project", "devops", 900);
	add("Project QA (.pi/hird/memory/qa-notes.md)", "project", "qa", 900);
	add("Global conventions (~/.pi/hird/memory/conventions.md)", "global", "conventions", 1200);
	if (!sections.length) return "";
	return `## Hird memory context\n\nPrecedence: code > project memory > global memory. Memory is advisory; verified code and explicit user instructions win. Only the orchestrator may commit memory. Specialists may propose deltas only.\n\n${sections.join("\n\n")}`;
}

function relevantMemoryForAgent(agentName: string): string {
	const files: HirdMemoryFile[] = ["conventions"];
	if (agentName.includes("frontend")) files.push("frontend");
	if (agentName.includes("backend")) files.push("backend");
	if (agentName.includes("devops")) files.push("devops");
	if (agentName.includes("qa") || agentName.includes("test") || agentName.includes("review") || agentName.includes("validator")) files.push("qa");
	if (agentName.includes("architect") || agentName.includes("architecture") || agentName.includes("plan")) files.push("architecture");
	if (agentName.includes("coder")) files.push("frontend", "backend", "devops");
	const unique = Array.from(new Set(files));
	const chunks: string[] = [];
	for (const f of unique) {
		const project = compactMemoryExcerpt("project", f, 900);
		if (project) chunks.push(`### Project ${PROJECT_MEMORY_FILES[f]}\n${project}`);
	}
	const global = compactMemoryExcerpt("global", "conventions", 900);
	if (global) chunks.push(`### Global conventions.md\n${global}`);
	if (!chunks.length) return "";
	return `## Memory excerpts (read-only)\n\nPrecedence: code > project memory > global memory. Use these as advisory constraints; if code contradicts memory, trust code and report the contradiction. Do not write memory files. If you learn a durable convention, propose a memory delta in your required output.\n\n${chunks.join("\n\n")}`;
}

// ── Parallel activity TUI primitives ────────────────────────────────────
// Pi's TUI components render styled strings, so the spec's paint(col,row,glyph,
// colorHex) adapter is implemented by emitting one styled braille cell per
// terminal cell. The activity feed is session state maintained by the dispatch
// controller; the view never polls subprocesses directly.

const BRAILLE_BASE = 0x2800;
const BIT = [
	[0x01, 0x02, 0x04, 0x40],
	[0x08, 0x10, 0x20, 0x80],
] as const;
const DEFAULT_ACCENT: RGB = [0x46, 0xd7, 0xff];
const DEFAULT_ACCENT2: RGB = [0x8c, 0x7b, 0xff];
const DEFAULT_SUCCESS: RGB = [0x37, 0xe0, 0xa0];
const DEFAULT_MUTED: RGB = [0x46, 0x55, 0x6f];
const DEFAULT_FAINT: RGB = [0x24, 0x30, 0x49];
const DEFAULT_BRIGHT: RGB = [0xe8, 0xee, 0xfb];
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

class Braille {
	readonly W: number;
	readonly H: number;
	private dots: Uint8Array;
	private color: (string | null)[];
	private prio: Int8Array;

	constructor(public cols: number, public rows: number) {
		this.W = cols * 2;
		this.H = rows * 4;
		this.dots = new Uint8Array(cols * rows);
		this.color = new Array(cols * rows).fill(null);
		this.prio = new Int8Array(cols * rows);
	}

	clear(): void {
		this.dots.fill(0);
		this.color.fill(null);
		this.prio.fill(0);
	}

	set(x: number, y: number, color: string, prio: number): void {
		x = Math.round(x);
		y = Math.round(y);
		if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
		const cell = ((y >> 2) * this.cols) + (x >> 1);
		this.dots[cell] |= BIT[x & 1][y & 3];
		if (prio >= this.prio[cell]) {
			this.prio[cell] = prio;
			this.color[cell] = color;
		}
	}

	line(x0: number, y0: number, x1: number, y1: number, color: string, prio: number): void {
		const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0;
		for (let i = 0; i <= n; i++) {
			const f = n ? i / n : 0;
			this.set(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, color, prio);
		}
	}

	arc(cx: number, cy: number, r: number, color: string, prio: number, step = 0.05): void {
		for (let a = 0; a < Math.PI * 2; a += step) this.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, color, prio);
	}

	disc(cx: number, cy: number, r: number, color: string, prio: number): void {
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				if (dx * dx + dy * dy <= r * r) this.set(cx + dx, cy + dy, color, prio);
			}
		}
	}

	renderRows(colorize: (glyph: string, colorHex: string | null) => string): string[] {
		const rows: string[] = [];
		for (let r = 0; r < this.rows; r++) {
			let line = "";
			for (let cc = 0; cc < this.cols; cc++) {
				const i = r * this.cols + cc;
				line += colorize(String.fromCharCode(BRAILLE_BASE + this.dots[i]), this.color[i]);
			}
			rows.push(line);
		}
		return rows;
	}
}

function hexOf(rgb: RGB): string {
	return "#" + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

function parseHex(raw: unknown): RGB | undefined {
	if (typeof raw !== "string" || !/^#[0-9a-fA-F]{6}$/.test(raw)) return undefined;
	return [parseInt(raw.slice(1, 3), 16), parseInt(raw.slice(3, 5), 16), parseInt(raw.slice(5, 7), 16)];
}

function themeRGB(theme: any, token: string, fallback: RGB): RGB {
	const roots = [theme, theme?.theme, theme?.raw, theme?.definition, theme?.config];
	for (const root of roots) {
		const colors = root?.colors;
		const vars = root?.vars;
		const value = colors?.[token];
		const direct = parseHex(value);
		if (direct) return direct;
		const viaVar = typeof value === "string" ? parseHex(vars?.[value]) : undefined;
		if (viaVar) return viaVar;
	}
	return fallback;
}

function lerpRGB(a: RGB, b: RGB, t: number): string {
	return hexOf([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

function plasma(t: number, accent: RGB, accent2: RGB): string {
	return lerpRGB(accent, accent2, Math.round(Math.max(0, Math.min(1, t)) * 5) / 5);
}

function hashSeed(name: string): { seed: number; sp: number } {
	let h = 0;
	for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
	const u = Math.abs(h);
	return { seed: (u % 1000) / 1000 * Math.PI * 2, sp: 0.6 + (u % 70) / 100 };
}

function drawWave(b: Braille, time: number, st: "run" | "done", activity: number, seed: number, sp: number, accent: RGB, accent2: RGB, success: string): void {
	b.clear();
	const mid = b.H / 2 - 0.5;
	if (st === "done") {
		for (let x = 0; x < b.W; x++) b.set(x, mid + Math.sin(x * 0.25) * 0.6, success, 1);
		return;
	}
	const t = time * 0.0016;
	const A = (b.H / 2 - 1) * Math.max(0, Math.min(1, activity));
	let prev: number | null = null;
	for (let x = 0; x < b.W; x++) {
		const env = 0.6 + 0.4 * Math.sin(x * 0.045 + t * 1.0 * sp + seed);
		const y = mid + (
			Math.sin(x * 0.075 + t * 3.4 * sp + seed) * 0.78 +
			Math.sin(x * 0.19 - t * 5.2 * sp + seed * 2) * 0.26 +
			Math.sin(x * 0.41 + t * 8.0) * 0.10
		) * A * env;
		const col = plasma(x / b.W, accent, accent2);
		if (prev !== null) {
			const lo = Math.min(prev, y), hi = Math.max(prev, y);
			for (let yy = lo; yy <= hi; yy += 1) b.set(x, yy, col, 3);
		}
		b.set(x, y, col, 3);
		prev = y;
	}
}

function supportsTrueColor(): boolean {
	return /truecolor|24bit/i.test(process.env.COLORTERM || "");
}

function supportsUnicode(): boolean {
	if (process.env.HIRD_ASCII === "1") return false;
	const lang = `${process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || ""}`;
	return !/^C$|^POSIX$/i.test(lang);
}

function supportsBraille(): boolean {
	return supportsUnicode() && process.env.HIRD_NO_BRAILLE !== "1";
}

function reducedMotion(): boolean {
	return !process.stdout.isTTY || process.env.HIRD_REDUCED_MOTION === "1" || process.env.NO_COLOR === "1";
}

function fgHex(theme: any, hex: string | null, text: string, fallbackToken = "accent"): string {
	if (!hex) return text;
	if (!supportsTrueColor()) return theme.fg(fallbackToken, text);
	try { return theme.fg(hex, text); } catch {}
	const rgb = parseHex(hex);
	if (!rgb) return text;
	return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\x1b[39m`;
}

function elapsedLabel(ms: number | undefined): string {
	if (ms === undefined) return "--:--";
	const total = Math.max(0, Math.round(ms / 1000));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function activityFor(run: HirdActivityRun, now: number): number {
	if (run.state !== "run") return 0;
	if (typeof run.activity === "number") return Math.max(0, Math.min(1, run.activity));
	// Activity source: Pi JSON subprocesses do not expose streaming token/sec in a
	// stable extension API, so Hird uses the spec's fallback path — output/tool
	// events pulse to 1.0, then decay toward a constant 0.70 while running.
	const quietMs = now - (run.lastActivityAt ?? run.startedAt ?? now);
	return Math.max(0.7, 1 - quietMs / 4000);
}

function wrapWords(text: string, width: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const out: string[] = [];
	let line = "";
	for (const word of words) {
		const next = line ? `${line} ${word}` : word;
		if (visibleWidth(next) > width && line) {
			out.push(line);
			line = word;
		} else {
			line = next;
		}
	}
	if (line) out.push(line);
	return out.length ? out : [""];
}

class HirdActivityView implements Component {
	private cachedWidth?: number;
	private cachedRevision = -1;
	private cachedMode?: HirdViewMode;
	private cachedLines?: string[];

	constructor(
		private runs: () => HirdActivityRun[],
		private revision: () => number,
		private mode: () => HirdViewMode,
		private theme: any,
	) {}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedRevision = -1;
		this.cachedMode = undefined;
		this.cachedLines = undefined;
	}

	render(width: number): string[] {
		const rev = this.revision();
		const mode = this.mode();
		if (this.cachedLines && this.cachedWidth === width && this.cachedRevision === rev && this.cachedMode === mode && reducedMotion()) return this.cachedLines;
		const lines = mode === "orbit" ? this.renderOrbit(width) : this.renderLanes(width);
		this.cachedWidth = width;
		this.cachedRevision = rev;
		this.cachedMode = mode;
		this.cachedLines = lines.map(line => truncateToWidth(line, width, ""));
		return this.cachedLines;
	}

	private pad(inner: number, content: string): string {
		const clipped = truncateToWidth(content, inner, "…");
		return `${this.theme.fg("borderAccent", "┃")} ${clipped}${" ".repeat(Math.max(0, inner - visibleWidth(clipped)))} ${this.theme.fg("borderAccent", "┃")}`;
	}

	private frame(width: number, body: string[]): string[] {
		const inner = Math.max(20, width - 4);
		return [
			this.theme.fg("borderAccent", `┏${"━".repeat(Math.max(0, width - 2))}┓`),
			...body.map(line => this.pad(inner, line)),
			this.theme.fg("borderAccent", `┗${"━".repeat(Math.max(0, width - 2))}┛`),
		];
	}

	private headerLine(runs: HirdActivityRun[], inner: number, now: number): string {
		const running = runs.filter(r => r.state === "run").length;
		const done = runs.filter(r => r.state === "done").length;
		const failed = runs.filter(r => r.state === "error").length;
		const idle = runs.filter(r => r.state === "idle").length;
		const started = runs.map(r => r.startedAt).filter((v): v is number => typeof v === "number");
		const elapsed = started.length ? elapsedLabel(now - Math.min(...started)) : "00:00";
		const barWidth = Math.max(8, Math.min(24, Math.floor(inner * 0.22)));
		const total = Math.max(1, runs.length);
		const doneN = Math.round(barWidth * done / total);
		const runN = Math.round(barWidth * running / total);
		const failN = Math.round(barWidth * failed / total);
		const idleN = Math.max(0, barWidth - doneN - runN - failN);
		const bar = this.theme.fg("success", "█".repeat(doneN)) + this.theme.fg("accent", "█".repeat(runN)) + this.theme.fg("error", "█".repeat(failN)) + this.theme.fg("muted", "█".repeat(idleN));
		return `${this.theme.bold(this.theme.fg("accent", "Hird activity"))} ${this.theme.fg("dim", "·")} ${elapsed} elapsed ${this.theme.fg("dim", "·")} ${done} done ${this.theme.fg("dim", "·")} ${running} running ${this.theme.fg("dim", "·")} ${idle} idle ${failed ? this.theme.fg("error", `· ${failed} failed `) : ""}${bar}`;
	}

	private renderWave(run: HirdActivityRun, cols: number, now: number): string[] {
		if (!supportsBraille()) return [this.renderSparkline(run, cols * 2, now)];
		const accent = themeRGB(this.theme, "accent", DEFAULT_ACCENT);
		const accent2 = themeRGB(this.theme, "borderAccent", DEFAULT_ACCENT2);
		const success = hexOf(themeRGB(this.theme, "success", DEFAULT_SUCCESS));
		const b = new Braille(cols, 3);
		const { seed, sp } = hashSeed(run.name);
		drawWave(b, now, run.state === "done" || run.state === "error" ? "done" : "run", activityFor(run, now), seed, sp, accent, accent2, run.state === "error" ? hexOf(themeRGB(this.theme, "error", DEFAULT_SUCCESS)) : success);
		return b.renderRows((glyph, color) => fgHex(this.theme, color, glyph, run.state === "done" ? "success" : run.state === "error" ? "error" : "accent"));
	}

	private renderSparkline(run: HirdActivityRun, width: number, now: number): string {
		if (!supportsUnicode()) {
			return run.state === "run" ? "~".repeat(Math.max(1, width)) : "-".repeat(Math.max(1, width));
		}
		const { seed, sp } = hashSeed(run.name);
		let out = "";
		for (let x = 0; x < width; x++) {
			let level = 0.25;
			if (run.state === "run") {
				const t = now * 0.0016;
				level = 0.5 + 0.5 * Math.sin(x * 0.2 + t * 3.4 * sp + seed) * activityFor(run, now);
			} else if (run.state === "done") level = 0.45;
			else if (run.state === "error") level = 0.15;
			const block = BLOCKS[Math.max(0, Math.min(BLOCKS.length - 1, Math.round(level * (BLOCKS.length - 1))))];
			const token = run.state === "done" ? "success" : run.state === "error" ? "error" : run.state === "run" ? "accent" : "muted";
			out += this.theme.fg(token, block);
		}
		return out;
	}

	private renderLanes(width: number): string[] {
		const now = reducedMotion() ? 1000 : Date.now();
		const inner = Math.max(20, width - 4);
		const runs = this.runs();
		const running = runs.filter(r => r.state === "run").sort((a, b) => a.name.localeCompare(b.name));
		const done = runs.filter(r => r.state === "done" || r.state === "error").sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
		const idle = runs.filter(r => r.state === "idle").sort((a, b) => a.name.localeCompare(b.name));
		const waveCols = inner >= 92 ? 30 : inner >= 68 ? 22 : 0;
		const elapsedW = 6;
		const textW = Math.max(16, inner - (waveCols ? waveCols + 2 : 0) - elapsedW - 4);
		const body: string[] = [this.headerLine(runs, inner, now), this.theme.fg("dim", "activity: stream pulse + decay fallback 0.70 · f8 hide/show · f9 lanes/orbit"), ""];

		const section = (label: string, count: number) => body.push(this.theme.fg("muted", `${label.toUpperCase()} (${count})`));
		const row = (run: HirdActivityRun) => {
			const icon = run.state === "run"
				? this.theme.fg("accent", reducedMotion() ? "◉" : SPINNER_FRAMES[Math.floor(now / 80) % SPINNER_FRAMES.length])
				: run.state === "done" ? this.theme.fg("success", "✓") : run.state === "error" ? this.theme.fg("error", "✗") : this.theme.fg("muted", "○");
			const title = truncateToWidth(`${displayName(run.name)}${run.query ? ` — ${run.query}` : ""}`, textW, "…");
			const elapsed = elapsedLabel((run.endedAt ?? now) - (run.startedAt ?? now));
			if (!waveCols) {
				body.push(`${icon} ${title}${" ".repeat(Math.max(1, textW - visibleWidth(title) + 1))}${this.theme.fg("dim", elapsed)}`);
				return;
			}
			const waves = this.renderWave(run, waveCols, now);
			body.push(`${icon} ${title}${" ".repeat(Math.max(1, textW - visibleWidth(title) + 1))}${waves[1] ?? waves[0]} ${this.theme.fg("dim", elapsed)}`);
		};

		section("Running", running.length);
		if (running.length) running.slice(0, 10).forEach(row);
		else body.push(this.theme.fg("dim", "○ no active Hird agents"));
		if (running.length > 10) body.push(this.theme.fg("dim", `… ${running.length - 10} more running`));
		body.push("");

		section("Done", done.length);
		if (done.length) done.slice(0, 6).forEach(row);
		else body.push(this.theme.fg("dim", "— none complete yet"));
		if (done.length > 6) body.push(this.theme.fg("dim", `… ${done.length - 6} more complete`));
		body.push("");

		section("Idle", idle.length);
		const idleNames = idle.map(r => displayName(r.name).replace(/^Hird /, "")).join(" · ");
		for (const line of wrapWords(idleNames || "none", inner)) body.push(this.theme.fg("dim", `○ ${line}`));
		return this.frame(width, body);
	}

	private renderOrbit(width: number): string[] {
		const now = reducedMotion() ? 1000 : Date.now();
		const inner = Math.max(20, width - 4);
		if (!supportsBraille() || inner < 70) return this.renderLanes(width);
		const cols = Math.min(60, Math.max(34, inner - 4));
		const b = new Braille(cols, 18);
		const accent = themeRGB(this.theme, "accent", DEFAULT_ACCENT);
		const accent2 = themeRGB(this.theme, "borderAccent", DEFAULT_ACCENT2);
		const success = hexOf(themeRGB(this.theme, "success", DEFAULT_SUCCESS));
		const muted = hexOf(themeRGB(this.theme, "muted", DEFAULT_MUTED));
		const faint = hexOf(themeRGB(this.theme, "borderMuted", DEFAULT_FAINT));
		const bright = hexOf(themeRGB(this.theme, "text", DEFAULT_BRIGHT));
		const runs = this.runs();
		const running = runs.filter(r => r.state === "run");
		const done = runs.filter(r => r.state === "done" || r.state === "error");
		const idle = runs.filter(r => r.state === "idle");
		const cx = b.W / 2, cy = b.H / 2;
		b.disc(cx, cy, 4, bright, 4);
		b.arc(cx, cy, 7, plasma(0.5, accent, accent2), 3);
		const t = now * 0.001;
		running.forEach((run, i) => {
			const { seed, sp } = hashSeed(run.name);
			const a = seed + t * sp;
			const r = b.H * 0.62;
			const x = cx + Math.cos(a) * r;
			const y = cy + Math.sin(a) * r;
			const c = plasma((i % 6) / 5, accent, accent2);
			b.line(cx, cy, x, y, faint, 1);
			const pulse = (Math.sin(t * 3 * sp + seed) + 1) / 2;
			b.disc(cx + (x - cx) * pulse, cy + (y - cy) * pulse, 1.5, c, 2);
			b.disc(x, y, 2.3 + activityFor(run, now) * 1.2, c, 4);
		});
		done.slice(0, 14).forEach((run, i) => {
			const a = Math.PI * (1.08 + (i / Math.max(1, done.length - 1)) * 0.84);
			const x = cx + Math.cos(a) * b.H * 0.92;
			const y = cy + Math.sin(a) * b.H * 0.92;
			b.disc(x, y, 1.6, run.state === "error" ? hexOf(themeRGB(this.theme, "error", DEFAULT_SUCCESS)) : success, 3);
		});
		idle.slice(0, 20).forEach((run, i) => {
			const a = (Math.PI * 2 * i) / Math.max(1, idle.length);
			b.set(cx + Math.cos(a) * b.W * 0.46, cy + Math.sin(a) * b.H * 0.46, muted, 1);
		});
		const art = b.renderRows((glyph, color) => fgHex(this.theme, color, glyph));
		const legend = `${this.theme.bold(this.theme.fg("accent", "Orbital reactor"))} ${this.theme.fg("dim", "·")} ${running.length} orbiting ${this.theme.fg("dim", "·")} ${done.length} parked ${this.theme.fg("dim", "·")} ${idle.length} edge-idle`;
		return this.frame(width, [legend, ...art, this.theme.fg("dim", "f9 returns to activity lanes")]);
	}
}

function normalizeThinking(raw: unknown): ThinkingLevel | undefined {
	if (raw === undefined || raw === null) return undefined;
	const v = String(raw).trim().toLowerCase() as ThinkingLevel;
	return (VALID_THINKING as readonly string[]).includes(v) ? v : undefined;
}

function providerToCli(provider: unknown): string | undefined {
	if (typeof provider === "string" && provider.trim()) return provider.trim();
	if (provider && typeof provider === "object") {
		const p = provider as { id?: unknown; provider?: unknown };
		if (typeof p.id === "string" && p.id.trim()) return p.id.trim();
		if (typeof p.provider === "string" && p.provider.trim()) return p.provider.trim();
	}
	return undefined;
}

function modelToCli(model: unknown): string | undefined {
	if (typeof model === "string") return model.trim() || undefined;
	if (!model || typeof model !== "object") return undefined;
	const m = model as { id?: unknown; model?: unknown; modelId?: unknown; provider?: unknown; providerId?: unknown };
	const id =
		typeof m.id === "string" && m.id.trim() ? m.id.trim() :
		typeof m.model === "string" && m.model.trim() ? m.model.trim() :
		typeof m.modelId === "string" && m.modelId.trim() ? m.modelId.trim() :
		undefined;
	if (!id) return undefined;
	const provider = providerToCli(m.provider ?? m.providerId);
	return provider ? `${provider}/${id}` : id;
}

function displayName(name: string): string {
	return name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function parseAgentFile(filePath: string): HirdAgent | undefined {
	try {
		const raw = readFileSync(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(raw);
		if (!frontmatter?.name) return undefined;
		return {
			name: String(frontmatter.name),
			description: String(frontmatter.description ?? ""),
			tools: String(frontmatter.tools ?? "read,grep,find,ls"),
			model: frontmatter.model ? String(frontmatter.model) : undefined,
			provider: frontmatter.provider ? String(frontmatter.provider) : undefined,
			thinking: normalizeThinking(frontmatter.thinking ?? frontmatter.thinkingLevel),
			systemPrompt: (body || "").trim(),
			file: filePath,
		};
	} catch {
		return undefined;
	}
}

function loadAgents(): HirdAgent[] {
	if (!existsSync(HIRD_AGENT_DIR)) return [];
	return readdirSync(HIRD_AGENT_DIR)
		.filter(entry => entry.endsWith(".md"))
		.map(entry => parseAgentFile(join(HIRD_AGENT_DIR, entry)))
		.filter((a): a is HirdAgent => Boolean(a))
		.sort((a, b) => a.name.localeCompare(b.name));
}

function loadTeams(): Record<string, string[]> {
	const file = join(HIRD_AGENT_DIR, "teams.yaml");
	if (!existsSync(file)) return {};
	const teams: Record<string, string[]> = {};
	let current: string | undefined;
	for (const rawLine of readFileSync(file, "utf-8").split(/\r?\n/)) {
		const line = rawLine.replace(/\s+#.*$/, "");
		if (!line.trim() || line.trimStart().startsWith("#")) continue;
		const teamMatch = line.match(/^([A-Za-z0-9_-]+):\s*$/);
		if (teamMatch) {
			current = teamMatch[1];
			teams[current] = [];
			continue;
		}
		const itemMatch = line.match(/^\s*-\s*([A-Za-z0-9_-]+)\s*$/);
		if (current && itemMatch) teams[current].push(itemMatch[1]);
	}
	return teams;
}

function existingDirectory(path: string): string | undefined {
	try {
		return existsSync(path) && statSync(path).isDirectory() ? path : undefined;
	} catch {
		return undefined;
	}
}

function safePromptAssetPath(fileName: string): string {
	if (!/^[A-Za-z0-9_.-]+\.md$/.test(fileName)) throw new Error(`Invalid Hird prompt file name: ${fileName}`);
	const path = resolve(HIRD_PROMPTS_DIR, fileName);
	if (!isInside(HIRD_PROMPTS_DIR, path)) throw new Error("Refusing to read prompt outside Hird prompt directory");
	return path;
}

function validateBundledAssets(): string[] {
	const warnings: string[] = [];
	for (const [flow, file] of Object.entries(HIRD_FLOW_PROMPTS)) {
		try {
			const path = safePromptAssetPath(file);
			const raw = readFileSync(path, "utf-8");
			const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(raw);
			if (!frontmatter?.description) warnings.push(`${file}: missing description frontmatter`);
			if ((body || raw).includes("{{args}}") && !frontmatter?.["argument-hint"]) warnings.push(`${file}: uses {{args}} without argument-hint`);
			const unknown = Array.from((body || raw).matchAll(/{{\s*([A-Za-z0-9_-]+)\s*}}/g)).map(match => match[1]).filter(name => !["args", "cwd"].includes(name));
			if (unknown.length) warnings.push(`${file}: unknown template token(s): ${Array.from(new Set(unknown)).join(", ")}`);
			if (flow === "qaGate") {
				for (const required of ["result:", "review_depth:", "validation_evidence", "missing_evidence", "blocking_findings"]) {
					if (!(body || raw).toLowerCase().includes(required)) warnings.push(`${file}: missing QA contract marker ${required}`);
				}
			}
			if (flow === "next" && !(body || raw).toLowerCase().includes("do not start implementation")) warnings.push(`${file}: should forbid starting implementation`);
			if (flow === "onboard" && !(body || raw).toLowerCase().includes("confirmation")) warnings.push(`${file}: should mention confirmation before writes`);
		} catch (err) {
			warnings.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	try {
		for (const entry of readdirSync(HIRD_SKILLS_DIR, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const skillPath = join(HIRD_SKILLS_DIR, entry.name, "SKILL.md");
			if (!existsSync(skillPath)) {
				warnings.push(`${entry.name}: missing SKILL.md`);
				continue;
			}
			const raw = readFileSync(skillPath, "utf-8");
			const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(raw);
			if (frontmatter?.name !== entry.name) warnings.push(`${entry.name}: frontmatter name must match directory`);
			if (!frontmatter?.description) warnings.push(`${entry.name}: missing description`);
			if (!frontmatter?.license) warnings.push(`${entry.name}: missing license`);
			if (!String(body || "").toLowerCase().includes("safety")) warnings.push(`${entry.name}: missing safety guidance section`);
		}
	} catch (err) {
		warnings.push(`skills: ${err instanceof Error ? err.message : String(err)}`);
	}
	return warnings;
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = (process as any).argv?.[1] as string | undefined;
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript) {
		try {
			if (existsSync(currentScript)) return { command: process.execPath, args: [currentScript, ...args] };
		} catch {}
	}
	const execName = basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	return isGenericRuntime ? { command: "pi", args } : { command: process.execPath, args };
}

function writePromptToTempFile(name: string, prompt: string): { dir: string; file: string } {
	const dir = mkdtempSync(join(tmpdir(), "hird-agent-"));
	const safe = name.replace(/[^\w.-]+/g, "_");
	const file = join(dir, `prompt-${safe}.md`);
	writeFileSync(file, prompt, { encoding: "utf-8", mode: 0o600 });
	return { dir, file };
}

function assistantText(message: any): string {
	const content = Array.isArray(message?.content) ? message.content : [];
	return content
		.map((part: any) => {
			if (part?.type === "text" && typeof part.text === "string") return part.text;
			if (typeof part === "string") return part;
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function buildOrchestratorPrompt(agents: HirdAgent[], teams: Record<string, string[]>): string {
	const orchestrator = agents.find(a => a.name === "hird-orchestrator");
	const base = orchestrator?.systemPrompt || "You are Hird Orchestrator.";
	const roster = agents
		.map(a => `- \`${a.name}\` — ${a.description} (tools: ${a.tools}; thinking: ${a.thinking ?? "default"})`)
		.join("\n");
	const teamList = Object.entries(teams)
		.map(([name, members]) => `- \`${name}\`: ${members.join(", ")}`)
		.join("\n") || "- none loaded";

	return `${base}

## Extension runtime

The Hird extension is active. You have bundled Hird skills and deterministic prompt templates for onboarding, next-task selection, workflow, handover lint, QA gate, PR review, memory commit, and shipping. Prefer these fixed flows over freeform prose.

Extension tools:

- \`hird_agent_info\`: list or inspect bundled Hird agents and teams.
- \`hird_dispatch_agent\`: spawn one or more bundled Hird agents in isolated Pi subprocesses. Use this for all Tier 2/3 lead, coder, reviewer, validator, and scout handoffs.
- \`hird_memory\`: read, propose, commit, or inspect Hird project/global memory. Only you may commit memory; specialists may only propose deltas in their text output.

Bundled Hird skills to use when relevant: \`hird-dev-team\`, \`hird-onboarding\`, \`hird-board\`, \`hird-github\`, \`hird-handover\`, \`hird-qa-gate\`, \`hird-pr-review\`, \`hird-memory\`, \`hird-shipping\`.

When using \`hird_dispatch_agent\`, send concrete handoff prompts that include objective, scope, constraints, required output, whether editing is allowed, and any relevant memory excerpts. Use \`mode: "parallel"\` only for independent read-only work or disjoint implementation packets; use \`mode: "chain"\` when the next agent must receive the prior output through the \`{previous}\` placeholder.

## Bundled Hird roster
${roster}

## Bundled Hird teams
${teamList}
`;
}

async function runAgent(
	agent: HirdAgent,
	prompt: string,
	ctx: any,
	signal?: AbortSignal,
	hooks?: {
		onEvent?: (line: string) => void;
		onFinish?: (result: RunResult) => void;
	},
): Promise<RunResult> {
	const args: string[] = ["--mode", "json", "-p", "--no-session", "--no-extensions"];
	const inheritedModel = modelToCli(ctx?.model);
	const explicitModel = typeof agent.model === "string" && agent.model.trim() ? agent.model.trim() : undefined;
	const model = explicitModel || inheritedModel;
	if (agent.provider && explicitModel && !explicitModel.includes("/")) args.push("--provider", agent.provider);
	if (model) args.push("--model", model);
	args.push("--tools", agent.tools);
	if (agent.thinking) args.push("--thinking", agent.thinking);

	let promptTmp: { dir: string; file: string } | undefined;
	try {
		promptTmp = writePromptToTempFile(agent.name, agent.systemPrompt);
		args.push("--append-system-prompt", promptTmp.file);
	} catch {
		if (agent.systemPrompt) args.push("--append-system-prompt", agent.systemPrompt);
	}
	args.push(prompt);

	const start = Date.now();
	const textParts: string[] = [];
	let stderrBuf = "";
	let stopReason: string | undefined;
	let errorMessage: string | undefined;
	let resolvedModel: string | undefined;

	return await new Promise<RunResult>((resolve) => {
		const invocation = getPiInvocation(args);
		const proc = spawn(invocation.command, invocation.args, {
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env },
		});

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

		const handleEvent = (event: any) => {
			if (event?.type === "message_end" && event.message?.role === "assistant") {
				const t = assistantText(event.message);
				if (t) {
					textParts.push(t);
					const last = t.split("\n").filter((line: string) => line.trim()).pop();
					if (last) hooks?.onEvent?.(last.slice(0, 160));
				}
				if (event.message.stopReason) stopReason = event.message.stopReason;
				if (event.message.errorMessage) errorMessage = event.message.errorMessage;
				if (event.message.model && !resolvedModel) resolvedModel = event.message.model;
				return;
			}
			if (event?.type === "tool_result_end" && event.message?.content) {
				const first = event.message.content.find?.((p: any) => p?.type === "toolResult");
				const preview = String(first?.output || first?.content || "").split("\n").find((line: string) => line.trim());
				if (preview) hooks?.onEvent?.(preview.slice(0, 160));
			}
		};

		let buffer = "";
		proc.stdout?.setEncoding("utf-8");
		proc.stdout?.on("data", (chunk: string) => {
			buffer += chunk;
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) {
				if (!line.trim()) continue;
				try { handleEvent(JSON.parse(line)); }
				catch { hooks?.onEvent?.(line.slice(0, 160)); }
			}
		});

		proc.stderr?.setEncoding("utf-8");
		proc.stderr?.on("data", (chunk: string) => {
			stderrBuf += chunk;
			const last = chunk.split("\n").filter(line => line.trim()).pop();
			if (last) hooks?.onEvent?.(last.slice(0, 160));
		});

		const cleanup = () => {
			if (killTimer) clearTimeout(killTimer);
			if (signal) signal.removeEventListener("abort", onAbort);
			if (promptTmp) {
				try { unlinkSync(promptTmp.file); } catch {}
				try { rmdirSync(promptTmp.dir); } catch {}
			}
		};

		proc.on("close", (code) => {
			if (buffer.trim()) {
				try { handleEvent(JSON.parse(buffer)); } catch {}
			}
			cleanup();
			const fullOutput = textParts.join("\n");
			const wasCancelled = signal?.aborted || stopReason === "aborted";
			const isError = !wasCancelled && ((code !== 0) || stopReason === "error");
			const raw = isError && errorMessage
				? `[${stopReason || "error"}] ${errorMessage}${stderrBuf.trim() ? `\n\n--- stderr ---\n${stderrBuf.trim()}` : ""}`
				: wasCancelled ? "cancelled" : (fullOutput || stderrBuf.trim() || "(no assistant output)");
			const trunc = truncateHead(raw, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
			const result: RunResult = {
				agent: agent.name,
				prompt,
				status: wasCancelled ? "cancelled" : isError ? "error" : "done",
				exitCode: code ?? (isError ? 1 : 0),
				elapsedMs: Date.now() - start,
				output: trunc.content,
				fullOutput: raw,
				truncated: trunc.truncated,
				stopReason,
				errorMessage,
				model: resolvedModel,
			};
			hooks?.onFinish?.(result);
			resolve(result);
		});

		proc.on("error", (err) => {
			cleanup();
			const result: RunResult = {
				agent: agent.name,
				prompt,
				status: "error",
				exitCode: 1,
				elapsedMs: Date.now() - start,
				output: `Error spawning ${agent.name}: ${err.message}`,
				fullOutput: `Error spawning ${agent.name}: ${err.message}`,
				truncated: false,
				stopReason: "error",
				errorMessage: err.message,
			};
			hooks?.onFinish?.(result);
			resolve(result);
		});
	});
}

// ── Extension entry point ────────────────────────────────────────────────

export default function hird(pi: ExtensionAPI) {
	let agents: HirdAgent[] = [];
	let teams: Record<string, string[]> = {};
	let previousThemeName: string | undefined;
	let cachedSystemPrompt: string | undefined;
	let widgetCtx: any;
	let hintsVisible = true;
	let activityVisible = true;
	let activityMode: HirdViewMode = "lanes";
	let activityRevision = 0;
	let activityComponent: Component | undefined;
	let activityTui: any;
	let activityTicker: ReturnType<typeof setInterval> | undefined;
	let currentCwd = process.cwd();
	let assetWarnings: string[] = [];
	const activityRuns = new Map<string, HirdActivityRun>();

	function errMsg(err: unknown): string {
		return err instanceof Error ? err.message : String(err);
	}

	function notifySafe(ctx: any, message: string, level: "info" | "success" | "warning" | "error" = "info"): void {
		try {
			if (ctx?.hasUI !== false && ctx?.ui?.notify) ctx.ui.notify(message, level);
			else if (level === "error" || level === "warning") console.error(`[hird] ${level}: ${message}`);
		} catch {}
	}

	function setWidgetSafe(ctx: any, key: string, value: any, opts?: any): boolean {
		try {
			if (ctx?.hasUI === false || !ctx?.ui?.setWidget) return false;
			ctx.ui.setWidget(key, value, opts);
			return true;
		} catch (err) {
			console.error(`[hird] setWidget(${key}) failed: ${errMsg(err)}`);
			return false;
		}
	}

	function hirdStartLines(): string[] {
		return [
			"ᚺ Hird is active — disciplined lead → coder → QA engineering retinue.",
			"Start: /hird or F10 opens selector. Help: /hird-help.",
			"New project: /hird-onboard → /hird-workflow → /hird-next → /hird <task> → /hird-ship",
			"Deterministic flows: /hird-handover-lint · /hird-qa-gate · /hird-pr-review · /hird-memory-commit",
			"Activity: F8 toggle · F9 lanes/orbit. Roster: /hird-agents. Status: /hird-team.",
			"Hints: F7 or /hird-hints toggles this panel.",
		];
	}

	function renderHirdHints(ctx = widgetCtx): void {
		if (!ctx) return;
		if (!hintsVisible) {
			setWidgetSafe(ctx, "hird-start", undefined);
			return;
		}
		setWidgetSafe(ctx, "hird-start", (_tui: any, theme: any) => ({
			render(width: number): string[] {
				return hirdStartLines().map(line => {
					if (line.startsWith("New project:")) return truncateToWidth(theme.fg("accent", theme.bold(line)), width);
					if (line.startsWith("Hints:")) return truncateToWidth(theme.fg("dim", line), width);
					return truncateToWidth(line, width);
				});
			},
			invalidate(): void {},
		}), { placement: "aboveEditor" });
	}

	function toggleHirdHints(ctx: any): void {
		widgetCtx = ctx ?? widgetCtx;
		if (ctx?.cwd) {
			currentCwd = ctx.cwd;
			hirdProjectCwd = ctx.cwd;
		}
		hintsVisible = !hintsVisible;
		renderHirdHints(widgetCtx);
		notifySafe(ctx ?? widgetCtx, hintsVisible ? "Hird startup hints shown" : "Hird startup hints hidden", "info");
	}

	function setEditorTextSafe(ctx: any, text: string): boolean {
		try {
			if (ctx?.hasUI === false || !ctx?.ui?.setEditorText) return false;
			ctx.ui.setEditorText(text);
			return true;
		} catch (err) {
			console.error(`[hird] setEditorText failed: ${errMsg(err)}`);
			return false;
		}
	}

	async function selectSafe<T extends string>(ctx: any, title: string, options: readonly T[]): Promise<T | undefined> {
		try {
			if (ctx?.hasUI === false || !ctx?.ui?.select) return undefined;
			return await ctx.ui.select(title, [...options]) as T | undefined;
		} catch (err) {
			notifySafe(ctx, `Hird selector failed: ${errMsg(err)}`, "warning");
			return undefined;
		}
	}

	function registerHirdCommand(name: string, description: string, handler: (args: string, ctx: any) => Promise<void> | void): void {
		pi.registerCommand(name, {
			description,
			handler: async (args: string, ctx: any) => {
				try {
					if (ctx?.cwd) {
						currentCwd = ctx.cwd;
						hirdProjectCwd = ctx.cwd;
					}
					await handler(args ?? "", ctx);
				} catch (err) {
					notifySafe(ctx, `/${name} failed: ${errMsg(err)}`, "error");
				}
			},
		});
	}

	function agentByName(name: string): HirdAgent | undefined {
		const key = name.trim().toLowerCase();
		return agents.find(a => a.name.toLowerCase() === key);
	}

	function refresh() {
		agents = loadAgents();
		teams = loadTeams();
		assetWarnings = validateBundledAssets();
		cachedSystemPrompt = undefined;
		seedIdleAgents();
	}

	function seedIdleAgents(): void {
		for (const agent of agents) {
			if (!activityRuns.has(agent.name)) {
				activityRuns.set(agent.name, {
					name: agent.name,
					query: "",
					state: "idle",
					lastLine: "idle",
				});
			}
		}
	}

	function hasRunningActivity(): boolean {
		return Array.from(activityRuns.values()).some(run => run.state === "run");
	}

	function bumpActivity(): void {
		activityRevision++;
		activityComponent?.invalidate();
		activityTui?.requestRender?.();
		ensureActivityTicker();
	}

	function safeAgentFileName(agentName: string): string {
		return agentName.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") + ".json";
	}

	function writeAgentStatusSnapshot(run: HirdActivityRun, result?: RunResult): void {
		if (!run.startedAt) return;
		try {
			const path = safeProjectHirdPath(currentCwd, "status", "agents", safeAgentFileName(run.name));
			const snapshot = {
				schemaVersion: 2,
				runId: `${run.name}-${run.startedAt}`,
				cwd: currentCwd,
				agent: run.name,
				state: run.state,
				queryPreview: redactedPreview(run.query, 120),
				queryHash: stableHash(run.query),
				lastLine: redactedPreview(run.lastLine, 180),
				startedAt: run.startedAt ? new Date(run.startedAt).toISOString() : undefined,
				endedAt: run.endedAt ? new Date(run.endedAt).toISOString() : undefined,
				lastActivityAt: run.lastActivityAt ? new Date(run.lastActivityAt).toISOString() : undefined,
				elapsedMs: result?.elapsedMs,
				exitCode: result?.exitCode,
				stopReason: result?.stopReason,
				errorMessage: result?.errorMessage ? redactedPreview(result.errorMessage, 240) : undefined,
				model: result?.model,
				updatedAt: new Date().toISOString(),
			};
			atomicWrite(path, JSON.stringify(snapshot, null, 2) + "\n");
		} catch {
			// Status snapshots are diagnostic only; never break agent dispatch.
		}
	}

	function setActivityRun(name: string, patch: Partial<HirdActivityRun>, result?: RunResult): void {
		const prev = activityRuns.get(name) || { name, query: "", state: "idle", lastLine: "idle" } as HirdActivityRun;
		const next = { ...prev, ...patch, name };
		activityRuns.set(name, next);
		writeAgentStatusSnapshot(next, result);
		bumpActivity();
	}

	function ensureActivityTicker(): void {
		if (!activityVisible || reducedMotion() || !process.stdout.isTTY || !hasRunningActivity()) {
			if (activityTicker) {
				clearInterval(activityTicker);
				activityTicker = undefined;
			}
			return;
		}
		if (activityTicker) return;
		activityTicker = setInterval(() => {
			if (!hasRunningActivity() || !activityVisible) {
				ensureActivityTicker();
				return;
			}
			activityComponent?.invalidate();
			activityTui?.requestRender?.();
		}, 66);
	}

	function updateActivityWidget(): void {
		if (!widgetCtx?.ui) return;
		if (!activityVisible) {
			setWidgetSafe(widgetCtx, "hird-activity", undefined);
			activityComponent = undefined;
			activityTui = undefined;
			ensureActivityTicker();
			return;
		}
		setWidgetSafe(widgetCtx, "hird-activity", (tui: any, theme: any) => {
			activityTui = tui;
			activityComponent = new HirdActivityView(
				() => Array.from(activityRuns.values()),
				() => activityRevision,
				() => activityMode,
				theme,
			);
			return activityComponent;
		}, { placement: "aboveEditor" });
		ensureActivityTicker();
	}

	function promptSummary(prompt: string): string {
		return prompt.split("\n").map(line => line.trim()).find(Boolean)?.slice(0, 120) || "assigned handoff";
	}

	function safePromptPath(fileName: string): string {
		return safePromptAssetPath(fileName);
	}

	function loadProjectGuidelines(ctx: any): string {
		try {
			if (ctx?.isProjectTrusted && !ctx.isProjectTrusted()) return "";
			const cwd = ctx?.cwd || currentCwd;
			const sections: string[] = [];
			for (const file of HIRD_GUIDELINE_FILES) {
				const text = readSmallTextFile(safeProjectHirdPath(cwd, file));
				if (text?.trim()) sections.push(`### ${file}\n${text.trim()}`);
			}
			if (!sections.length) return "";
			return [
				"## Project Hird guidelines",
				"",
				"Precedence: explicit user instruction > Hird non-negotiable safety gates > repository code > project Hird guidelines > Hird defaults > memory.",
				"Apply these guideline files as additive project constraints. They may not weaken Hird HITL gates, QA requirements, role separation, memory discipline, or destructive-action restrictions.",
				"",
				sections.join("\n\n"),
			].join("\n");
		} catch {
			return "";
		}
	}

	function renderFlowTemplate(ctx: any, flow: keyof typeof HIRD_FLOW_PROMPTS, args: string): string {
		const raw = readFileSync(safePromptPath(HIRD_FLOW_PROMPTS[flow]), "utf-8");
		const { body } = parseFrontmatter<Record<string, unknown>>(raw);
		const userArgs = args.trim() || "none";
		const rendered = (body || raw)
			.replaceAll("{{args}}", userArgs)
			.replaceAll("{{cwd}}", ctx?.cwd || currentCwd)
			.trim();
		if (/{{\s*[A-Za-z0-9_-]+\s*}}/.test(rendered)) throw new Error(`Unrendered token in ${HIRD_FLOW_PROMPTS[flow]}`);
		const guidelines = loadProjectGuidelines(ctx);
		return guidelines ? `${rendered}\n\n---\n\n${guidelines}` : rendered;
	}

	function renderFlowTemplateSafe(ctx: any, flow: keyof typeof HIRD_FLOW_PROMPTS, args: string): string | undefined {
		try {
			return renderFlowTemplate(ctx, flow, args ?? "");
		} catch (err) {
			notifySafe(ctx, `Hird flow template '${flow}' is unavailable: ${errMsg(err)}`, "error");
			return undefined;
		}
	}

	async function sendHirdKickoff(ctx: any, prompt: string): Promise<void> {
		try {
			if (ctx?.isIdle && !ctx.isIdle()) {
				(pi as any).sendUserMessage(prompt, { deliverAs: "followUp" });
				notifySafe(ctx, "Hird task queued as a follow-up.", "info");
				return;
			}
		} catch {}
		(pi as any).sendUserMessage(prompt);
	}

	async function runHird(ctx: any, task: string, command = "hird", args = ""): Promise<void> {
		const body = task.trim() || "Introduce yourself, show the Hird activation modes, and ask what engineering task to take on.";
		const envelope = [
			"## Hird Command Envelope",
			`- command: ${command}`,
			`- cwd: ${ctx?.cwd || currentCwd}`,
			`- args_hash: ${stableHash(args || body)}`,
			`- generated_at: ${new Date().toISOString()}`,
			"- must_use_template: true",
			"- project_guidelines_are_additive_only: true",
			"- completion_requires_declared_result: true",
		].join("\n");
		await sendHirdKickoff(ctx, `Use Hird. Treat this as a /${command} orchestrator task.\n\n${envelope}\n\nTask:\n${body}\n\nRoute this through the Hird orchestrator protocol. Keep star topology: orchestrator talks to the user, specialists report back.`);
	}

	function hirdHelpLines(): string[] {
		return [
			"ᚺ Hird cheat sheet",
			"",
			"New project flow:",
			"  1. /hird-onboard        discover setup, memory, board/task sources",
			"  2. /hird-workflow       tune Hird's project workflow",
			"  3. /hird-next           pick next task from onboarded sources only",
			"  4. /hird <task>         run lead → coder → QA on approved work",
			"  5. /hird-ship           final validation and ship/no-ship check",
			"",
			"Deterministic flows:",
			"  /hird-handover-lint     lint Handover Spec readiness",
			"  /hird-qa-gate           run QA gate for task/diff",
			"  /hird-pr-review         PR/diff review with sorted findings + inline comments",
			"  /hird-memory-commit     propose/commit durable memory",
			"",
			"UI:",
			"  /hird                  open selector; /hird <task> runs directly",
			"  /hird-help             show this cheat sheet",
			"  /hird-hints            toggle startup hints (F7)",
			"  /hird-agents           show roster",
			"  /hird-view lanes|orbit control activity view",
			"  F7 hints · F8 toggle activity · F9 lanes/orbit · F10 selector",
			"",
			"Project guideline files:",
			"  .pi/hird/HIRD_GUIDELINES.md",
			"  .pi/hird/QA_GUIDELINES.md",
			"  .pi/hird/ARCHITECTURE_GUIDELINES.md",
			"  .pi/hird/FRONTEND_GUIDELINES.md",
			"  .pi/hird/BACKEND_GUIDELINES.md",
			"  .pi/hird/DEVOPS_GUIDELINES.md",
			"  .pi/hird/SHIPPING_GUIDELINES.md",
			"  .pi/hird/BOARD_GUIDELINES.md",
			"",
			"Diagnostics:",
			"  .pi/hird/status/agents/*.json stores latest specialist run snapshots",
		];
	}

	function showHirdHelp(ctx: any): void {
		const lines = hirdHelpLines();
		if (!setWidgetSafe(ctx, "hird-help", lines)) notifySafe(ctx, lines.join("\n"), "info");
	}

	async function runRenderedFlow(ctx: any, flow: keyof typeof HIRD_FLOW_PROMPTS, args: string, command: string): Promise<void> {
		const rendered = renderFlowTemplateSafe(ctx, flow, args);
		if (!rendered) return;
		await runHird(ctx, rendered, command, args);
	}

	async function runHirdSelector(ctx: any): Promise<void> {
		const options = [
			"Onboard project",
			"Pick next task",
			"Run custom Hird task",
			"Define/refine workflow",
			"Run QA gate",
			"PR review",
			"Ship readiness",
			"Show team/status",
			"Show help",
		] as const;
		if (ctx?.hasUI === false || !ctx?.ui?.select) {
			showHirdHelp(ctx);
			notifySafe(ctx, "Non-interactive mode: run /hird <task> or a specific command such as /hird-onboard.", "info");
			return;
		}
		const choice = await selectSafe(ctx, "ᚺ Hird: choose a flow", options);
		if (!choice) return;
		if (choice === "Onboard project") return runRenderedFlow(ctx, "onboard", "", "hird-onboard");
		if (choice === "Pick next task") return runRenderedFlow(ctx, "next", "", "hird-next");
		if (choice === "Define/refine workflow") return runRenderedFlow(ctx, "workflow", "", "hird-workflow");
		if (choice === "Run QA gate") return runRenderedFlow(ctx, "qaGate", "", "hird-qa-gate");
		if (choice === "PR review") return runRenderedFlow(ctx, "prReview", "", "hird-pr-review");
		if (choice === "Ship readiness") return runRenderedFlow(ctx, "ship", "", "hird-ship");
		if (choice === "Show team/status") return runRenderedFlow(ctx, "team", "", "hird-team");
		if (choice === "Show help") return showHirdHelp(ctx);
		if (choice === "Run custom Hird task") {
			if (setEditorTextSafe(ctx, "/hird ")) notifySafe(ctx, "Describe the task after /hird and press Enter.", "info");
			else notifySafe(ctx, "Send /hird <task> manually in this mode.", "info");
		}
	}

	const agentInfoSchema = Type.Object({

		agent: Type.Optional(Type.String({ description: "Bundled Hird agent name. Omit to list all agents." })),
		team: Type.Optional(Type.String({ description: "Bundled Hird team name. Omit to list all teams." })),
		format: Type.Optional(StringEnum(["summary", "full"] as const)),
	});

	pi.registerTool({
		name: "hird_agent_info",
		label: "Hird Agent Info",
		description: "List or inspect Hird's bundled agents and teams.",
		promptSnippet: "Inspect the bundled Hird engineering retinue agents or teams.",
		promptGuidelines: [
			"Use hird_agent_info when you need the Hird roster, team membership, or a specific agent's instructions.",
		],
		parameters: agentInfoSchema,
		async execute(_toolCallId, params) {
			const p = params as { agent?: string; team?: string; format?: "summary" | "full" };
			if (p.team) {
				const members = teams[p.team];
				if (!members) throw new Error(`Unknown Hird team: ${p.team}`);
				return {
					content: [{ type: "text", text: `${p.team}: ${members.join(", ")}` }],
					details: { team: p.team, members },
				};
			}
			if (p.agent) {
				const agent = agentByName(p.agent);
				if (!agent) throw new Error(`Unknown Hird agent: ${p.agent}`);
				const text = p.format === "full"
					? [`# ${agent.name}`, "", agent.description, "", `Tools: ${agent.tools}`, `Thinking: ${agent.thinking ?? "default"}`, "", agent.systemPrompt].join("\n")
					: `${agent.name}: ${agent.description}\nTools: ${agent.tools}\nThinking: ${agent.thinking ?? "default"}`;
				const trunc = truncateHead(text, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
				return {
					content: [{ type: "text", text: trunc.content }],
					details: { agent, truncated: trunc.truncated },
				};
			}
			const lines = [
				`Hird agents (${agents.length}):`,
				...agents.map(a => `- ${a.name}: ${a.description}`),
				"",
				"Teams:",
				...Object.entries(teams).map(([name, members]) => `- ${name}: ${members.join(", ")}`),
			];
			return { content: [{ type: "text", text: lines.join("\n") }], details: { agents, teams } };
		},
		renderCall(args, theme) {
			const label = (args as any).agent || (args as any).team || "roster";
			return new Text(theme.fg("toolTitle", "hird_agent_info ") + theme.fg("muted", String(label)), 0, 0);
		},
		renderResult(result, _ctx, theme) {
			const count = Array.isArray((result as any).details?.agents) ? (result as any).details.agents.length : undefined;
			const text = count !== undefined ? `Hird roster: ${count} agents` : "Hird info loaded";
			return new Text(theme.fg("success", `✓ ${text}`), 0, 0);
		},
	});

	const memorySchema = Type.Object({
		action: StringEnum(["read", "propose", "commit", "status"] as const, {
			description: "read memory, propose a delta, commit a delta, or show memory status",
		}),
		target: Type.Optional(StringEnum(["project", "global"] as const)),
		file: Type.Optional(StringEnum(["conventions", "frontend", "backend", "devops", "qa", "architecture"] as const)),
		proposalId: Type.Optional(Type.String({ description: "Proposal id to commit." })),
		decision: Type.Optional(Type.String({ description: "Durable decision/convention to propose or commit." })),
		date: Type.Optional(Type.String({ description: "YYYY-MM-DD; defaults to today." })),
		scope: Type.Optional(Type.String({ description: "frontend|backend|devops|qa|architecture|cross-cutting or narrower scope." })),
		status: Type.Optional(StringEnum(["active", "deprecated"] as const)),
		supersedes: Type.Optional(Type.String({ description: "Entry/decision superseded by this delta; use none if not applicable." })),
		rationale: Type.Optional(Type.String({ description: "Why this memory is durable and worth saving." })),
		limit: Type.Optional(Type.Number({ minimum: 1, maximum: 120 })),
	});

	pi.registerTool({
		name: "hird_memory",
		label: "Hird Memory",
		description: "Read, propose, commit, or inspect Hird project/global memory. Subagents cannot access this tool; only the orchestrator commits memory.",
		promptSnippet: "Use hird_memory to read Hird memory or commit approved durable deltas using single-writer discipline.",
		promptGuidelines: [
			"Read Hird memory before relying on long-term project/global conventions.",
			"Use propose for uncommitted deltas from specialists; use commit only after resolving conflicts and verifying the delta is durable.",
			"Do not store secrets, credentials, tokens, PII, or task-local trivia. Deprecate stale entries instead of deleting them.",
		],
		parameters: memorySchema,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (ctx?.cwd) hirdProjectCwd = ctx.cwd;
			const p = params as {
				action: HirdMemoryAction;
				target?: HirdMemoryScope;
				file?: HirdMemoryFile;
				proposalId?: string;
				decision?: string;
				date?: string;
				scope?: string;
				status?: HirdMemoryDeltaStatus;
				supersedes?: string;
				rationale?: string;
				limit?: number;
			};
			const target = p.target ?? "project";
			const file = p.file ?? "conventions";
			if (target === "global" && file !== "conventions" && p.action !== "status") {
				throw new Error("Global Hird memory supports only conventions.md; use target=project for domain notes.");
			}

			if (p.action === "status") {
				const roots = target ? [target] as HirdMemoryScope[] : ["project", "global"] as HirdMemoryScope[];
				const lines: string[] = [];
				for (const t of roots) {
					const root = memoryRoot(t);
					const proposals = readProposals(t);
					lines.push(`${t} root: ${root}`);
					lines.push(`proposals: ${proposals.length}`);
					const files = t === "global" ? ["conventions"] as HirdMemoryFile[] : ["conventions", "frontend", "backend", "devops", "qa", "architecture"] as HirdMemoryFile[];
					for (const f of files) {
						const path = memoryPath(t, f);
						let bytes = 0;
						try { bytes = statSync(path).size; } catch {}
						lines.push(`- ${PROJECT_MEMORY_FILES[f]}: ${existsSync(path) ? `${bytes} bytes` : "missing"}`);
					}
				}
				return { content: [{ type: "text", text: lines.join("\n") }], details: { action: p.action, target } };
			}

			if (p.action === "read") {
				const path = memoryPath(target, file);
				const raw = readMemoryFile(target, file) || `No ${target} ${PROJECT_MEMORY_FILES[file]} memory.`;
				const trunc = truncateHead(raw, { maxBytes: DEFAULT_MAX_BYTES, maxLines: p.limit ?? DEFAULT_MAX_LINES });
				return {
					content: [{ type: "text", text: trunc.content }],
					details: { action: p.action, target, file, path, truncated: trunc.truncated },
				};
			}

			if (p.action === "propose") {
				if (!p.decision || !p.rationale) throw new Error("hird_memory propose requires decision and rationale");
				bootstrapMemory(target);
				const proposal: HirdMemoryProposal = {
					id: randomUUID(),
					target,
					file,
					decision: normalizeMemoryText(p.decision, "memory decision"),
					date: p.date || today(),
					scope: p.scope || file,
					status: p.status || "active",
					supersedes: p.supersedes || "none",
					rationale: normalizeMemoryText(p.rationale, "memory rationale"),
					createdAt: new Date().toISOString(),
				};
				const proposals = readProposals(target);
				proposals.push(proposal);
				writeProposals(target, proposals);
				return {
					content: [{ type: "text", text: `Proposed ${target}/${PROJECT_MEMORY_FILES[file]} memory ${proposal.id}: ${proposal.decision}` }],
					details: { action: p.action, target, file, proposal },
				};
			}

			if (p.action === "commit") {
				bootstrapMemory(target);
				let delta: Omit<HirdMemoryProposal, "id" | "target" | "file" | "createdAt">;
				let proposal: HirdMemoryProposal | undefined;
				if (p.proposalId) {
					const proposals = readProposals(target);
					const idx = proposals.findIndex(item => item.id === p.proposalId);
					if (idx < 0) throw new Error(`Unknown Hird memory proposal: ${p.proposalId}`);
					proposal = proposals[idx];
					proposals.splice(idx, 1);
					writeProposals(target, proposals);
					delta = {
						decision: proposal.decision,
						date: proposal.date,
						scope: proposal.scope,
						status: proposal.status,
						supersedes: proposal.supersedes,
						rationale: proposal.rationale,
					};
				} else {
					if (!p.decision || !p.rationale) throw new Error("hird_memory commit requires proposalId or decision+rationale");
					delta = {
						decision: normalizeMemoryText(p.decision, "memory decision"),
						date: p.date || today(),
						scope: p.scope || file,
						status: p.status || "active",
						supersedes: p.supersedes || "none",
						rationale: normalizeMemoryText(p.rationale, "memory rationale"),
					};
				}
				const commitTarget = proposal?.target ?? target;
				const commitFile = proposal?.file ?? file;
				const path = memoryPath(commitTarget, commitFile);
				const prior = readMemoryFile(commitTarget, commitFile) || MEMORY_HEADER;
				atomicWrite(path, prior.replace(/\s*$/, "\n") + memoryEntry(delta));
				return {
					content: [{ type: "text", text: `Committed ${commitTarget}/${PROJECT_MEMORY_FILES[commitFile]} memory: ${delta.decision}` }],
					details: { action: p.action, target: commitTarget, file: commitFile, path, committed: delta, proposalId: p.proposalId },
				};
			}

			throw new Error(`Unsupported hird_memory action: ${p.action}`);
		},
		renderCall(args, theme) {
			const p = args as { action?: string; target?: string; file?: string };
			return new Text(theme.fg("toolTitle", "hird_memory ") + theme.fg("muted", `${p.action ?? "?"} ${p.target ?? "project"}/${p.file ?? "conventions"}`), 0, 0);
		},
		renderResult(result, options, theme) {
			const d = (result as any).details || {};
			let text = theme.fg("success", `✓ hird memory ${d.action ?? "done"}`);
			if (options.expanded && d.path) text += `\n${theme.fg("dim", d.path)}`;
			if (options.expanded && d.proposal?.id) text += `\nproposal: ${d.proposal.id}`;
			return new Text(text, 0, 0);
		},
	});

	const dispatchSchema = Type.Object({
		mode: Type.Optional(StringEnum(["parallel", "chain"] as const)),
		tasks: Type.Array(Type.Object({
			agent: Type.String({ description: "Bundled Hird agent name, e.g. hird-backend-lead." }),
			prompt: Type.String({ description: "Concrete handoff prompt for this agent. In chain mode, may include {previous}." }),
		})),
	});

	pi.registerTool({
		name: "hird_dispatch_agent",
		label: "Dispatch Hird Agent",
		description: "Spawn bundled Hird agents as isolated Pi subprocesses. Supports parallel or chain dispatch.",
		promptSnippet: "Dispatch Hird specialists with explicit role objectives, scope, constraints, and output contracts.",
		promptGuidelines: [
			"Use hird_dispatch_agent for Tier 2/3 Hird work instead of role-playing every specialist in the main context.",
			"Each task must name an agent and include a complete handoff with objective, scope, out-of-scope, safety constraints, and required output format.",
			"Use chain mode when a later prompt needs the prior result via {previous}; otherwise use parallel only for independent work.",
		],
		parameters: dispatchSchema,
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const p = params as { mode?: "parallel" | "chain"; tasks?: { agent: string; prompt: string }[] };
			const tasks = p.tasks || [];
			const mode = p.mode === "chain" ? "chain" : "parallel";
			if (tasks.length === 0) {
				return { content: [{ type: "text", text: "No Hird dispatch tasks provided." }], details: { status: "error", results: [] } };
			}

			const resolved = tasks.map(task => {
				const agent = agentByName(task.agent);
				if (!agent) throw new Error(`Unknown Hird agent: ${task.agent}`);
				return { agent, prompt: task.prompt };
			});

			const emitPartial = (results: RunResult[] = []) => {
				onUpdate?.({
					content: [{
						type: "text",
						text: Array.from(activityRuns.values())
							.filter(run => resolved.some(r => r.agent.name === run.name))
							.map(run => {
								const icon = run.state === "run" ? "◉" : run.state === "done" ? "✓" : run.state === "error" ? "✗" : "○";
								return `${icon} ${run.name}: ${run.lastLine || run.state}`;
							})
							.join("\n") || `Dispatching ${resolved.length} Hird agent(s)`,
					}],
					details: { status: "running", mode, agents: resolved.map(r => r.agent.name), results },
				});
			};

			emitPartial();

			const runOne = async (task: { agent: HirdAgent; prompt: string }): Promise<RunResult> => {
				const startedAt = Date.now();
				const memory = relevantMemoryForAgent(task.agent.name);
				const dispatchedPrompt = memory ? `${task.prompt}\n\n---\n\n${memory}` : task.prompt;
				setActivityRun(task.agent.name, {
					state: "run",
					query: promptSummary(task.prompt),
					startedAt,
					endedAt: undefined,
					lastLine: "starting",
					lastActivityAt: startedAt,
				});
				return await runAgent(task.agent, dispatchedPrompt, ctx, signal, {
					onEvent: (line) => setActivityRun(task.agent.name, {
						state: "run",
						lastLine: line,
						lastActivityAt: Date.now(),
					}),
					onFinish: (result) => setActivityRun(task.agent.name, {
						state: result.status === "done" ? "done" : "error",
						endedAt: Date.now(),
						lastLine: result.status === "done" ? "done" : result.status === "cancelled" ? "cancelled" : (result.errorMessage || `exit ${result.exitCode}`),
						lastActivityAt: Date.now(),
					}, result),
				});
			};

			let results: RunResult[];
			if (mode === "chain") {
				results = [];
				let previous = "";
				for (const task of resolved) {
					const prompt = task.prompt.replaceAll("{previous}", previous);
					const result = await runOne({ agent: task.agent, prompt });
					results.push(result);
					emitPartial(results);
					previous = result.fullOutput;
					if (result.status !== "done") break;
				}
			} else {
				results = await Promise.all(resolved.map(async task => {
					const result = await runOne(task);
					emitPartial([result]);
					return result;
				}));
			}

			const sections = results.map(r => {
				const header = `## [${r.status === "done" ? "✓" : "✗"}] ${displayName(r.agent)} (${Math.round(r.elapsedMs / 1000)}s)`;
				return `${header}\n\n${r.output}${r.truncated ? "\n\n[output truncated]" : ""}`;
			});
			const ok = results.every(r => r.status === "done");
			return {
				content: [{ type: "text", text: sections.join("\n\n---\n\n") }],
				details: { status: ok ? "done" : "error", mode, results },
			};
		},
		renderCall(args, theme) {
			const tasks = Array.isArray((args as any).tasks) ? (args as any).tasks : [];
			const names = tasks.map((t: any) => t.agent).filter(Boolean).join(", ") || "none";
			return new Text(theme.fg("toolTitle", "hird_dispatch_agent ") + theme.fg("muted", names), 0, 0);
		},
		renderResult(result, options, theme) {
			const details = (result as any).details || {};
			const results = Array.isArray(details.results) ? details.results : [];
			const status = String(details.status || "");
			const isRunning = status === "running" || (options as any)?.isPartial;
			if (isRunning) {
				return new Text(theme.fg("accent", `◉ Hird dispatch running: ${results.length} result(s)`), 0, 0);
			}
			if (status === "error") {
				return new Text(theme.fg("error", `✗ Hird dispatch failed: ${results.length} result(s)`), 0, 0);
			}
			return new Text(theme.fg("success", `✓ Hird dispatch: ${results.length} result(s)`), 0, 0);
		},
	});

	registerHirdCommand("hird-agents", "List bundled Hird agents and teams", async (_args, ctx) => {
		const lines = [
			`Hird retinue (${agents.length} agents)`,
			...agents.map(a => `${a.name} — ${a.description}`),
			"",
			"Teams:",
			...Object.entries(teams).map(([name, members]) => `${name}: ${members.join(", ")}`),
		];
		if (!setWidgetSafe(ctx, "hird-roster", lines)) notifySafe(ctx, lines.join("\n"), "info");
	});

	registerHirdCommand("hird", "Open Hird selector or kick off the Hird orchestrator protocol", async (args, ctx) => {
		if (!args.trim()) return runHirdSelector(ctx);
		return runHird(ctx, args, "hird", args);
	});

	registerHirdCommand("hird-help", "Show Hird command cheat sheet", async (_args, ctx) => showHirdHelp(ctx));
	registerHirdCommand("hird-hints", "Toggle the Hird startup hint widget", async (_args, ctx) => toggleHirdHints(ctx));
	registerHirdCommand("hird-onboard", "Onboard Hird to this project and define task/board sources", async (args, ctx) => runRenderedFlow(ctx, "onboard", args, "hird-onboard"));
	registerHirdCommand("hird-next", "Select the next task from the onboarded board/task sources", async (args, ctx) => runRenderedFlow(ctx, "next", args, "hird-next"));
	registerHirdCommand("hird-team", "Show Hird team/status for this project", async (args, ctx) => runRenderedFlow(ctx, "team", args, "hird-team"));
	registerHirdCommand("hird-ship", "Run Hird shipping readiness checks for current work", async (args, ctx) => runRenderedFlow(ctx, "ship", args, "hird-ship"));
	registerHirdCommand("hird-workflow", "Define or refine the Hird project workflow", async (args, ctx) => runRenderedFlow(ctx, "workflow", args, "hird-workflow"));
	registerHirdCommand("hird-handover-lint", "Lint a Hird Handover Spec for implementation readiness", async (args, ctx) => runRenderedFlow(ctx, "handoverLint", args, "hird-handover-lint"));
	registerHirdCommand("hird-qa-gate", "Run a deterministic Hird QA gate for a task or diff", async (args, ctx) => runRenderedFlow(ctx, "qaGate", args, "hird-qa-gate"));
	registerHirdCommand("hird-pr-review", "Run a deterministic PR review with sorted findings and inline comment suggestions", async (args, ctx) => runRenderedFlow(ctx, "prReview", args, "hird-pr-review"));
	registerHirdCommand("hird-memory-commit", "Propose or commit durable Hird memory from current context", async (args, ctx) => runRenderedFlow(ctx, "memoryCommit", args, "hird-memory-commit"));

	registerHirdCommand("hird-view", "Control the Hird parallel-agent activity view: show, hide, toggle, lanes, orbit", async (args, ctx) => {
		const cmd = args.trim().toLowerCase();
		if (cmd === "hide") activityVisible = false;
		else if (cmd === "show") activityVisible = true;
		else if (cmd === "toggle" || cmd === "") activityVisible = !activityVisible;
		else if (cmd === "lanes") { activityMode = "lanes"; activityVisible = true; }
		else if (cmd === "orbit") { activityMode = "orbit"; activityVisible = true; }
		else {
			notifySafe(ctx, "Usage: /hird-view [show|hide|toggle|lanes|orbit]", "warning");
			return;
		}
		updateActivityWidget();
		bumpActivity();
		notifySafe(ctx, `Hird activity view: ${activityVisible ? activityMode : "hidden"}`, "info");
	});

	pi.registerShortcut("f7", {
		description: "Toggle Hird startup hints",
		handler: async (ctx: any) => {
			try {
				if (ctx?.hasUI === false) return;
				toggleHirdHints(ctx);
			} catch (err) { notifySafe(ctx, `Hird F7 failed: ${errMsg(err)}`, "warning"); }
		},
	});

	pi.registerShortcut("f8", {
		description: "Toggle Hird activity view",
		handler: async (ctx: any) => {
			try {
				if (ctx?.hasUI === false) return;
				activityVisible = !activityVisible;
				updateActivityWidget();
				bumpActivity();
				notifySafe(ctx, activityVisible ? "Hird activity view shown" : "Hird activity view hidden", "info");
			} catch (err) { notifySafe(ctx, `Hird F8 failed: ${errMsg(err)}`, "warning"); }
		},
	});

	pi.registerShortcut("f9", {
		description: "Switch Hird activity view between lanes and orbit",
		handler: async (ctx: any) => {
			try {
				if (ctx?.hasUI === false) return;
				activityMode = activityMode === "lanes" ? "orbit" : "lanes";
				activityVisible = true;
				updateActivityWidget();
				bumpActivity();
				notifySafe(ctx, `Hird activity view: ${activityMode}`, "info");
			} catch (err) { notifySafe(ctx, `Hird F9 failed: ${errMsg(err)}`, "warning"); }
		},
	});

	pi.registerShortcut("f10", {
		description: "Open Hird selector",
		handler: async (ctx: any) => {
			try {
				if (ctx?.hasUI === false) return;
				await runHirdSelector(ctx);
			} catch (err) { notifySafe(ctx, `Hird F10 failed: ${errMsg(err)}`, "warning"); }
		},
	});

	pi.on("resources_discover", async (_event, ctx) => {
		try {
			const resources: { skillPaths?: string[]; promptPaths?: string[] } = {};
			const skillDir = existingDirectory(HIRD_SKILLS_DIR);
			const promptDir = existingDirectory(HIRD_PROMPTS_DIR);
			if (skillDir) resources.skillPaths = [skillDir];
			if (promptDir) resources.promptPaths = [promptDir];
			return resources;
		} catch (err) {
			notifySafe(ctx, `Hird resource discovery failed: ${errMsg(err)}`, "warning");
			return {};
		}
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		if (ctx?.cwd) hirdProjectCwd = ctx.cwd;
		if (!cachedSystemPrompt) cachedSystemPrompt = buildOrchestratorPrompt(agents, teams);
		const memory = hirdMemoryContext();
		if (!memory) return { systemPrompt: cachedSystemPrompt };
		return {
			systemPrompt: cachedSystemPrompt,
			message: {
				customType: "hird-memory-context",
				content: memory,
				display: false,
			},
		};
	});

	pi.on("session_start", async (_event, ctx) => {
		widgetCtx = ctx;
		currentCwd = ctx?.cwd || process.cwd();
		hirdProjectCwd = currentCwd;
		try { refresh(); }
		catch (err) { notifySafe(ctx, `Hird refresh failed: ${errMsg(err)}`, "warning"); }
		try {
			const ui = ctx?.ui as any;
			if (ctx?.hasUI !== false && ui?.setTheme && ui?.getAllThemes) {
				const available = (ui.getAllThemes() || []).map((t: any) => t?.name);
				if (available.includes(HIRD_THEME_NAME)) {
					const current = ui.theme?.name;
					const result = ui.setTheme(HIRD_THEME_NAME);
					if (result?.success && current && current !== HIRD_THEME_NAME) previousThemeName = current;
				}
			}
		} catch {}
		try { ctx?.ui?.setStatus?.("hird", `Hird (${agents.length} agents)`); } catch {}
		notifySafe(ctx, `Hird loaded: ${agents.length} agents, ${Object.keys(teams).length} teams. Start with /hird-onboard for project work.`, "success");
		if (assetWarnings.length) notifySafe(ctx, `Hird asset validation warnings: ${assetWarnings.slice(0, 3).join("; ")}${assetWarnings.length > 3 ? " …" : ""}`, "warning");
		renderHirdHints(ctx);
		updateActivityWidget();
	});

	pi.on("session_shutdown", async () => {
		if (activityTicker) {
			clearInterval(activityTicker);
			activityTicker = undefined;
		}
		try { widgetCtx?.ui?.setStatus?.("hird", undefined); } catch {}
		try { widgetCtx?.ui?.setWidget?.("hird-start", undefined); } catch {}
		try { widgetCtx?.ui?.setWidget?.("hird-roster", undefined); } catch {}
		try { widgetCtx?.ui?.setWidget?.("hird-help", undefined); } catch {}
		try { widgetCtx?.ui?.setWidget?.("hird-activity", undefined); } catch {}
		activityComponent = undefined;
		activityTui = undefined;
		if (previousThemeName) {
			try { (widgetCtx?.ui as any)?.setTheme?.(previousThemeName); } catch {}
			previousThemeName = undefined;
		}
		widgetCtx = undefined;
	});
}
