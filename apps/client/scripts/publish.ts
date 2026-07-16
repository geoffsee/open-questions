import { resolve } from "node:path";

const cli =
	Bun.env.PUBLISH_CLI || resolve(import.meta.dir, "../dist/publish-cli");
export async function publish(...files: string[]) {
	const proc = Bun.spawn([cli, ...files], {
		stdout: "inherit",
		stderr: "inherit",
	});
	if ((await proc.exited) !== 0)
		throw new Error(`Publish CLI failed (${proc.exitCode})`);
}
