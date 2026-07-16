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
});
