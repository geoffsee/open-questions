#!/usr/bin/env bun
const apiOrigin = (
	Bun.env.PUBLISH_API_ORIGIN || "http://localhost:3040/api"
).replace(/\/+$/, "");
const key = Bun.env.PUBLISH_KEY;
if (!key) throw new Error("PUBLISH_KEY is required");
const files = Bun.argv.slice(2);
if (!files.length)
	throw new Error("Usage: open-questions-publish <file> [...files]");
for (const file of files) {
	const path = `/data/${file.replace(/^.*public\/data\//, "")}`;
	const response = await fetch(`${apiOrigin}/publish`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${key}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ path, data: await Bun.file(file).json() }),
	});
	if (!response.ok)
		throw new Error(
			`Publishing ${file} failed: ${response.status} ${await response.text()}`,
		);
	console.log(`Published ${path}`);
}

export {};
