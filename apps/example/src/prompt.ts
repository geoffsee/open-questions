export type UserBriefInput = {
	goal?: string;
	background?: string;
	constraints?: string;
	context?: string;
};

export type PickMode = "specific" | "random" | "agent" | string;

export function buildUserBrief(input: UserBriefInput): string {
	const parts = [
		input.goal ? `Desired outcome: ${input.goal}` : null,
		input.background ? `Background or strengths: ${input.background}` : null,
		input.constraints
			? `Constraints or preferences: ${input.constraints}`
			: null,
		input.context ? `Extra context: ${input.context}` : null,
	].filter((value): value is string => Boolean(value));

	return parts.join("\n");
}

export function buildPickInstructions(input: {
	pickMode: PickMode;
	specificProblemId?: string | null;
}): string {
	if (input.pickMode === "specific") {
		if (!input.specificProblemId) {
			throw new Error(
				"OPEN_QUESTIONS_PROBLEM_ID is required when OPEN_QUESTIONS_PICK_MODE=specific.",
			);
		}

		return [
			`Pick mode: specific.`,
			`Claim exactly this problemId: ${input.specificProblemId}.`,
			"Do not choose a different problem.",
		].join("\n");
	}

	if (input.pickMode === "random") {
		return [
			"Pick mode: random.",
			"Call list_problems with status=available and limit=1 to read structuredContent.categories (or read open-questions://catalog).",
			"Choose one category uniformly at random from categories with count > 0.",
			"Call list_problems again with that category, status=available, and limit=25.",
			"If the category is empty, pick a different category and retry.",
			"Choose one of the returned problem IDs uniformly at random.",
			"Do not bias toward the first item or toward any particular category.",
		].join("\n");
	}

	return [
		"Pick mode: agent.",
		"Call list_problems with status=available and limit=5.",
		"Choose the best candidate for a short first-pass research note.",
		"Prefer a concise statement and a clear scientific field.",
		"Use the user brief to bias selection when it is relevant.",
	].join("\n");
}

export function buildCatalogPrompt(input: {
	agentId: string;
	leaseMinutes: number;
	pickMode: PickMode;
	specificProblemId?: string | null;
	userBrief: string;
	variant: "anthropic" | "cursor";
	/** Saved research on the picked problem, when this run continues it. */
	priorWork?: string;
}): string {
	const catalogLine =
		input.variant === "anthropic"
			? "Use only the unsolved MCP tools for catalog work."
			: "Use the unsolved MCP tools for catalog work.";

	const researchLines =
		input.variant === "cursor"
			? [
					"Prefer the configured research MCP tools (searxng, fetch, openalex, crossref, playwright) over editing local files.",
					"Use the code_sandbox MCP run_code tool to write and execute short python/javascript/typescript snippets when a calculation, simulation, or prototype would test an idea.",
					"Do not modify repository source files. Do not open a PR.",
				]
			: [
					"Use the code_sandbox run_code tool to write and execute short python/javascript/typescript snippets when a calculation, simulation, or prototype would test an idea.",
				];

	const tools =
		input.variant === "anthropic"
			? "the configured tools"
			: "the configured research tools";
	const researchStep = input.priorWork
		? `3. Start from the prior work below. Use ${tools} only for what it does not already establish.`
		: `3. Call get_problem_history for the chosen problem and build on any saved work, then use ${tools} to find a credible primary source or authoritative review relevant to the problem.`;

	const priorWorkLines = input.priorWork
		? [
				"",
				"Prior work on this problem (saved by earlier runs, oldest first):",
				input.priorWork,
				"",
				"This run continues that work:",
				"- Do not re-cite a source or restate a claim already recorded; add something new.",
				"- If the latest entry names a next discriminating test, run it (with run_code when it is computational) and report whether the result supports or refutes the earlier claim.",
				"- If earlier entries conflict, say which is better supported and why.",
				"- Use kind=failed_attempt when the test refutes the earlier claim, and hypothesis or candidate_approach when it narrows the question.",
				"- Title the entry by what changed relative to the earlier work.",
			]
		: [];

	return [
		`You are agent ${input.agentId} contributing to the Open Questions.`,
		catalogLine,
		...researchLines,
		"",
		buildPickInstructions({
			pickMode: input.pickMode,
			specificProblemId: input.specificProblemId,
		}),
		"",
		"Workflow:",
		`1. Select one available problem according to the pick instructions.`,
		`2. Call pick_problem with agentId=${input.agentId}, leaseMinutes=${input.leaseMinutes}, and the chosen problemId.`,
		researchStep,
		"4. When a numerical check, simulation, counterexample search, or small prototype would strengthen the note, call run_code in the sandbox (clean env, timed, ephemeral workspace) and fold the outcome into your contribution.",
		"5. Call save_progress exactly once with a durable research contribution, not a generic plan or status report:",
		"   - choose the most accurate kind (reference, hypothesis, failed_attempt, candidate_approach, or note)",
		"   - use a specific title that says what was learned or proposed",
		"   - in content, state a concrete claim or result, its supporting basis, the main limitation, and the next discriminating test",
		"   - put the exact best source URL you found in artifactUrl; if no credible source was found, say so explicitly and do not use kind=reference",
		"   - if you ran sandbox code, briefly report what was tested and the observed result",
		"   - do not claim the open problem is solved",
		"6. Stop after saving progress. Do not call submit_solution or release_problem.",
		...priorWorkLines,
		"",
		input.userBrief
			? `User brief:\n${input.userBrief}`
			: "User brief: none supplied.",
		"",
		"When finished, reply with a compact plain-text summary including problemId, claim outcome, whether sandbox code was run, and whether save_progress succeeded.",
	].join("\n");
}
