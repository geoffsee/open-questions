import { describe, expect, test } from "bun:test";
import { renderMarkdown, restoreCollapsedGfmTables } from "./MarkdownContent";

describe("restoreCollapsedGfmTables", () => {
	test("rebuilds tables smashed onto one line", () => {
		const collapsed =
			"Token usage for agent. | Metric | Value | | --- | --- | | numTurns | 10 | | totalCostUsd | 0.2 | Done.";
		expect(restoreCollapsedGfmTables(collapsed)).toBe(
			[
				"Token usage for agent.",
				"| Metric | Value |",
				"| --- | --- |",
				"| numTurns | 10 |",
				"| totalCostUsd | 0.2 |",
				"Done.",
			].join("\n"),
		);
	});

	test("leaves already multiline markdown alone", () => {
		const source = "| Metric | Value |\n| --- | --- |\n| a | 1 |\n";
		expect(restoreCollapsedGfmTables(source)).toBe(source);
	});
});

describe("renderMarkdown", () => {
	test("renders gfm tables to html", () => {
		const html = renderMarkdown(
			"| Metric | Value |\n| --- | --- |\n| numTurns | 10 |\n",
		);
		expect(html).toContain("<table>");
		expect(html).toContain("<th>Metric</th>");
		expect(html).toContain("<td>numTurns</td>");
		expect(html).toContain("<td>10</td>");
	});

	test("renders previously collapsed tables", () => {
		const html = renderMarkdown(
			"Intro. | Metric | Value | | --- | --- | | numTurns | 10 | Outro.",
		);
		expect(html).toContain("<table>");
		expect(html).toContain("<td>numTurns</td>");
		expect(html).toContain("<td>10</td>");
	});

	test("allows http(s) and mailto links with safe attributes", () => {
		const html = renderMarkdown(
			"[docs](https://example.com) and [mail](mailto:dev@example.com)",
		);
		expect(html).toContain(
			'href="https://example.com" target="_blank" rel="noopener noreferrer"',
		);
		expect(html).toContain(
			'href="mailto:dev@example.com" target="_blank" rel="noopener noreferrer"',
		);
	});

	test("strips unsafe links and raw html", () => {
		const html = renderMarkdown(
			"[click](javascript:alert(1)) and <script>alert(1)</script> **bold**",
		);
		expect(html).not.toContain("javascript:");
		expect(html).not.toContain("<script>");
		expect(html).toContain("<strong>bold</strong>");
		expect(html).toContain("click");
	});

	test("leaves non-table single-line text unchanged before render", () => {
		expect(restoreCollapsedGfmTables("Just a sentence without pipes.")).toBe(
			"Just a sentence without pipes.",
		);
		expect(restoreCollapsedGfmTables("a | b | c without separator")).toBe(
			"a | b | c without separator",
		);
	});
});
