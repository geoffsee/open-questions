import { describe, expect, test } from "bun:test";
import {
	makeProblemId,
	normalizeProblemText,
	slugifyProblemPart,
	stableProblemHash,
} from "./problemIds";

describe("normalizeProblemText", () => {
	test("trims and collapses whitespace", () => {
		expect(normalizeProblemText("  P vs   NP  ")).toBe("P vs NP");
	});
});

describe("slugifyProblemPart", () => {
	test("lowercases and hyphenates", () => {
		expect(slugifyProblemPart("Computer Science")).toBe("computer-science");
		expect(slugifyProblemPart("  --Hello--  ")).toBe("hello");
	});

	test("truncates to 40 characters", () => {
		expect(slugifyProblemPart("a".repeat(60)).length).toBe(40);
	});
});

describe("stableProblemHash", () => {
	test("is deterministic 8-char hex", () => {
		expect(stableProblemHash("same")).toBe(stableProblemHash("same"));
		expect(stableProblemHash("same")).not.toBe(stableProblemHash("other"));
		expect(stableProblemHash("x")).toMatch(/^[0-9a-f]{8}$/);
	});
});

describe("makeProblemId", () => {
	test("builds a stable category-section-hash id", () => {
		const id = makeProblemId(
			"biology",
			"Origin of life",
			"  How did life begin?  ",
		);
		const again = makeProblemId(
			"biology",
			"Origin of life",
			"How did life begin?",
		);
		expect(id).toBe(again);
		expect(id.startsWith("biology-origin-of-life-")).toBe(true);
		expect(id.split("-").at(-1)).toMatch(/^[0-9a-f]{8}$/);
	});

	test("changes when category or section changes", () => {
		const base = makeProblemId("math", "Number theory", "RH");
		expect(makeProblemId("physics", "Number theory", "RH")).not.toBe(base);
		expect(makeProblemId("math", "Analysis", "RH")).not.toBe(base);
	});
});
