import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CaseCategoryData } from "../../lib/cases";
import type { EnrichmentProblem, Section } from "../../lib/wiki";

interface NewsItem {
	title: string;
	sources: { domain: string; url: string }[];
	seendate: string;
}

export function data() {
	const problemsPath = resolve("public/data/problems.json");
	const enrichmentsPath = resolve("public/data/enrichments.json");
	const newsPath = resolve("public/data/news.json");
	const casesPath = resolve("public/data/cases.json");

	let categories: Record<string, Section[]> = {};
	let enrichments: Record<string, EnrichmentProblem> = {};
	let news: NewsItem[] = [];
	let cases: Record<string, CaseCategoryData> = {};

	if (existsSync(problemsPath)) {
		const raw = JSON.parse(readFileSync(problemsPath, "utf-8"));
		categories = raw.categories || {};
	}

	if (existsSync(enrichmentsPath)) {
		const raw = JSON.parse(readFileSync(enrichmentsPath, "utf-8"));
		enrichments = raw.problems || {};
	}

	if (existsSync(newsPath)) {
		const raw = JSON.parse(readFileSync(newsPath, "utf-8"));
		news = raw.articles || [];
	}

	if (existsSync(casesPath)) {
		const raw = JSON.parse(readFileSync(casesPath, "utf-8"));
		cases = raw.categories || {};
	}

	return { categories, enrichments, news, cases };
}
