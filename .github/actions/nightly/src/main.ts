import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasMatchingProblemCategories(
	manifest: unknown,
	data: unknown,
): boolean {
	if (!isRecord(manifest) || manifest.version !== 1) return false;
	if (!isRecord(manifest.categories) || !isRecord(data)) return false;
	if (!isRecord(data.categories)) return false;

	const expected = Object.entries(manifest.categories)
		.filter(
			([, category]) => isRecord(category) && category.type === "problems",
		)
		.map(([category]) => category)
		.sort();
	const requireData = Object.entries(manifest.categories)
		.filter(
			([, category]) =>
				isRecord(category) &&
				category.type === "problems" &&
				isRecord(category.source) &&
				category.source.type === "wikipedia",
		)
		.map(([category]) => category);
	const actual = Object.keys(data.categories).sort();
	if (
		expected.length !== actual.length ||
		expected.some((category, index) => category !== actual[index])
	) {
		return false;
	}

	return Object.entries(data.categories).every(([category, sections]) => {
		if (!Array.isArray(sections)) return false;
		return (
			sections.every(
				(section) =>
					isRecord(section) &&
					typeof section.heading === "string" &&
					Array.isArray(section.problems) &&
					section.problems.every((problem) => typeof problem === "string"),
			) &&
			(requireData.includes(category)
				? sections.some(
						(section) =>
							Array.isArray(section.problems) && section.problems.length > 0,
					)
				: true)
		);
	});
}

export function hasCachedProblems(
	path: string,
	manifestPath?: string,
): boolean {
	if (!existsSync(path)) return false;
	if (!manifestPath) return true;
	try {
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
		const data = JSON.parse(readFileSync(path, "utf8")) as unknown;
		return hasMatchingProblemCategories(manifest, data);
	} catch {
		return false;
	}
}

export function normalizeProblemData(data: unknown): unknown {
	if (!isRecord(data) || !isRecord(data.categories)) return data;

	const categories = Object.fromEntries(
		Object.entries(data.categories).map(([category, rawSections]) => {
			if (!Array.isArray(rawSections)) return [category, rawSections];
			const sections = new Map<
				string,
				{ heading: string; problems: string[] }
			>();
			for (const rawSection of rawSections) {
				if (
					!isRecord(rawSection) ||
					typeof rawSection.heading !== "string" ||
					!Array.isArray(rawSection.problems)
				)
					continue;
				const existing = sections.get(rawSection.heading);
				const problems = rawSection.problems.filter(
					(problem): problem is string => typeof problem === "string",
				);
				if (existing) {
					existing.problems = [...new Set([...existing.problems, ...problems])];
				} else {
					sections.set(rawSection.heading, {
						heading: rawSection.heading,
						problems: [...new Set(problems)],
					});
				}
			}
			return [category, [...sections.values()]];
		}),
	);

	return { ...data, categories };
}

export function normalizeCachedProblems(path: string): void {
	const source = readFileSync(path, "utf8");
	const normalized = JSON.stringify(
		normalizeProblemData(JSON.parse(source)),
		null,
		2,
	);
	if (normalized !== source) writeFileSync(path, normalized);
}

async function command(cwd: string, args: string[]) {
	const exitCode = await exec.exec("bun", args, { cwd });
	if (exitCode !== 0)
		throw new Error(`bun ${args.join(" ")} exited ${exitCode}`);
}

export async function publishCachedProblems(
	client: string,
	manifestPath: string,
	problemsPath: string,
	execute: typeof exec.exec = exec.exec,
) {
	const exitCode = await execute(
		resolve(client, "dist/publish-cli"),
		["--manifest", manifestPath, problemsPath],
		{ cwd: client },
	);
	if (exitCode !== 0)
		throw new Error("Publishing cached problems.json failed.");
}

/**
 * github-pages env historically allowed only `master` after the default
 * branch rename. Ensure `main` is allowed so the deploy job can succeed.
 * Best-effort: missing token/permissions must not fail the data build.
 */
export async function ensurePagesAllowsMain(
	fetchImpl: typeof fetch = fetch,
): Promise<void> {
	const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
	const repo = process.env.GITHUB_REPOSITORY;
	if (!token || !repo) {
		core.info("Skipping pages branch policy check (token/repo missing)");
		return;
	}

	const headers = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
		"X-GitHub-Api-Version": "2022-11-28",
	};
	const base = `https://api.github.com/repos/${repo}/environments/github-pages/deployment-branch-policies`;

	try {
		const listRes = await fetchImpl(base, { headers });
		if (!listRes.ok) {
			core.warning(
				`Could not list github-pages branch policies (${listRes.status})`,
			);
			return;
		}
		const body = (await listRes.json()) as {
			branch_policies?: Array<{ name?: string }>;
		};
		const names = (body.branch_policies ?? [])
			.map((p) => p.name)
			.filter((n): n is string => typeof n === "string");
		if (names.includes("main")) {
			core.info("github-pages already allows main");
			return;
		}

		const createRes = await fetchImpl(base, {
			method: "POST",
			headers: { ...headers, "Content-Type": "application/json" },
			body: JSON.stringify({ name: "main", type: "branch" }),
		});
		if (createRes.ok) {
			core.info("Added main to github-pages deployment branch policies");
			return;
		}
		core.warning(
			`Failed to add main to github-pages branch policies (${createRes.status})`,
		);
	} catch (error) {
		core.warning(`Pages branch policy self-heal failed: ${String(error)}`);
	}
}

export async function run(): Promise<void> {
	try {
		const root = process.env.GITHUB_WORKSPACE ?? process.cwd();
		const client = resolve(root, "apps/client");
		const configuredManifest =
			process.env.PUBLISH_MANIFEST ||
			process.env.OPEN_QUESTIONS_MANIFEST ||
			process.env.CATALOG_MANIFEST;
		const manifestPath = configuredManifest
			? isAbsolute(configuredManifest)
				? configuredManifest
				: resolve(client, configuredManifest)
			: resolve(client, "public/data/manifest.json");
		await ensurePagesAllowsMain();
		await command(client, ["install"]);
		await command(client, ["run", "build:cli"]);
		await command(client, ["x", "playwright", "install", "chromium"]);

		if (
			hasCachedProblems(
				resolve(client, "public/data/problems.json"),
				manifestPath,
			)
		) {
			core.info("Using cached problems.json");
			normalizeCachedProblems(resolve(client, "public/data/problems.json"));
			await publishCachedProblems(
				client,
				manifestPath,
				resolve(client, "public/data/problems.json"),
			);
		} else {
			await command(client, ["run", "fetch-data"]);
		}
		await command(client, ["run", "fetch-news"]);
		await command(client, ["run", "fetch-cases"]);
		try {
			await command(client, ["run", "enrich-data"]);
		} catch (error) {
			core.warning(`Problem enrichment failed: ${String(error)}`);
		}
		await command(client, ["run", "build"]);
	} catch (error) {
		core.setFailed(error instanceof Error ? error.message : String(error));
	}
}
