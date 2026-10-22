export type ResearchedCandidate = {
	id: string;
	category: string;
	researchEntryCount: number;
	lastResearchAt: string | null;
};

/** Cap on how much one long thread can outweigh newer ones. */
const MAX_THREAD_WEIGHT = 5;
/** Keep the prior-work block from crowding out the rest of the prompt. */
const MAX_HISTORY_CHARS = 12_000;

export function extractResearchedCandidates(
	payload: unknown,
): ResearchedCandidate[] {
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
			researchEntryCount?: unknown;
			lastResearchAt?: unknown;
		};
		// Servers that predate the `researched` filter ignore it and return
		// every problem, so check the count here as well.
		if (
			typeof item.id !== "string" ||
			!item.id.trim() ||
			typeof item.researchEntryCount !== "number" ||
			item.researchEntryCount < 1
		)
			return [];
		return [
			{
				id: item.id.trim(),
				category: typeof item.category === "string" ? item.category : "",
				researchEntryCount: item.researchEntryCount,
				lastResearchAt:
					typeof item.lastResearchAt === "string" ? item.lastResearchAt : null,
			},
		];
	});
}

/**
 * Weighted random choice that favors problems with more saved work, so
 * threads deepen toward a solution instead of every problem getting one
 * shallow pass. The weight is capped so one long thread cannot take over.
 */
export function pickContinuation(
	candidates: ResearchedCandidate[],
	random: () => number = Math.random,
): ResearchedCandidate | null {
	if (candidates.length === 0) return null;
	const weight = (candidate: ResearchedCandidate) =>
		Math.min(candidate.researchEntryCount, MAX_THREAD_WEIGHT);
	const total = candidates.reduce(
		(sum, candidate) => sum + weight(candidate),
		0,
	);
	let threshold = random() * total;
	for (const candidate of candidates) {
		threshold -= weight(candidate);
		if (threshold <= 0) return candidate;
	}
	return candidates[candidates.length - 1] ?? null;
}

/** Read the text block of a get_problem_history result. */
export function extractHistoryText(payload: unknown): string {
	const root = payload as {
		result?: {
			isError?: boolean;
			content?: Array<{ type?: string; text?: string }>;
		};
	};
	const text = (root.result?.content ?? [])
		.filter((block) => block.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("\n")
		.trim();
	if (root.result?.isError) {
		throw new Error(`get_problem_history failed: ${text.slice(0, 200)}`);
	}
	if (!text) throw new Error("get_problem_history returned no text.");
	return text;
}

/** Keep the most recent part of a long history; recent entries matter most. */
export function truncateHistory(text: string, maxChars = MAX_HISTORY_CHARS) {
	if (text.length <= maxChars) return text;
	return `[earlier entries omitted]\n…${text.slice(-maxChars)}`;
}

/** Decide whether this run continues earlier work, given a ratio in [0, 1]. */
export function shouldContinue(
	ratio: number,
	random: () => number = Math.random,
): boolean {
	if (!Number.isFinite(ratio) || ratio <= 0) return false;
	return random() < Math.min(ratio, 1);
}

export function parseContinueRatio(value: string | undefined): number {
	if (!value?.trim()) return 0;
	const ratio = Number(value);
	if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
		throw new Error(
			`OPEN_QUESTIONS_CONTINUE_RATIO must be a number from 0 to 1, got "${value}".`,
		);
	}
	return ratio;
}
