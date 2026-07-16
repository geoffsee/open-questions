import type { CaseCategoryData } from "../../lib/cases";
import type { EnrichmentProblem, Section } from "../../lib/wiki";

interface NewsItem {
	title: string;
	sources: { domain: string; url: string }[];
	seendate: string;
}

export async function data() {
	const origin = (import.meta.env.VITE_API_ORIGIN || "/api").replace(
		/\/+$/,
		"",
	);
	const load = async (name: string) => {
		const response = await fetch(`${origin}/data/${name}`);
		if (!response.ok) return {};
		return response.json();
	};
	const [problems, enrichmentData, newsData, casesData] = await Promise.all([
		load("problems.json"),
		load("enrichments.json"),
		load("news.json"),
		load("cases.json"),
	]);
	return {
		categories: problems.categories || {},
		enrichments: enrichmentData.problems || {},
		news: newsData.articles || [],
		cases: casesData.categories || {},
	};
}
