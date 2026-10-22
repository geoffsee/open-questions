import { describe, expect, test } from "bun:test";
import {
	extractHistoryText,
	extractResearchedCandidates,
	parseContinueRatio,
	pickContinuation,
	shouldContinue,
	truncateHistory,
} from "./continuePick";

describe("extractResearchedCandidates", () => {
	test("keeps only items with saved research", () => {
		const candidates = extractResearchedCandidates({
			result: {
				structuredContent: {
					items: [
						{ id: "a", category: "chemistry", researchEntryCount: 2 },
						{ id: "b", category: "biology", researchEntryCount: 0 },
						{ id: "c", category: "physics" },
					],
				},
			},
		});
		expect(candidates.map((candidate) => candidate.id)).toEqual(["a"]);
	});

	test("returns empty without structured items", () => {
		expect(extractResearchedCandidates({ result: {} })).toEqual([]);
	});
});

describe("pickContinuation", () => {
	const candidates = [
		{ id: "one", category: "x", researchEntryCount: 1, lastResearchAt: null },
		{ id: "many", category: "x", researchEntryCount: 40, lastResearchAt: null },
	];

	test("returns null for an empty pool", () => {
		expect(pickContinuation([])).toBeNull();
	});

	test("caps the weight of long threads", () => {
		// Weights are 1 and 5 (capped from 40), so 1/6 of the range picks "one".
		expect(pickContinuation(candidates, () => 0.1)?.id).toBe("one");
		expect(pickContinuation(candidates, () => 0.2)?.id).toBe("many");
	});
});

describe("extractHistoryText", () => {
	test("reads the text content", () => {
		expect(
			extractHistoryText({
				result: { content: [{ type: "text", text: "entry one" }] },
			}),
		).toBe("entry one");
	});

	test("throws on tool errors and empty results", () => {
		expect(() =>
			extractHistoryText({
				result: {
					isError: true,
					content: [{ type: "text", text: "Unknown tool" }],
				},
			}),
		).toThrow("get_problem_history failed");
		expect(() => extractHistoryText({ result: { content: [] } })).toThrow();
	});
});

describe("truncateHistory", () => {
	test("keeps the most recent text", () => {
		const text = `${"old ".repeat(50)}newest`;
		const truncated = truncateHistory(text, 20);
		expect(truncated).toContain("newest");
		expect(truncated).toContain("[earlier entries omitted]");
		expect(truncateHistory("short", 20)).toBe("short");
	});
});

describe("continue ratio", () => {
	test("parses 0 to 1 and rejects other values", () => {
		expect(parseContinueRatio(undefined)).toBe(0);
		expect(parseContinueRatio("")).toBe(0);
		expect(parseContinueRatio("0.67")).toBe(0.67);
		expect(() => parseContinueRatio("2")).toThrow();
		expect(() => parseContinueRatio("half")).toThrow();
	});

	test("shouldContinue compares the roll against the ratio", () => {
		expect(shouldContinue(0, () => 0)).toBe(false);
		expect(shouldContinue(0.5, () => 0.4)).toBe(true);
		expect(shouldContinue(0.5, () => 0.6)).toBe(false);
		expect(shouldContinue(1, () => 0.99)).toBe(true);
	});
});
