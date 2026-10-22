import { describe, expect, test } from "bun:test";
import {
	buildNewsContext,
	buildRerankPrompt,
	fetchGdeltArticles,
	parseGdeltArticles,
	parseRerankReply,
	pickNewsMatch,
	rankProblemsByNews,
	tokenize,
} from "./newsPick";

const problems = [
	{
		id: "bio-1",
		category: "biology",
		text: "How did hantavirus spillover into humans first occur?",
	},
	{
		id: "anthro-1",
		category: "biology",
		text: "When did humans first reach North America, according to ancient DNA?",
	},
	{
		id: "math-1",
		category: "mathematics",
		text: "Are there infinitely many twin primes?",
	},
];

const articles = [
	{
		title:
			"Ancient DNA challenges theories about when humans reached North America",
		url: "https://example.com/dna",
	},
	{
		title: "Researchers unlock how hantavirus infects humans",
		url: "https://example.com/hanta",
	},
];

describe("tokenize", () => {
	test("drops short words and stopwords", () => {
		expect(tokenize("The new study of Axion dark-matter")).toEqual([
			"axion",
			"dark-matter",
		]);
	});
});

describe("parseGdeltArticles", () => {
	test("keeps titled articles and dedupes syndicated titles", () => {
		expect(
			parseGdeltArticles({
				articles: [
					{ title: "A story", url: "https://a", domain: "a.com" },
					{ title: "a story", url: "https://b" },
					{ title: "", url: "https://c" },
				],
			}),
		).toEqual([
			{
				title: "A story",
				url: "https://a",
				domain: "a.com",
				seenDate: undefined,
			},
		]);
	});

	test("returns empty for malformed payloads", () => {
		expect(parseGdeltArticles(null)).toEqual([]);
		expect(parseGdeltArticles({ articles: "nope" })).toEqual([]);
	});
});

describe("fetchGdeltArticles", () => {
	test("rejects GDELT's plain-text rate-limit reply", async () => {
		const fetchImpl = (async () =>
			new Response(
				"Please limit requests to one every 5 seconds",
			)) as unknown as typeof fetch;
		await expect(
			fetchGdeltArticles({ fetchImpl, sleep: async () => {} }),
		).rejects.toThrow("non-JSON");
	});

	test("retries after a rate-limit notice", async () => {
		let calls = 0;
		const fetchImpl = (async () => {
			calls++;
			return calls === 1
				? new Response("Please limit requests to one every 5 seconds")
				: new Response(JSON.stringify({ articles }));
		}) as unknown as typeof fetch;
		const result = await fetchGdeltArticles({
			fetchImpl,
			sleep: async () => {},
		});
		expect(calls).toBe(2);
		expect(result).toHaveLength(2);
	});

	test("sends an artlist query", async () => {
		let requested = "";
		const fetchImpl = (async (url: URL) => {
			requested = String(url);
			return new Response(JSON.stringify({ articles: articles }));
		}) as unknown as typeof fetch;
		const result = await fetchGdeltArticles({ query: "axion", fetchImpl });
		expect(result).toHaveLength(2);
		expect(requested).toContain("mode=artlist");
		expect(requested).toContain("query=axion");
	});
});

describe("rankProblemsByNews", () => {
	test("ranks overlapping problems and skips unrelated ones", () => {
		const matches = rankProblemsByNews(problems, articles, { minScore: 0 });
		const ids = matches.map((match) => match.problem.id);
		expect(ids).toContain("anthro-1");
		expect(ids).toContain("bio-1");
		expect(ids).not.toContain("math-1");
		expect(matches[0]?.problem.id).toBe("anthro-1");
		expect(matches[0]?.articles[0]?.url).toBe("https://example.com/dna");
	});

	test("accepts one shared term only when it is rare", () => {
		const pool = [
			{ id: "rare", category: "biology", text: "hantavirus reservoir" },
			...Array.from({ length: 5 }, (_, index) => ({
				id: `common-${index}`,
				category: "biology",
				text: `humans trait ${index}`,
			})),
		];
		const ids = rankProblemsByNews(pool, articles, { minScore: 0 }).map(
			(match) => match.problem.id,
		);
		expect(ids).toEqual(["rare"]);
	});
});

describe("pickNewsMatch", () => {
	test("returns null for no matches", () => {
		expect(pickNewsMatch([])).toBeNull();
	});

	test("weights by score", () => {
		const matches = rankProblemsByNews(problems, articles, { minScore: 0 });
		expect(pickNewsMatch(matches, 5, () => 0)?.problem.id).toBe(
			matches[0]?.problem.id,
		);
		expect(pickNewsMatch(matches, 5, () => 0.9999)?.problem.id).toBe(
			matches.at(-1)?.problem.id,
		);
	});
});

describe("buildNewsContext", () => {
	test("lists terms and headlines", () => {
		const [match] = rankProblemsByNews(problems, articles, { minScore: 0 });
		if (!match) throw new Error("expected a match");
		const context = buildNewsContext(match);
		expect(context).toContain("GDELT");
		expect(context).toContain("https://example.com/dna");
	});
});

describe("parseRerankReply", () => {
	test("reads an index and rationale", () => {
		expect(
			parseRerankReply('Sure: {"index": 1, "rationale": "Same virus."}', 3),
		).toEqual({ index: 1, rationale: "Same virus." });
	});

	test("returns null when nothing is related", () => {
		expect(parseRerankReply('{"index": null}', 3)).toBeNull();
	});

	test("rejects out-of-range indexes and missing JSON", () => {
		expect(() => parseRerankReply('{"index": 3}', 3)).toThrow("invalid index");
		expect(() => parseRerankReply("no idea", 3)).toThrow("no JSON");
	});
});

describe("buildRerankPrompt", () => {
	test("numbers each problem with its headlines", () => {
		const matches = rankProblemsByNews(problems, articles, { minScore: 0 });
		const prompt = buildRerankPrompt(matches);
		expect(prompt).toContain("0. Problem (biology)");
		expect(prompt).toContain("Headline: Ancient DNA");
	});
});
