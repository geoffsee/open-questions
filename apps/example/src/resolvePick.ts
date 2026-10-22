import {
	extractHistoryText,
	extractResearchedCandidates,
	pickContinuation,
	shouldContinue,
	truncateHistory,
} from "./continuePick";
import {
	buildNewsContext,
	fetchGdeltArticles,
	type NewsArticle,
	type NewsMatch,
	type NewsReranker,
	type ProblemCandidate,
	pickNewsMatch,
	rankProblemsByNews,
} from "./newsPick";
import { pickRandomProblemId } from "./openaiHelpers";

export type ResolvedPick = {
	pickMode: string;
	specificProblemId: string | null;
	poolSize?: number;
	category?: string | null;
	/** Prompt context explaining a news-driven pick. */
	newsContext?: string;
	newsScore?: number;
	/** Saved research on the picked problem, for a continuation run. */
	priorWork?: string;
	/** Number of saved research entries the continuation builds on. */
	priorEntryCount?: number;
};

/** Categories about real people; keep them out of news-driven picks. */
export const NEWS_EXCLUDED_CATEGORIES = [
	"missing persons",
	"unsolved homicides",
];

function parseJsonPayload(text: string): unknown {
	const trimmed = text.trim();
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		return JSON.parse(trimmed);
	}

	const dataLines = trimmed
		.split("\n")
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice(5).trim())
		.filter(Boolean);

	if (dataLines.length === 0) {
		throw new Error("MCP response did not include JSON or SSE data.");
	}

	return JSON.parse(dataLines[dataLines.length - 1] ?? "");
}

export function extractProblemIdsFromListResult(payload: unknown): string[] {
	const root = payload as {
		result?: {
			structuredContent?: { items?: Array<{ id?: unknown }> };
			content?: Array<{ type?: string; text?: string }>;
		};
		structuredContent?: { items?: Array<{ id?: unknown }> };
	};

	const items =
		root.result?.structuredContent?.items ?? root.structuredContent?.items;
	if (Array.isArray(items) && items.length > 0) {
		return items
			.map((item) => (typeof item?.id === "string" ? item.id.trim() : ""))
			.filter(Boolean);
	}

	const text = (root.result?.content ?? [])
		.filter((block) => block.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("\n");

	return text
		.split("\n")
		.map(
			(line) =>
				line.match(
					/^\d+\.\s+([^\s]+)\s+\[(available|claimed|submitted)\]/,
				)?.[1],
		)
		.filter((value): value is string => Boolean(value));
}

export function extractProblemCandidatesFromListResult(
	payload: unknown,
): ProblemCandidate[] {
	const root = payload as {
		result?: { structuredContent?: { items?: unknown[] } };
		structuredContent?: { items?: unknown[] };
	};
	const items =
		root.result?.structuredContent?.items ?? root.structuredContent?.items;
	if (!Array.isArray(items)) return [];

	return items.flatMap((raw) => {
		const item = raw as {
			id?: unknown;
			category?: unknown;
			section?: unknown;
			text?: unknown;
			enrichment?: { summary?: unknown } | null;
		};
		if (typeof item.id !== "string" || !item.id.trim()) return [];
		const text = [item.section, item.text, item.enrichment?.summary]
			.filter((part): part is string => typeof part === "string")
			.join(" ");
		return [
			{
				id: item.id.trim(),
				category: typeof item.category === "string" ? item.category : "",
				text,
			},
		];
	});
}

export function extractCategoriesFromListResult(payload: unknown): string[] {
	const root = payload as {
		result?: {
			structuredContent?: {
				categories?: Record<string, unknown>;
				items?: Array<{ category?: unknown }>;
			};
		};
		structuredContent?: {
			categories?: Record<string, unknown>;
			items?: Array<{ category?: unknown }>;
		};
	};

	const categories =
		root.result?.structuredContent?.categories ??
		root.structuredContent?.categories;

	if (categories && typeof categories === "object") {
		return Object.entries(categories)
			.filter(([, count]) => typeof count === "number" && count > 0)
			.map(([name]) => name)
			.sort((a, b) => a.localeCompare(b));
	}

	const items =
		root.result?.structuredContent?.items ?? root.structuredContent?.items;
	if (!Array.isArray(items)) return [];

	return [
		...new Set(
			items
				.map((item) =>
					typeof item?.category === "string" ? item.category.trim() : "",
				)
				.filter(Boolean),
		),
	].sort((a, b) => a.localeCompare(b));
}

export function extractCategoriesFromCatalog(payload: unknown): string[] {
	const root = payload as {
		result?: { contents?: Array<{ text?: string }> };
		contents?: Array<{ text?: string }>;
	};
	const text =
		root.result?.contents?.find((item) => typeof item.text === "string")
			?.text ??
		root.contents?.find((item) => typeof item.text === "string")?.text;

	if (!text) return [];

	const catalog = JSON.parse(text) as {
		categories?: Record<string, unknown>;
	};
	if (!catalog.categories || typeof catalog.categories !== "object") {
		return [];
	}

	return Object.entries(catalog.categories)
		.filter(([, count]) => typeof count === "number" && count > 0)
		.map(([name]) => name)
		.sort((a, b) => a.localeCompare(b));
}

export function pickRandomCategory(categories: string[]): string {
	if (categories.length === 0) {
		throw new Error("No available problem categories were returned.");
	}

	const category = categories[Math.floor(Math.random() * categories.length)];
	if (!category) {
		throw new Error("No available problem categories were returned.");
	}
	return category;
}

function bearerHeaders(): Record<string, string> {
	const token = process.env.OPEN_QUESTIONS_API_TOKEN?.trim();
	if (!token) return {};
	return { authorization: `Bearer ${token}` };
}

async function callMcp(
	mcpUrl: string,
	method: string,
	params: Record<string, unknown>,
): Promise<unknown> {
	const response = await fetch(mcpUrl, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			"mcp-protocol-version": "2025-03-26",
			...bearerHeaders(),
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method,
			params,
		}),
	});

	const text = await response.text();
	if (!response.ok) {
		throw new Error(
			`${method} failed (${response.status}): ${text.slice(0, 400)}`,
		);
	}

	return parseJsonPayload(text);
}

export async function listAvailableProblemIds(
	mcpUrl: string,
	limit = 25,
	category?: string,
): Promise<{ candidateIds: string[]; categories: string[] }> {
	const payload = await callMcp(mcpUrl, "tools/call", {
		name: "list_problems",
		arguments: {
			limit,
			status: "available",
			...(category ? { category } : {}),
		},
	});

	return {
		candidateIds: extractProblemIdsFromListResult(payload),
		categories: extractCategoriesFromListResult(payload),
	};
}

async function listAvailableCandidates(
	mcpUrl: string,
	category: string,
): Promise<ProblemCandidate[]> {
	const payload = await callMcp(mcpUrl, "tools/call", {
		name: "list_problems",
		arguments: { limit: 100, status: "available", category },
	});
	return extractProblemCandidatesFromListResult(payload);
}

export async function listCatalogCategories(mcpUrl: string): Promise<string[]> {
	const payload = await callMcp(mcpUrl, "resources/read", {
		uri: "open-questions://catalog",
	});
	return extractCategoriesFromCatalog(payload);
}

/**
 * Resolve pick mode before the agent runs.
 * "random" is decided in process (not by the model) so morning runs don't
 * keep claiming the same LLM-favored problem.
 *
 * Random mode first shuffles a category filter, then picks uniformly within
 * that category — avoiding the first-category bias of unfiltered shortlists.
 */
export async function resolveRuntimePick(input: {
	pickMode: string;
	specificProblemId?: string | null;
	mcpUrl: string;
	limit?: number;
	newsQuery?: string;
	fetchArticles?: () => Promise<NewsArticle[]>;
	rerank?: NewsReranker;
	/** Share of random/news runs that continue earlier work instead (0–1). */
	continueRatio?: number;
	random?: () => number;
}): Promise<ResolvedPick> {
	if (input.pickMode === "specific") {
		if (!input.specificProblemId) {
			throw new Error(
				"OPEN_QUESTIONS_PROBLEM_ID is required when OPEN_QUESTIONS_PICK_MODE=specific.",
			);
		}
		return {
			pickMode: "specific",
			specificProblemId: input.specificProblemId,
		};
	}

	const continues =
		input.pickMode === "continue" ||
		((input.pickMode === "random" || input.pickMode === "news") &&
			shouldContinue(input.continueRatio ?? 0, input.random));
	if (continues) {
		const continuation = await resolveContinuePick(input).catch(
			(error: unknown) => {
				console.warn(
					`Continue pick failed, falling back: ${error instanceof Error ? error.message : String(error)}`,
				);
				return null;
			},
		);
		if (continuation) return continuation;
	}
	// Fallbacks below must not roll for a continuation again.
	const base = {
		...input,
		pickMode: input.pickMode === "continue" ? "random" : input.pickMode,
		continueRatio: 0,
	};

	if (base.pickMode === "news") {
		const newsPick = await resolveNewsPick(base).catch((error: unknown) => {
			console.warn(
				`News pick failed, falling back to random: ${error instanceof Error ? error.message : String(error)}`,
			);
			return null;
		});
		if (newsPick) return newsPick;
		return resolveRuntimePick({ ...base, pickMode: "random" });
	}

	if (base.pickMode !== "random") {
		return {
			pickMode: base.pickMode,
			specificProblemId: base.specificProblemId ?? null,
		};
	}

	const limit = input.limit ?? 25;
	const discovery = await listAvailableProblemIds(input.mcpUrl, 1);
	let remaining =
		discovery.categories.length > 0
			? [...discovery.categories]
			: await listCatalogCategories(input.mcpUrl);

	while (remaining.length > 0) {
		const category = pickRandomCategory(remaining);
		const { candidateIds } = await listAvailableProblemIds(
			input.mcpUrl,
			limit,
			category,
		);
		if (candidateIds.length > 0) {
			return {
				pickMode: "specific",
				specificProblemId: pickRandomProblemId(candidateIds),
				poolSize: candidateIds.length,
				category,
			};
		}
		remaining = remaining.filter((name) => name !== category);
	}

	throw new Error("No available problems found in any category.");
}

/**
 * Pick an available problem that already has saved research and load that
 * history, so the agent builds on it. Returns null when nothing qualifies.
 */
async function resolveContinuePick(input: {
	mcpUrl: string;
	random?: () => number;
}): Promise<ResolvedPick | null> {
	const listed = await callMcp(input.mcpUrl, "tools/call", {
		name: "list_problems",
		arguments: { status: "available", researched: true, limit: 100 },
	});
	const candidates = extractResearchedCandidates(listed);
	const choice = pickContinuation(candidates, input.random);
	if (!choice) return null;

	const history = await callMcp(input.mcpUrl, "tools/call", {
		name: "get_problem_history",
		arguments: { problemId: choice.id, limit: 10 },
	});

	return {
		pickMode: "specific",
		specificProblemId: choice.id,
		poolSize: candidates.length,
		category: choice.category,
		priorWork: truncateHistory(extractHistoryText(history)),
		priorEntryCount: choice.researchEntryCount,
	};
}

async function discoverCategories(mcpUrl: string): Promise<string[]> {
	const discovery = await listAvailableProblemIds(mcpUrl, 1);
	return discovery.categories.length > 0
		? discovery.categories
		: listCatalogCategories(mcpUrl);
}

/**
 * Match available problems against the last day of GDELT headlines.
 * Returns null when no problem overlaps the news strongly enough, so the
 * caller can fall back to random selection.
 */
async function resolveNewsPick(input: {
	mcpUrl: string;
	newsQuery?: string;
	fetchArticles?: () => Promise<NewsArticle[]>;
	rerank?: NewsReranker;
}): Promise<ResolvedPick | null> {
	const articles = await (input.fetchArticles
		? input.fetchArticles()
		: fetchGdeltArticles({ query: input.newsQuery }));
	if (articles.length === 0) return null;

	const categories = (await discoverCategories(input.mcpUrl)).filter(
		(category) => !NEWS_EXCLUDED_CATEGORIES.includes(category.toLowerCase()),
	);
	const candidates: ProblemCandidate[] = [];
	for (const category of categories) {
		candidates.push(...(await listAvailableCandidates(input.mcpUrl, category)));
	}

	const ranked = rankProblemsByNews(candidates, articles);
	const match = input.rerank
		? await rerankOrPick(ranked, input.rerank)
		: pickNewsMatch(ranked);
	if (!match) return null;

	return {
		pickMode: "specific",
		specificProblemId: match.problem.id,
		poolSize: candidates.length,
		category: match.problem.category,
		newsContext: buildNewsContext(match),
		newsScore: match.score,
	};
}

/**
 * Let the reranker choose among the top lexical matches. If it says none is
 * real, the news pick is skipped; if it fails, fall back to the lexical pick.
 */
async function rerankOrPick(
	ranked: NewsMatch[],
	rerank: NewsReranker,
): Promise<NewsMatch | null> {
	const shortlist = ranked.slice(0, 40);
	if (shortlist.length === 0) return null;
	try {
		const choice = await rerank(shortlist);
		if (!choice) return null;
		const match = shortlist[choice.index];
		return match ? { ...match, rationale: choice.rationale } : null;
	} catch (error) {
		console.warn(
			`News rerank failed, using lexical ranking: ${error instanceof Error ? error.message : String(error)}`,
		);
		return pickNewsMatch(ranked);
	}
}
