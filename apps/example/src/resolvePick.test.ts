import { afterEach, describe, expect, test } from "bun:test";
import {
	extractCategoriesFromCatalog,
	extractCategoriesFromListResult,
	extractProblemIdsFromListResult,
	listAvailableProblemIds,
	listCatalogCategories,
	pickRandomCategory,
	resolveRuntimePick,
} from "./resolvePick";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("extractProblemIdsFromListResult", () => {
	test("reads structuredContent items", () => {
		expect(
			extractProblemIdsFromListResult({
				result: {
					structuredContent: {
						items: [{ id: "math-001" }, { id: " bio-002 " }],
					},
				},
			}),
		).toEqual(["math-001", "bio-002"]);
	});

	test("reads top-level structuredContent when result wrapper is absent", () => {
		expect(
			extractProblemIdsFromListResult({
				structuredContent: {
					items: [{ id: "math-001" }, { id: 12 }, { id: "  " }],
				},
			}),
		).toEqual(["math-001"]);
	});

	test("falls back to numbered text content", () => {
		expect(
			extractProblemIdsFromListResult({
				result: {
					content: [
						{
							type: "text",
							text: [
								"1. math-001 [available] math / Number theory: foo",
								"2. bio-002 [available] biology / Bar: baz",
							].join("\n"),
						},
					],
				},
			}),
		).toEqual(["math-001", "bio-002"]);
	});

	test("returns empty when neither items nor matching text exist", () => {
		expect(
			extractProblemIdsFromListResult({
				result: { content: [{ type: "text", text: "nothing useful" }] },
			}),
		).toEqual([]);
	});
});

describe("extractCategoriesFromListResult", () => {
	test("reads structuredContent categories with positive counts", () => {
		expect(
			extractCategoriesFromListResult({
				result: {
					structuredContent: {
						categories: {
							biology: 4,
							astronomy: 96,
							chemistry: 0,
						},
					},
				},
			}),
		).toEqual(["astronomy", "biology"]);
	});

	test("falls back to item categories", () => {
		expect(
			extractCategoriesFromListResult({
				result: {
					structuredContent: {
						items: [
							{ id: "a-1", category: "astronomy" },
							{ id: "b-1", category: "biology" },
							{ id: "a-2", category: "astronomy" },
						],
					},
				},
			}),
		).toEqual(["astronomy", "biology"]);
	});

	test("returns empty when categories and items are missing", () => {
		expect(extractCategoriesFromListResult({})).toEqual([]);
	});
});

describe("extractCategoriesFromCatalog", () => {
	test("reads catalog category counts", () => {
		expect(
			extractCategoriesFromCatalog({
				result: {
					contents: [
						{
							text: JSON.stringify({
								categories: {
									astronomy: 113,
									biology: 40,
									mathematics: 0,
								},
							}),
						},
					],
				},
			}),
		).toEqual(["astronomy", "biology"]);
	});

	test("returns empty for missing or empty catalog payloads", () => {
		expect(extractCategoriesFromCatalog({})).toEqual([]);
		expect(
			extractCategoriesFromCatalog({
				contents: [{ text: JSON.stringify({ totalProblems: 0 }) }],
			}),
		).toEqual([]);
	});
});

describe("pickRandomCategory", () => {
	test("rejects empty lists", () => {
		expect(() => pickRandomCategory([])).toThrow(
			"No available problem categories were returned.",
		);
	});

	test("returns a member of the list", () => {
		expect(["astronomy", "biology"]).toContain(
			pickRandomCategory(["astronomy", "biology"]),
		);
	});
});

describe("resolveRuntimePick", () => {
	function mockMcp(
		itemsByCategory: Record<string, Array<Record<string, unknown>>>,
	) {
		const listed: string[] = [];
		globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body ?? "{}")) as {
				params?: { arguments?: { category?: string } };
			};
			const category = body.params?.arguments?.category;
			if (category) listed.push(category);
			const items = category ? (itemsByCategory[category] ?? []) : [];
			const categories = Object.fromEntries(
				Object.entries(itemsByCategory).map(([name, list]) => [
					name,
					list.length,
				]),
			);
			return new Response(
				JSON.stringify({
					result: { structuredContent: { items, categories } },
				}),
			);
		}) as typeof fetch;
		return listed;
	}

	const newsItems = {
		biology: [
			{
				id: "bio-dna",
				category: "biology",
				section: "Anthropology",
				text: "When did humans first reach North America according to ancient DNA?",
			},
		],
		mathematics: Array.from({ length: 20 }, (_, index) => ({
			id: `math-${index}`,
			category: "mathematics",
			text: `Conjecture ${index} about prime gaps and modular forms`,
		})),
		"unsolved homicides": [
			{
				id: "case-1",
				category: "unsolved homicides",
				text: "Ancient DNA humans North America",
			},
		],
	};

	test("news mode picks a problem that overlaps the headlines", async () => {
		const listed = mockMcp(newsItems);
		const pick = await resolveRuntimePick({
			pickMode: "news",
			mcpUrl: "https://example.test/mcp",
			fetchArticles: async () => [
				{
					title: "Ancient DNA challenges when humans reached North America",
					url: "https://example.com/dna",
				},
			],
		});
		expect(pick.specificProblemId).toBe("bio-dna");
		expect(pick.pickMode).toBe("specific");
		expect(pick.newsContext).toContain("https://example.com/dna");
		expect(listed).not.toContain("unsolved homicides");
	});

	test("news mode skips the news pick when the reranker finds nothing", async () => {
		mockMcp(newsItems);
		const pick = await resolveRuntimePick({
			pickMode: "news",
			mcpUrl: "https://example.test/mcp",
			fetchArticles: async () => [
				{
					title: "Ancient DNA challenges when humans reached North America",
					url: "https://example.com/dna",
				},
			],
			rerank: async () => null,
		});
		expect(pick.newsContext).toBeUndefined();
	});

	test("news mode uses the reranker's choice and rationale", async () => {
		mockMcp(newsItems);
		const pick = await resolveRuntimePick({
			pickMode: "news",
			mcpUrl: "https://example.test/mcp",
			fetchArticles: async () => [
				{
					title: "Ancient DNA challenges when humans reached North America",
					url: "https://example.com/dna",
				},
			],
			rerank: async () => ({ index: 0, rationale: "Same migration question." }),
		});
		expect(pick.specificProblemId).toBe("bio-dna");
		expect(pick.newsContext).toContain("Same migration question.");
	});

	test("news mode falls back to random when GDELT fails", async () => {
		mockMcp(newsItems);
		const pick = await resolveRuntimePick({
			pickMode: "news",
			mcpUrl: "https://example.test/mcp",
			fetchArticles: async () => {
				throw new Error("rate limited");
			},
		});
		expect(pick.pickMode).toBe("specific");
		expect(pick.newsContext).toBeUndefined();
		expect(pick.specificProblemId).toBeTruthy();
	});

	function mockContinueMcp(input: {
		researched: Array<Record<string, unknown>>;
		history?: string;
		historyError?: boolean;
		categories?: Record<string, Array<Record<string, unknown>>>;
	}) {
		const calls: Array<{ name?: string; arguments?: Record<string, unknown> }> =
			[];
		globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body ?? "{}")) as {
				params?: { name?: string; arguments?: Record<string, unknown> };
			};
			calls.push(body.params ?? {});
			if (body.params?.name === "get_problem_history") {
				return new Response(
					JSON.stringify({
						result: {
							isError: input.historyError ?? false,
							content: [{ type: "text", text: input.history ?? "" }],
						},
					}),
				);
			}
			const args = body.params?.arguments ?? {};
			const byCategory = input.categories ?? {};
			const items = args.researched
				? input.researched
				: typeof args.category === "string"
					? (byCategory[args.category] ?? [])
					: [];
			const categories = Object.fromEntries(
				Object.entries(byCategory).map(([name, list]) => [name, list.length]),
			);
			return new Response(
				JSON.stringify({
					result: { structuredContent: { items, categories } },
				}),
			);
		}) as typeof fetch;
		return calls;
	}

	test("continue mode picks a researched problem and loads its history", async () => {
		const calls = mockContinueMcp({
			researched: [
				{ id: "chem-1", category: "chemistry", researchEntryCount: 2 },
			],
			history: "[2026-10-21] reference: On-water rate gain\nNext test: ...",
		});
		const pick = await resolveRuntimePick({
			pickMode: "continue",
			mcpUrl: "https://example.test/mcp",
		});
		expect(pick).toMatchObject({
			pickMode: "specific",
			specificProblemId: "chem-1",
			priorEntryCount: 2,
		});
		expect(pick.priorWork).toContain("On-water rate gain");
		expect(calls[0]?.arguments).toMatchObject({ researched: true });
		expect(calls[1]).toMatchObject({
			name: "get_problem_history",
			arguments: { problemId: "chem-1" },
		});
	});

	test("continue mode falls back to random when nothing has history", async () => {
		mockContinueMcp({
			researched: [],
			categories: { biology: [{ id: "bio-1", category: "biology" }] },
		});
		const pick = await resolveRuntimePick({
			pickMode: "continue",
			mcpUrl: "https://example.test/mcp",
		});
		expect(pick.specificProblemId).toBe("bio-1");
		expect(pick.priorWork).toBeUndefined();
	});

	test("continue mode falls back when the history tool fails", async () => {
		mockContinueMcp({
			researched: [
				{ id: "chem-1", category: "chemistry", researchEntryCount: 2 },
			],
			historyError: true,
			categories: { biology: [{ id: "bio-1", category: "biology" }] },
		});
		const pick = await resolveRuntimePick({
			pickMode: "continue",
			mcpUrl: "https://example.test/mcp",
		});
		expect(pick.specificProblemId).toBe("bio-1");
		expect(pick.priorWork).toBeUndefined();
	});

	test("continueRatio sends some random runs to a continuation", async () => {
		mockContinueMcp({
			researched: [
				{ id: "chem-1", category: "chemistry", researchEntryCount: 1 },
			],
			history: "earlier note",
			categories: { biology: [{ id: "bio-1", category: "biology" }] },
		});
		const continued = await resolveRuntimePick({
			pickMode: "random",
			mcpUrl: "https://example.test/mcp",
			continueRatio: 0.5,
			random: () => 0.1,
		});
		expect(continued.specificProblemId).toBe("chem-1");

		const fresh = await resolveRuntimePick({
			pickMode: "random",
			mcpUrl: "https://example.test/mcp",
			continueRatio: 0.5,
			random: () => 0.9,
		});
		expect(fresh.specificProblemId).toBe("bio-1");
	});

	test("keeps specific picks", async () => {
		await expect(
			resolveRuntimePick({
				pickMode: "specific",
				specificProblemId: "math-001",
				mcpUrl: "https://example.test/mcp",
			}),
		).resolves.toEqual({
			pickMode: "specific",
			specificProblemId: "math-001",
		});
	});

	test("leaves agent mode to the model", async () => {
		await expect(
			resolveRuntimePick({
				pickMode: "agent",
				mcpUrl: "https://example.test/mcp",
			}),
		).resolves.toEqual({
			pickMode: "agent",
			specificProblemId: null,
		});
	});

	test("resolves random mode via shuffled category then problem", async () => {
		const calls: Array<{ method?: string; args?: Record<string, unknown> }> =
			[];

		globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body ?? "{}")) as {
				method?: string;
				params?: {
					name?: string;
					arguments?: Record<string, unknown>;
					uri?: string;
				};
			};
			calls.push({
				method: body.method,
				args: body.params?.arguments,
			});

			if (body.method === "resources/read") {
				return new Response(
					JSON.stringify({
						result: {
							contents: [
								{
									text: JSON.stringify({
										categories: {
											astronomy: 96,
											biology: 4,
											chemistry: 12,
										},
									}),
								},
							],
						},
					}),
					{ status: 200 },
				);
			}

			const args = body.params?.arguments ?? {};
			if (!args.category) {
				return new Response(
					JSON.stringify({
						result: {
							structuredContent: {
								items: [{ id: "astronomy-1", category: "astronomy" }],
								categories: {
									astronomy: 96,
									biology: 4,
									chemistry: 12,
								},
								totalMatched: 112,
							},
						},
					}),
					{ status: 200 },
				);
			}

			const category = String(args.category);
			return new Response(
				JSON.stringify({
					result: {
						structuredContent: {
							items: [
								{ id: `${category}-001`, category },
								{ id: `${category}-002`, category },
							],
							categories: { [category]: 2 },
							totalMatched: 2,
						},
					},
				}),
				{ status: 200 },
			);
		}) as unknown as typeof fetch;

		const resolved = await resolveRuntimePick({
			pickMode: "random",
			mcpUrl: "https://example.test/mcp",
		});
		expect(resolved.pickMode).toBe("specific");
		expect(resolved.poolSize).toBe(2);
		expect(resolved.category).toBeTruthy();
		expect(["astronomy", "biology", "chemistry"]).toContain(
			resolved.category as string,
		);
		expect([`${resolved.category}-001`, `${resolved.category}-002`]).toContain(
			resolved.specificProblemId as string,
		);
		expect(calls[0]?.method).toBe("tools/call");
		expect(calls[0]?.args?.category).toBeUndefined();
		expect(calls[1]?.args?.category).toBe(resolved.category);
	});

	test("falls back to catalog categories when list omits them", async () => {
		globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body ?? "{}")) as {
				method?: string;
				params?: { arguments?: Record<string, unknown> };
			};

			if (body.method === "resources/read") {
				return new Response(
					JSON.stringify({
						result: {
							contents: [
								{
									text: JSON.stringify({
										categories: { biology: 4, chemistry: 12 },
									}),
								},
							],
						},
					}),
					{ status: 200 },
				);
			}

			const args = body.params?.arguments ?? {};
			if (!args.category) {
				return new Response(
					JSON.stringify({
						result: {
							structuredContent: {
								items: [{ id: "astronomy-1" }],
								totalMatched: 1,
							},
						},
					}),
					{ status: 200 },
				);
			}

			const category = String(args.category);
			return new Response(
				JSON.stringify({
					result: {
						structuredContent: {
							items: [{ id: `${category}-001`, category }],
							totalMatched: 1,
						},
					},
				}),
				{ status: 200 },
			);
		}) as unknown as typeof fetch;

		const resolved = await resolveRuntimePick({
			pickMode: "random",
			mcpUrl: "https://example.test/mcp",
		});
		expect(["biology", "chemistry"]).toContain(resolved.category as string);
		expect(resolved.specificProblemId).toBe(`${resolved.category}-001`);
	});

	test("skips empty categories until a non-empty pool is found", async () => {
		const categoriesSeen: string[] = [];

		globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body ?? "{}")) as {
				method?: string;
				params?: { arguments?: Record<string, unknown> };
			};

			const args = body.params?.arguments ?? {};
			if (!args.category) {
				return new Response(
					JSON.stringify({
						result: {
							structuredContent: {
								items: [{ id: "astronomy-1" }],
								categories: { empty: 1, filled: 1 },
								totalMatched: 2,
							},
						},
					}),
					{ status: 200 },
				);
			}

			const category = String(args.category);
			categoriesSeen.push(category);
			const items =
				category === "filled" ? [{ id: "filled-001", category: "filled" }] : [];
			return new Response(
				JSON.stringify({
					result: {
						structuredContent: {
							items,
							categories: { [category]: items.length },
							totalMatched: items.length,
						},
					},
				}),
				{ status: 200 },
			);
		}) as unknown as typeof fetch;

		const resolved = await resolveRuntimePick({
			pickMode: "random",
			mcpUrl: "https://example.test/mcp",
			limit: 10,
		});

		expect(resolved).toEqual({
			pickMode: "specific",
			specificProblemId: "filled-001",
			poolSize: 1,
			category: "filled",
		});
		expect(categoriesSeen).toContain("filled");
	});

	test("throws when every category pool is empty", async () => {
		globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body ?? "{}")) as {
				method?: string;
				params?: { arguments?: Record<string, unknown> };
			};
			const args = body.params?.arguments ?? {};
			if (!args.category) {
				return new Response(
					JSON.stringify({
						result: {
							structuredContent: {
								items: [],
								categories: { astronomy: 1, biology: 1 },
								totalMatched: 0,
							},
						},
					}),
					{ status: 200 },
				);
			}
			return new Response(
				JSON.stringify({
					result: {
						structuredContent: {
							items: [],
							categories: { [String(args.category)]: 0 },
							totalMatched: 0,
						},
					},
				}),
				{ status: 200 },
			);
		}) as unknown as typeof fetch;

		await expect(
			resolveRuntimePick({
				pickMode: "random",
				mcpUrl: "https://example.test/mcp",
			}),
		).rejects.toThrow("No available problems found in any category.");
	});

	test("requires a problem id for specific mode", async () => {
		await expect(
			resolveRuntimePick({
				pickMode: "specific",
				specificProblemId: null,
				mcpUrl: "https://example.test/mcp",
			}),
		).rejects.toThrow("OPEN_QUESTIONS_PROBLEM_ID is required");
	});
});

describe("listAvailableProblemIds / listCatalogCategories", () => {
	test("passes category and limit to list_problems", async () => {
		let seenBody: Record<string, unknown> | null = null;
		globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
			seenBody = JSON.parse(String(init?.body ?? "{}")) as Record<
				string,
				unknown
			>;
			return new Response(
				JSON.stringify({
					result: {
						structuredContent: {
							items: [{ id: "bio-1", category: "biology" }],
							categories: { biology: 1 },
						},
					},
				}),
				{ status: 200 },
			);
		}) as unknown as typeof fetch;

		const listed = await listAvailableProblemIds(
			"https://example.test/mcp",
			7,
			"biology",
		);
		expect(listed.candidateIds).toEqual(["bio-1"]);
		expect(listed.categories).toEqual(["biology"]);
		expect(seenBody).toMatchObject({
			method: "tools/call",
			params: {
				name: "list_problems",
				arguments: { limit: 7, status: "available", category: "biology" },
			},
		});
	});

	test("parses SSE data payloads from MCP responses", async () => {
		globalThis.fetch = (async () =>
			new Response(
				[
					"event: message",
					`data: ${JSON.stringify({
						result: {
							structuredContent: {
								items: [{ id: "math-9" }],
								categories: { mathematics: 1 },
							},
						},
					})}`,
					"",
				].join("\n"),
				{ status: 200 },
			)) as unknown as typeof fetch;

		const listed = await listAvailableProblemIds("https://example.test/mcp");
		expect(listed.candidateIds).toEqual(["math-9"]);
	});

	test("surfaces MCP HTTP failures", async () => {
		globalThis.fetch = (async () =>
			new Response("boom", { status: 502 })) as unknown as typeof fetch;

		await expect(
			listAvailableProblemIds("https://example.test/mcp"),
		).rejects.toThrow("tools/call failed (502)");
	});

	test("reads catalog categories from resources/read", async () => {
		globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body ?? "{}")) as {
				method?: string;
				params?: { uri?: string };
			};
			expect(body.method).toBe("resources/read");
			expect(body.params?.uri).toBe("open-questions://catalog");
			return new Response(
				JSON.stringify({
					result: {
						contents: [
							{
								text: JSON.stringify({
									categories: { physics: 3, biology: 0 },
								}),
							},
						],
					},
				}),
				{ status: 200 },
			);
		}) as unknown as typeof fetch;

		await expect(
			listCatalogCategories("https://example.test/mcp"),
		).resolves.toEqual(["physics"]);
	});
});
