import type { EnrichmentProblem } from "./wiki";

export type RiskLevel = "low" | "medium" | "high";

export type ProblemRisk = {
	level: RiskLevel;
	label: string;
};

const categoryBase: Record<string, number> = {
	mathematics: 18,
	philosophy: 20,
	astronomy: 34,
	chemistry: 38,
	biology: 48,
	neuroscience: 50,
	economics: 54,
	physics: 58,
	"computer science": 62,
};

const highRiskPatterns = [
	/artificial intelligence|machine learning|algorithmic bias|black box/i,
	/cryptography|public-key|one-way function|discrete logarithm|integer factorization/i,
	/climate|warming|carbon|methane|ocean|atmosphere/i,
	/pandemic|virus|pathogen|disease|infection|antibiotic|cancer|aging/i,
	/nuclear|fusion|radiation|reactor/i,
	/econom(?:y|ic)|market|financial|inflation|recession|inequality/i,
	/consciousness|dementia|alzheimer|mental|brain/i,
	/dark matter|dark energy|black hole|cosmological|asteroid|supernova/i,
];

const moderatingPatterns = [
	/conjecture|hypothesis|proof|number theory|topology|graph theory|geometry|algebra/i,
	/classification|taxonomy|definition|interpretation|paradox/i,
];

export function getProblemRisk(
	category: string,
	section: string,
	text: string,
	enrichment?: EnrichmentProblem | null,
): ProblemRisk {
	const material = [
		category,
		section,
		text,
		enrichment?.summary,
		enrichment?.significance,
		enrichment?.field,
	]
		.filter(Boolean)
		.join(" ");

	let score = categoryBase[category.toLowerCase()] ?? 35;

	for (const pattern of highRiskPatterns) {
		if (pattern.test(material)) score += 8;
	}

	for (const pattern of moderatingPatterns) {
		if (pattern.test(material)) score -= 5;
	}

	if (
		/existential|catastrophic|extinction|global|civilization|security/i.test(
			material,
		)
	)
		score += 12;
	if (/human|society|policy|health|medicine|energy|food|water/i.test(material))
		score += 7;
	if (/pure|abstract|prime|integer|manifold|knot/i.test(material)) score -= 6;

	score = Math.max(1, Math.min(99, Math.round(score)));

	if (score >= 55) return { level: "high", label: "High risk" };
	if (score >= 30) return { level: "medium", label: "Medium risk" };
	return { level: "low", label: "Low risk" };
}

export function getRiskBadgeColors(level: RiskLevel) {
	switch (level) {
		case "high":
			return { bg: "orange.100", color: "orange.800" };
		case "medium":
			return { bg: "yellow.100", color: "yellow.800" };
		case "low":
			return { bg: "green.100", color: "green.800" };
	}
}
