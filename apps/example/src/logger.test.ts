import { describe, expect, mock, test } from "bun:test";
import {
	createLogger,
	type LogAttributes,
	summarizeAssistantActivity,
	summarizeContentBlocks,
	summarizeToolArgs,
	summarizeToolOutcome,
	truncate,
	withToolLogging,
} from "./logger";

describe("truncate", () => {
	test("leaves short strings alone", () => {
		expect(truncate("hello", 10)).toBe("hello");
	});

	test("shortens long strings with a remainder marker", () => {
		expect(truncate("abcdefghij", 4)).toBe("abcd…[+6 chars]");
	});

	test("truncates nested object json when needed", () => {
		const value = truncate({ hello: "world".repeat(20) }, 20);
		expect(typeof value).toBe("string");
		expect(String(value)).toContain("…[+");
	});

	test("maps array values recursively", () => {
		expect(truncate(["abcd", "ef"], 2)).toEqual(["ab…[+2 chars]", "ef"]);
	});
});

describe("summarizeToolArgs", () => {
	test("keeps only intent fields", () => {
		expect(
			summarizeToolArgs({
				query: "anthropic principle",
				status: "available",
				limit: 25,
				noise: "x".repeat(500),
			}),
		).toEqual({
			query: "anthropic principle",
			status: "available",
			limit: 25,
		});
	});
});

describe("summarizeToolOutcome", () => {
	test("reports list counts instead of payloads", () => {
		expect(
			summarizeToolOutcome({
				content: JSON.stringify({
					items: [{ id: "a" }, { id: "b" }],
					claim: { claimId: "claim-1", problemId: "math-001" },
				}),
			}),
		).toMatchObject({
			itemsCount: 2,
			claimId: "claim-1",
			problemId: "math-001",
		});
	});

	test("reports openalex-style meta counts", () => {
		expect(
			summarizeToolOutcome(
				JSON.stringify({
					meta: { count: 3080 },
					results: [{ id: "w1" }],
				}),
			),
		).toMatchObject({
			resultCount: 3080,
			resultsCount: 1,
		});
	});
});

describe("summarizeAssistantActivity", () => {
	test("extracts model text and tool names", () => {
		expect(
			summarizeAssistantActivity([
				{ type: "text", text: "Picking a cosmology problem." },
				{
					type: "tool_use",
					name: "mcp__unsolved__pick_problem",
					input: { problemId: "astronomy-1" },
				},
				{ type: "thinking", thinking: "..." },
			]),
		).toEqual({
			text: "Picking a cosmology problem.",
			tools: ["mcp__unsolved__pick_problem"],
			thinking: true,
		});
	});

	test("returns empty activity for tool-only turns", () => {
		expect(
			summarizeAssistantActivity([
				{ type: "tool_use", name: "ToolSearch", input: { query: "x" } },
			]),
		).toEqual({ tools: ["ToolSearch"] });
	});
});

describe("summarizeContentBlocks", () => {
	test("wraps non-array content", () => {
		expect(summarizeContentBlocks("hi")).toEqual([
			{ type: "string", value: "hi" },
		]);
	});

	test("summarizes known block types compactly", () => {
		expect(
			summarizeContentBlocks([
				{ type: "text", text: "hello" },
				{ type: "thinking", thinking: "hmm" },
				{
					type: "tool_use",
					id: "1",
					name: "list_problems",
					input: { limit: 5, status: "available" },
				},
				{
					type: "tool_result",
					tool_use_id: "1",
					is_error: false,
					content: JSON.stringify({ items: [1, 2, 3] }),
				},
				{ type: "other", payload: true },
			]),
		).toEqual([
			{ type: "text", text: "hello" },
			{ type: "thinking", thinking: true },
			{
				type: "tool_use",
				name: "list_problems",
				input: { limit: 5, status: "available" },
			},
			{
				type: "tool_result",
				tool_use_id: "1",
				is_error: false,
				outcome: expect.objectContaining({ itemsCount: 3 }),
			},
			{ type: "other" },
		]);
	});
});

describe("withToolLogging", () => {
	test("logs compact args and outcomes", async () => {
		const infoCalls: Array<[string, LogAttributes?]> = [];
		const logger = {
			child: () => logger,
			debug: mock(() => {}),
			info: (message: string, attributes?: LogAttributes) => {
				infoCalls.push([message, attributes]);
			},
			warn: mock(() => {}),
			error: mock(() => {}),
		};

		const result = await withToolLogging(
			logger,
			"list_problems",
			{ limit: 1, status: "available" },
			async () => ({ items: [{ id: "a" }] }),
		);

		expect(result).toEqual({ items: [{ id: "a" }] });
		expect(infoCalls).toHaveLength(2);
		expect(infoCalls[0]?.[0]).toBe("tool starting");
		expect(infoCalls[0]?.[1]).toEqual({
			toolName: "list_problems",
			args: { limit: 1, status: "available" },
		});
		expect(infoCalls[1]?.[0]).toBe("tool finished");
		expect(infoCalls[1]?.[1]).toMatchObject({
			toolName: "list_problems",
			outcome: { itemsCount: 1 },
		});
	});

	test("logs failures and rethrows", async () => {
		const logger = {
			child: () => logger,
			debug: mock(() => {}),
			info: mock(() => {}),
			warn: mock(() => {}),
			error: mock(() => {}),
		};

		await expect(
			withToolLogging(logger, "pick_problem", {}, async () => {
				throw new Error("nope");
			}),
		).rejects.toThrow("nope");
		expect(logger.error).toHaveBeenCalledTimes(1);
	});
});

describe("createLogger", () => {
	test("returns a logger with the expected methods", () => {
		const logger = createLogger({ agent: "test" });
		expect(typeof logger.info).toBe("function");
		expect(typeof logger.child({ run: "1" }).debug).toBe("function");
	});
});
