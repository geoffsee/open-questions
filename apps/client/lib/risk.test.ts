import { describe, expect, test } from "bun:test";
import { getProblemRisk, getRiskBadgeColors } from "./risk";

describe("getProblemRisk", () => {
	test("rates pure math relatively lower than high-impact domains", () => {
		const math = getProblemRisk(
			"mathematics",
			"Number theory",
			"Prove the twin prime conjecture in pure number theory.",
		);
		const ai = getProblemRisk(
			"computer science",
			"AI safety",
			"Artificial intelligence alignment and catastrophic risk to civilization.",
		);

		expect(["low", "medium"]).toContain(math.level);
		expect(ai.level).toBe("high");
		expect(ai.label).toBe("High risk");
	});

	test("includes enrichment text in scoring material", () => {
		const without = getProblemRisk(
			"philosophy",
			"Mind",
			"A definition question.",
		);
		const withEnrichment = getProblemRisk(
			"philosophy",
			"Mind",
			"A definition question.",
			{
				summary: "Global catastrophic pandemic and nuclear security risks.",
				significance: "existential risk",
				field: "ethics",
			},
		);

		const levels = { low: 0, medium: 1, high: 2 } as const;
		expect(levels[withEnrichment.level]).toBeGreaterThanOrEqual(
			levels[without.level],
		);
	});

	test("uses default base score for unknown categories", () => {
		const risk = getProblemRisk(
			"unknown-field",
			"Misc",
			"An abstract conjecture.",
		);
		expect(["low", "medium", "high"]).toContain(risk.level);
		expect(risk.label).toMatch(/risk$/i);
	});

	test("moderating pure-math patterns can reduce score", () => {
		const moderated = getProblemRisk(
			"physics",
			"Mathematical physics",
			"An abstract manifold topology conjecture about prime integers.",
		);
		const unmoderated = getProblemRisk(
			"physics",
			"Applied energy",
			"Nuclear fusion reactor safety for global energy policy and human health.",
		);
		const levels = { low: 0, medium: 1, high: 2 } as const;
		expect(levels[moderated.level]).toBeLessThanOrEqual(
			levels[unmoderated.level],
		);
	});
});

describe("getRiskBadgeColors", () => {
	test("returns chakra-style tokens per level", () => {
		expect(getRiskBadgeColors("high")).toEqual({
			bg: "orange.100",
			color: "orange.800",
		});
		expect(getRiskBadgeColors("medium")).toEqual({
			bg: "yellow.100",
			color: "yellow.800",
		});
		expect(getRiskBadgeColors("low")).toEqual({
			bg: "green.100",
			color: "green.800",
		});
	});
});
