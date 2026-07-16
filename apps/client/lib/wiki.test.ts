import { afterEach, describe, expect, test } from "bun:test";
import { CATEGORIES, getEnrichment, setEnrichments } from "./wiki";

afterEach(() => {
	setEnrichments({});
});

describe("enrichment store", () => {
	test("keys enrichments by the first 120 chars of problem text", () => {
		const text = `Problem ${"x".repeat(200)}`;
		setEnrichments({
			[text.slice(0, 120)]: {
				summary: "Short summary",
				significance: "Why it matters",
				field: "biology",
			},
		});

		expect(getEnrichment(text)).toEqual({
			summary: "Short summary",
			significance: "Why it matters",
			field: "biology",
		});
		expect(getEnrichment("unrelated problem")).toBeNull();
	});

	test("returns null when store is empty", () => {
		expect(getEnrichment("anything")).toBeNull();
	});
});

describe("CATEGORIES", () => {
	test("includes core scientific categories with wiki pages", () => {
		expect(CATEGORIES.mathematics?.page).toContain("mathematics");
		expect(CATEGORIES.physics?.emoji).toBeTruthy();
		expect(CATEGORIES.astronomy?.color).toMatch(/^#/);
	});

	test("marks special non-wiki categories by type", () => {
		expect(CATEGORIES["frontier research"]?.type).toBe("news");
		expect(CATEGORIES["missing persons"]?.type).toBe("cases");
		expect(CATEGORIES["unsolved homicides"]?.type).toBe("cases");
	});
});
