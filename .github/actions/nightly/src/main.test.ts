import { describe, expect, test } from "bun:test";
import {
	ensurePagesAllowsMain,
	hasCachedProblems,
	normalizeProblemData,
	publishCachedProblems,
} from "./main";

describe("ensurePagesAllowsMain", () => {
	test("posts main when the policy list omits it", async () => {
		const calls: Array<{ url: string; method?: string }> = [];
		const fetchImpl: typeof fetch = async (input, init) => {
			const url = String(input);
			calls.push({ url, method: init?.method ?? "GET" });
			if (init?.method === "POST") {
				return new Response(JSON.stringify({ name: "main" }), { status: 200 });
			}
			return new Response(
				JSON.stringify({ branch_policies: [{ name: "master" }] }),
				{ status: 200 },
			);
		};
		process.env.GITHUB_TOKEN = "test-token";
		process.env.GITHUB_REPOSITORY = "geoffsee/open-questions";
		await ensurePagesAllowsMain(fetchImpl);
		expect(calls.some((c) => c.method === "POST")).toBe(true);
	});

	test("skips create when main is already allowed", async () => {
		const methods: string[] = [];
		const fetchImpl: typeof fetch = async (_input, init) => {
			methods.push(init?.method ?? "GET");
			return new Response(
				JSON.stringify({ branch_policies: [{ name: "main" }] }),
				{ status: 200 },
			);
		};
		process.env.GITHUB_TOKEN = "test-token";
		process.env.GITHUB_REPOSITORY = "geoffsee/open-questions";
		await ensurePagesAllowsMain(fetchImpl);
		expect(methods).toEqual(["GET"]);
	});
});

describe("nightly data cache", () => {
	test("detects an existing problems file", () => {
		expect(
			hasCachedProblems(new URL("./main.ts", import.meta.url).pathname),
		).toBe(true);
	});

	test("does not treat a missing file as cached", () => {
		expect(hasCachedProblems("/tmp/open-questions-missing-problems.json")).toBe(
			false,
		);
	});

	test("does not reuse a cached file for a malformed or mismatched manifest", () => {
		const problemsPath = new URL("./main.ts", import.meta.url).pathname;
		expect(hasCachedProblems(problemsPath, problemsPath)).toBe(false);
	});

	test("publishes a validated cached problems file to the configured API", async () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		const execute = async (command: string, args: string[]) => {
			calls.push({ command, args });
			return 0;
		};

		await publishCachedProblems(
			"/workspace/apps/client",
			"/workspace/apps/client/public/data/manifest.json",
			"/workspace/apps/client/public/data/problems.json",
			execute,
		);

		expect(calls).toEqual([
			{
				command: "/workspace/apps/client/dist/publish-cli",
				args: [
					"--manifest",
					"/workspace/apps/client/public/data/manifest.json",
					"/workspace/apps/client/public/data/problems.json",
				],
			},
		]);
	});

	test("merges duplicate cached section headings and problem text", () => {
		expect(
			normalizeProblemData({
				categories: {
					mathematics: [
						{ heading: "Algebra", problems: ["A", "B"] },
						{ heading: "Algebra", problems: ["B", "C"] },
					],
				},
			}),
		).toEqual({
			categories: {
				mathematics: [{ heading: "Algebra", problems: ["A", "B", "C"] }],
			},
		});
	});
});
