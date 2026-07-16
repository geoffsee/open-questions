import { Box } from "@chakra-ui/react";
import { marked, type Tokens } from "marked";
import { useMemo } from "react";

const renderer = new marked.Renderer();

renderer.link = ({ href, title, text }: Tokens.Link) => {
	const safeHref =
		href?.startsWith("http://") || href?.startsWith("https://")
			? href
			: href?.startsWith("mailto:")
				? href
				: null;
	if (!safeHref) {
		return text;
	}
	const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
	return `<a href="${escapeAttr(safeHref)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};

renderer.html = () => "";

marked.use({
	gfm: true,
	breaks: false,
	renderer,
});

function escapeAttr(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

/**
 * Older save_progress writes collapsed newlines with normalizeText(), which
 * smashed GFM tables onto one line. Rebuild row breaks when we can.
 */
export function restoreCollapsedGfmTables(text: string): string {
	if (text.includes("\n") || !text.includes("|")) {
		return text;
	}

	// Match a full GFM separator row: | --- | --- |
	const sepMatch = text.match(/\|(?:\s*:?-{3,}:?\s*\|)+/);
	if (!sepMatch || sepMatch.index === undefined) {
		return text;
	}

	const separator = sepMatch[0].trim();
	const colCount = (separator.match(/\|/g) ?? []).length - 1;
	if (colCount < 1) {
		return text;
	}

	const cell = String.raw`\|[^|]*`;
	const rowPattern = new RegExp(`((?:${cell}){${colCount}}\\|)`);
	const sepStart = sepMatch.index;
	const before = text.slice(0, sepStart).trimEnd();
	const after = text.slice(sepStart + sepMatch[0].length).trimStart();

	const headerMatch = before.match(
		new RegExp(`((?:${cell}){${colCount}}\\|)$`),
	);
	if (!headerMatch) {
		return text;
	}

	const header = headerMatch[1];
	const prefix = before.slice(0, before.length - header.length).trimEnd();
	const rows = [header, separator];

	let rest = after;
	while (rest.startsWith("|")) {
		const match = rowPattern.exec(rest);
		if (!match || match.index !== 0) {
			break;
		}
		rows.push(match[1]);
		rest = rest.slice(match[1].length).trimStart();
	}

	return [prefix, ...rows, rest].filter(Boolean).join("\n");
}

export function renderMarkdown(source: string): string {
	const restored = restoreCollapsedGfmTables(source);
	const html = marked.parse(restored, { async: false });
	return typeof html === "string" ? html : "";
}

export function MarkdownContent({
	children,
	fontSize = "0.86rem",
	lineHeight = "1.75",
	color = "app.text",
}: {
	children: string;
	fontSize?: string;
	lineHeight?: string | number;
	color?: string;
}) {
	const html = useMemo(() => {
		if (!children.trim()) return "";
		return renderMarkdown(children);
	}, [children]);

	if (!html) return null;

	return (
		<Box
			color={color}
			fontSize={fontSize}
			lineHeight={lineHeight}
			overflowWrap="anywhere"
			css={{
				"& > *:first-child": { marginTop: 0 },
				"& > *:last-child": { marginBottom: 0 },
				"& p": {
					marginTop: 0,
					marginBottom: "0.65em",
				},
				"& strong": {
					color: "var(--chakra-colors-app-textBright)",
					fontWeight: 600,
				},
				"& em": {
					fontStyle: "italic",
				},
				"& a": {
					color: "var(--chakra-colors-app-accentHover)",
					textDecoration: "underline",
					overflowWrap: "anywhere",
				},
				"& ul, & ol": {
					marginTop: 0,
					marginBottom: "0.65em",
					paddingLeft: "1.25rem",
				},
				"& ul": { listStyleType: "disc" },
				"& ol": { listStyleType: "decimal" },
				"& li": {
					marginBottom: "0.25em",
				},
				"& li > p": {
					marginBottom: "0.35em",
				},
				"& h1, & h2, & h3, & h4": {
					color: "var(--chakra-colors-app-textBright)",
					fontFamily: "var(--chakra-fonts-heading)",
					fontWeight: 600,
					lineHeight: 1.35,
					marginTop: "0.9em",
					marginBottom: "0.4em",
				},
				"& h1": { fontSize: "1.05em" },
				"& h2": { fontSize: "1em" },
				"& h3, & h4": { fontSize: "0.95em" },
				"& blockquote": {
					margin: "0.65em 0",
					paddingLeft: "0.85rem",
					borderLeft: "2px solid var(--chakra-colors-app-borderLight)",
					color: "var(--chakra-colors-app-textDim)",
					fontStyle: "italic",
				},
				"& code": {
					fontFamily: "var(--chakra-fonts-mono)",
					fontSize: "0.88em",
					color: "var(--chakra-colors-app-textBright)",
					background: "var(--chakra-colors-app-bgHover)",
					padding: "0.1em 0.35em",
					borderRadius: "0.25rem",
				},
				"& pre": {
					margin: "0.65em 0",
					padding: "0.75rem",
					background: "var(--chakra-colors-app-bgHover)",
					border: "1px solid var(--chakra-colors-app-border)",
					borderRadius: "0.4rem",
					overflowX: "auto",
					fontSize: "0.82em",
					lineHeight: 1.55,
				},
				"& pre code": {
					background: "transparent",
					padding: 0,
					borderRadius: 0,
					whiteSpace: "pre-wrap",
				},
				"& hr": {
					margin: "0.9em 0",
					border: 0,
					borderTop: "1px solid var(--chakra-colors-app-border)",
				},
				"& table": {
					display: "table",
					width: "100%",
					maxWidth: "100%",
					borderCollapse: "collapse",
					fontSize: "0.9em",
					margin: "0.65em 0",
					overflowWrap: "normal",
				},
				"& thead": { display: "table-header-group" },
				"& tbody": { display: "table-row-group" },
				"& tr": { display: "table-row" },
				"& th, & td": {
					display: "table-cell",
					border: "1px solid var(--chakra-colors-app-border)",
					padding: "0.4rem 0.5rem",
					textAlign: "left",
					verticalAlign: "top",
					overflowWrap: "anywhere",
				},
				"& th": {
					color: "var(--chakra-colors-app-textBright)",
					fontWeight: 600,
					background: "var(--chakra-colors-app-bgHover)",
				},
			}}
			// marked output with raw HTML tokens stripped and links restricted to http(s)/mailto
			// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted markdown → HTML pipeline
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}
