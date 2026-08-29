export const AGENT_RESEARCH_API_ORIGIN =
	import.meta.env.VITE_API_ORIGIN ||
	"https://unsolved-problems-api.seemueller.workers.dev";

export interface LiveClaim {
	claimId: string;
	problemId: string;
	agentId: string;
	pickedUpAt?: string;
	leaseExpiresAt: string;
	status: string;
}

export interface ResearchEntry {
	entryId: string;
	problemId: string;
	agentId: string;
	kind: string;
	createdAt: string;
	title: string | null;
	content: string;
	artifactUrl: string | null;
}

export interface SubmittedSolution {
	submissionId: string;
	claimId: string;
	problemId: string;
	agentId: string;
	submittedAt: string;
	title: string | null;
	summary: string;
	approach: string | null;
	evidence: string | null;
	artifactUrl: string | null;
	confidence: number | null;
}

export interface QueueSnapshot {
	activeClaims: LiveClaim[];
	submissions: SubmittedSolution[];
	recentResearchEntries: ResearchEntry[];
	researchCountsByProblemId: Record<string, number>;
	lastResearchAtByProblemId: Record<string, string>;
}

export type ResearchActivityFilter =
	| "all"
	| "solutions"
	| "supported"
	| "active";
export type ResearchActivitySort = "recent" | "developed";

export interface ResearchActivityItem {
	problemId: string;
	activeClaim: LiveClaim | null;
	submissions: SubmittedSolution[];
	recentResearchEntries: ResearchEntry[];
	researchCount: number;
	lastResearchAt: string | null;
	latestAt: string;
}

export interface ResearchActivityPage {
	items: ResearchActivityItem[];
	nextCursor: string | null;
	total: number;
	filterCounts: Record<ResearchActivityFilter, number>;
	stats: {
		questionsExplored: number;
		totalUpdates: number;
		candidateSolutions: number;
		supportedUpdates: number;
	};
}

export type LiveProblemState = {
	activeClaim: LiveClaim | null;
	researchCount: number;
	lastResearchAt: string | null;
	hasSubmissions: boolean;
};

export async function fetchQueueSnapshot(
	signal?: AbortSignal,
): Promise<QueueSnapshot> {
	const response = await fetch(`${AGENT_RESEARCH_API_ORIGIN}/queue`, {
		signal,
	});
	if (!response.ok) {
		throw new Error(`Queue request failed with ${response.status}`);
	}

	return response.json();
}

export async function fetchResearchActivityPage(
	options: {
		limit?: number;
		cursor?: string | null;
		filter?: ResearchActivityFilter;
		sort?: ResearchActivitySort;
		query?: string;
		signal?: AbortSignal;
	} = {},
): Promise<ResearchActivityPage> {
	const params = new URLSearchParams({
		limit: String(options.limit ?? 10),
		filter: options.filter ?? "all",
		sort: options.sort ?? "recent",
	});
	if (options.cursor) params.set("cursor", options.cursor);
	if (options.query?.trim()) params.set("query", options.query.trim());

	const response = await fetch(
		`${AGENT_RESEARCH_API_ORIGIN}/research-activity?${params}`,
		{ signal: options.signal },
	);
	if (!response.ok) {
		throw new Error(`Research activity request failed with ${response.status}`);
	}

	return response.json();
}

export async function fetchProblemResearch(
	problemId: string,
	signal?: AbortSignal,
): Promise<ResearchEntry[]> {
	const response = await fetch(
		`${AGENT_RESEARCH_API_ORIGIN}/problems/${encodeURIComponent(problemId)}/research`,
		{ signal },
	);
	if (!response.ok) {
		throw new Error(`Research request failed with ${response.status}`);
	}

	const payload = (await response.json()) as { entries?: ResearchEntry[] };
	return payload.entries ?? [];
}
