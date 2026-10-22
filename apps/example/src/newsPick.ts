export type NewsArticle = {
	title: string;
	url: string;
	domain?: string;
	seenDate?: string;
};

export type ProblemCandidate = {
	id: string;
	category: string;
	text: string;
};

export type NewsMatch = {
	problem: ProblemCandidate;
	score: number;
	terms: string[];
	articles: NewsArticle[];
	/** Reranker's explanation of the connection, when one ran. */
	rationale?: string;
};

/**
 * Picks the shortlist entry with a substantive link to the news, or returns
 * null when none has one. Implemented with a model call by the runner.
 */
export type NewsReranker = (
	shortlist: NewsMatch[],
) => Promise<{ index: number; rationale: string } | null>;

const GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc";

/**
 * Broad science/research query so the headline pool leans toward research
 * coverage instead of general politics. GDELT matches these as keywords.
 */
export const DEFAULT_GDELT_QUERY =
	'(scientists OR researchers OR "new study" OR discovery OR physicists OR mathematicians OR astronomers OR neuroscientists) sourcelang:english';

const STOPWORDS = new Set(
	`about above after again against also among another around because been
before being below between both could does doing down during each even every
from further have having here into itself just like made make many more most
much must never only other over same should since some such than that their
them then there these they this those through under until upon very what when
where whether which while will with within without would your year years new
says said study studies scientists researchers research researcher discovery
discovered finds found first world could known unknown problem problems open
question questions whether theory theories number numbers called using used
show shows shown people time times part case cases way ways back still well
news report reports today week million billion`
		.split(/\s+/)
		.filter(Boolean),
);

export function tokenize(text: string): string[] {
	return (text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? [])
		.map((token) => token.replace(/-+$/, ""))
		.filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

export function parseGdeltArticles(payload: unknown): NewsArticle[] {
	const articles = (payload as { articles?: unknown })?.articles;
	if (!Array.isArray(articles)) return [];

	const seen = new Set<string>();
	const result: NewsArticle[] = [];
	for (const raw of articles) {
		const article = raw as Record<string, unknown>;
		const title = typeof article.title === "string" ? article.title.trim() : "";
		const url = typeof article.url === "string" ? article.url.trim() : "";
		if (!title || !url) continue;
		const key = title.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		result.push({
			title,
			url,
			domain: typeof article.domain === "string" ? article.domain : undefined,
			seenDate:
				typeof article.seendate === "string" ? article.seendate : undefined,
		});
	}
	return result;
}

export async function fetchGdeltArticles(input: {
	query?: string;
	timespan?: string;
	maxRecords?: number;
	fetchImpl?: typeof fetch;
	attempts?: number;
	sleep?: (ms: number) => Promise<void>;
}): Promise<NewsArticle[]> {
	const url = new URL(GDELT_DOC_URL);
	url.searchParams.set("query", input.query || DEFAULT_GDELT_QUERY);
	url.searchParams.set("mode", "artlist");
	url.searchParams.set("format", "json");
	url.searchParams.set("sort", "hybridrel");
	url.searchParams.set("timespan", input.timespan || "24h");
	url.searchParams.set("maxrecords", String(input.maxRecords ?? 250));

	const attempts = input.attempts ?? 4;
	const sleep =
		input.sleep ??
		((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	let text = "";
	for (let attempt = 1; ; attempt++) {
		const response = await (input.fetchImpl ?? fetch)(url, {
			headers: { "user-agent": "open-questions-morning/1.0" },
			signal: AbortSignal.timeout(30_000),
		});
		text = await response.text();
		// GDELT answers rate limiting with 429 or with 200 + a plain-text notice.
		const limited =
			response.status === 429 || /limit requests to one every/i.test(text);
		if (!limited || attempt >= attempts) {
			if (!response.ok) {
				throw new Error(
					`GDELT returned ${response.status}: ${text.slice(0, 200)}`,
				);
			}
			break;
		}
		await sleep(15_000 * attempt);
	}
	if (!text.trim().startsWith("{")) {
		throw new Error(`GDELT returned non-JSON: ${text.slice(0, 200)}`);
	}
	return parseGdeltArticles(JSON.parse(text));
}

/**
 * Score problems against headlines with IDF-weighted term overlap.
 * Each problem is scored against each headline on its own, and a pair counts
 * only when they share at least two terms, so words borrowed from unrelated
 * headlines cannot add up to a match. Document frequency is computed over
 * problems and headlines together: terms common in either ("energy",
 * "humans") count for little, while a rare shared term ("axion") counts a lot.
 */
export function rankProblemsByNews(
	problems: ProblemCandidate[],
	articles: NewsArticle[],
	options: { minScore?: number } = {},
): NewsMatch[] {
	const minScore = options.minScore ?? 6;
	if (problems.length === 0 || articles.length === 0) return [];

	const problemTerms = problems.map(
		(problem) => new Set(tokenize(problem.text)),
	);
	const articleTerms = articles.map(
		(article) => new Set(tokenize(article.title)),
	);
	const docFreq = new Map<string, number>();
	for (const terms of [...problemTerms, ...articleTerms]) {
		for (const term of terms) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
	}
	const total = problemTerms.length + articleTerms.length;
	const rareDocFreq = 3;
	const idf = (term: string) => Math.log(1 + total / (docFreq.get(term) ?? 1));

	const matches: NewsMatch[] = [];
	problems.forEach((problem, index) => {
		const terms = problemTerms[index] ?? new Set<string>();
		const pairs: Array<{
			article: NewsArticle;
			score: number;
			terms: string[];
		}> = [];

		articleTerms.forEach((headlineTerms, articleIndex) => {
			const shared = [...headlineTerms].filter((term) => terms.has(term));
			// One shared word is usually coincidence unless it is rare in both
			// the catalog and the news (a "hantavirus" or an "axion").
			if (
				shared.length < 2 &&
				!shared.some((term) => (docFreq.get(term) ?? 0) <= rareDocFreq)
			)
				return;
			const article = articles[articleIndex];
			if (!article) return;
			pairs.push({
				article,
				score: shared.reduce((sum, term) => sum + idf(term), 0),
				terms: shared,
			});
		});

		pairs.sort((a, b) => b.score - a.score);
		const best = pairs[0];
		if (!best || best.score < minScore) return;

		matches.push({
			problem,
			score: Math.round(best.score * 100) / 100,
			terms: best.terms.sort(),
			articles: pairs.slice(0, 3).map((pair) => pair.article),
		});
	});

	return matches.sort((a, b) => b.score - a.score);
}

/** Weighted random choice among the top matches so mornings vary. */
export function pickNewsMatch(
	matches: NewsMatch[],
	topK = 5,
	random: () => number = Math.random,
): NewsMatch | null {
	const pool = matches.slice(0, topK);
	if (pool.length === 0) return null;
	const totalScore = pool.reduce((sum, match) => sum + match.score, 0);
	let threshold = random() * totalScore;
	for (const match of pool) {
		threshold -= match.score;
		if (threshold <= 0) return match;
	}
	return pool[pool.length - 1] ?? null;
}

export function buildNewsContext(match: NewsMatch): string {
	return [
		"This problem was picked because it overlaps with recent news coverage (via GDELT).",
		`Shared terms: ${match.terms.join(", ")}.`,
		...(match.rationale ? [`Why it was chosen: ${match.rationale}`] : []),
		"Related headlines (unverified; the connection may be loose):",
		...match.articles.map((article) => `- ${article.title} — ${article.url}`),
		"Check whether the news reports a development that bears on this problem, and cite it only if it does.",
	].join("\n");
}

export function buildRerankPrompt(shortlist: NewsMatch[]): string {
	return [
		"Each numbered entry pairs an open research problem with recent news headlines that share words with it.",
		"Most pairs are coincidental word overlap. Pick the one entry where the news is substantively about the same scientific question, organism, object, or method, so a researcher would find the news relevant to the problem.",
		'Reply with JSON only: {"index": <number>, "rationale": "<one sentence>"}, or {"index": null} if no entry has a real connection.',
		"",
		...shortlist.map((match, index) =>
			[
				`${index}. Problem (${match.problem.category}): ${match.problem.text.slice(0, 400)}`,
				...match.articles.map((article) => `   Headline: ${article.title}`),
			].join("\n"),
		),
	].join("\n");
}

export function parseRerankReply(
	text: string,
	shortlistLength: number,
): { index: number; rationale: string } | null {
	const json = text.match(/\{[\s\S]*\}/)?.[0];
	if (!json)
		throw new Error(`Reranker reply had no JSON: ${text.slice(0, 200)}`);
	const parsed = JSON.parse(json) as { index?: unknown; rationale?: unknown };
	if (parsed.index === null || parsed.index === undefined) return null;
	if (
		typeof parsed.index !== "number" ||
		!Number.isInteger(parsed.index) ||
		parsed.index < 0 ||
		parsed.index >= shortlistLength
	) {
		throw new Error(
			`Reranker returned an invalid index: ${String(parsed.index)}`,
		);
	}
	return {
		index: parsed.index,
		rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
	};
}
