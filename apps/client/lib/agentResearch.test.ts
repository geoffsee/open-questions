import { afterEach, describe, expect, test } from "bun:test";
import {
	AGENT_RESEARCH_API_ORIGIN,
	fetchProblemResearch,
	fetchQueueSnapshot,
	fetchResearchActivityPage,
} from "./agentResearch";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("fetchQueueSnapshot", () => {
	test("requests /queue and returns the parsed payload", async () => {
		const payload = {
			activeClaims: [
				{
					claimId: "claim_1",
					problemId: "math-1",
					agentId: "agent-a",
					leaseExpiresAt: "2099-01-01T00:00:00.000Z",
					status: "active",
				},
			],
			submissions: [],
			recentResearchEntries: [],
			researchCountsByProblemId: { "math-1": 2 },
			lastResearchAtByProblemId: { "math-1": "2026-01-01T00:00:00.000Z" },
		};

		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			expect(String(input)).toBe(`${AGENT_RESEARCH_API_ORIGIN}/queue`);
			expect(init?.signal).toBeUndefined();
			return new Response(JSON.stringify(payload), { status: 200 });
		}) as typeof fetch;

		await expect(fetchQueueSnapshot()).resolves.toEqual(payload);
	});

	test("forwards abort signals and throws on non-OK responses", async () => {
		const controller = new AbortController();
		globalThis.fetch = (async (
			_input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			expect(init?.signal).toBe(controller.signal);
			return new Response("nope", { status: 503 });
		}) as typeof fetch;

		await expect(fetchQueueSnapshot(controller.signal)).rejects.toThrow(
			"Queue request failed with 503",
		);
	});
});

describe("fetchProblemResearch", () => {
	test("encodes problem ids in the path", async () => {
		const entries = [
			{
				entryId: "r1",
				problemId: "computer science/1",
				agentId: "a",
				kind: "note",
				createdAt: "2026-01-01T00:00:00.000Z",
				title: "Note",
				content: "Body",
				artifactUrl: null,
			},
		];

		globalThis.fetch = (async (input: RequestInfo | URL) => {
			expect(String(input)).toBe(
				`${AGENT_RESEARCH_API_ORIGIN}/problems/${encodeURIComponent("computer science/1")}/research`,
			);
			return new Response(JSON.stringify({ entries }), { status: 200 });
		}) as typeof fetch;

		await expect(fetchProblemResearch("computer science/1")).resolves.toEqual(
			entries,
		);
	});

	test("defaults missing entries to an empty array", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({}), {
				status: 200,
			})) as unknown as typeof fetch;

		await expect(fetchProblemResearch("math-1")).resolves.toEqual([]);
	});

	test("throws on failed research requests", async () => {
		globalThis.fetch = (async () =>
			new Response("missing", {
				status: 404,
			})) as unknown as typeof fetch;

		await expect(fetchProblemResearch("missing")).rejects.toThrow(
			"Research request failed with 404",
		);
	});
});

describe("fetchResearchActivityPage", () => {
	test("requests a cursor page with server-side filters", async () => {
		const payload = {
			items: [],
			nextCursor: null,
			total: 0,
			filterCounts: { all: 0, solutions: 0, supported: 0, active: 0 },
			stats: {
				questionsExplored: 0,
				totalUpdates: 0,
				candidateSolutions: 0,
				supportedUpdates: 0,
			},
		};

		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			expect(`${url.origin}${url.pathname}`).toBe(
				`${AGENT_RESEARCH_API_ORIGIN}/research-activity`,
			);
			expect(Object.fromEntries(url.searchParams)).toEqual({
				limit: "10",
				filter: "supported",
				sort: "developed",
				cursor: "10",
				query: "dark matter",
			});
			return new Response(JSON.stringify(payload), { status: 200 });
		}) as typeof fetch;

		await expect(
			fetchResearchActivityPage({
				cursor: "10",
				filter: "supported",
				sort: "developed",
				query: " dark matter ",
			}),
		).resolves.toEqual(payload);
	});

	test("throws on failed page requests", async () => {
		globalThis.fetch = (async () =>
			new Response("nope", { status: 500 })) as unknown as typeof fetch;

		await expect(fetchResearchActivityPage()).rejects.toThrow(
			"Research activity request failed with 500",
		);
	});
});
