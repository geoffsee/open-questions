import {
	Badge,
	Box,
	Button,
	Flex,
	Heading,
	Link,
	Spinner,
	Text,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import {
	fetchProblemResearch,
	fetchResearchActivityPage,
	type LiveClaim,
	type ResearchActivityFilter,
	type ResearchActivityItem,
	type ResearchActivityPage,
	type ResearchActivitySort,
	type ResearchEntry,
	type SubmittedSolution,
} from "../lib/agentResearch";
import { MarkdownContent } from "./MarkdownContent";

export interface ContributionProblem {
	id: string;
	category: string;
	section: string;
	text: string;
}

interface ContributionsFeedProps {
	problemsById: Record<string, ContributionProblem>;
	categoryLabels?: Record<string, string>;
	search: string;
	onBack: () => void;
	onViewProblem: (problem: ContributionProblem) => void;
}

type FeedFilter = ResearchActivityFilter;
type SortMode = ResearchActivitySort;

const ACTIVITY_PAGE_SIZE = 10;

type ContributionItem =
	| { type: "submission"; item: SubmittedSolution; sortDate: string }
	| { type: "research"; item: ResearchEntry; sortDate: string };

interface ContributionGroup {
	problemId: string;
	problem: ContributionProblem | null;
	submissions: SubmittedSolution[];
	researchEntries: ResearchEntry[];
	researchCount: number;
	lastResearchAt: string | null;
	activeClaim: LiveClaim | null;
	latestAt: string;
}

const KIND_LABELS: Record<string, string> = {
	note: "Working note",
	reference: "Reference",
	hypothesis: "Hypothesis",
	failed_attempt: "Ruled-out path",
	handoff: "Handoff",
	candidate_approach: "Candidate approach",
};

function formatDate(dateStr: string | null | undefined) {
	if (!dateStr) return null;
	const date = new Date(dateStr);
	if (Number.isNaN(date.getTime())) return dateStr;

	return date.toLocaleString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
	});
}

function hasUrl(value: string | null | undefined) {
	return Boolean(value && /https?:\/\/\S+/i.test(value));
}

function hasSupportingMaterial(entry: ContributionItem) {
	if (entry.item.artifactUrl) return true;

	if (entry.type === "submission") {
		return (
			Boolean(entry.item.evidence?.trim()) ||
			hasUrl(entry.item.summary) ||
			hasUrl(entry.item.approach)
		);
	}

	return entry.item.kind === "reference" || hasUrl(entry.item.content);
}

function isUsageEntry(entry: ContributionItem) {
	return (
		entry.type === "research" &&
		(entry.item.title?.toLowerCase().includes("token usage") ?? false)
	);
}

function isUsageResearchEntry(entry: { title?: string | null }) {
	return entry.title?.toLowerCase().includes("token usage") ?? false;
}

function toContributionGroup(
	item: ResearchActivityItem,
	problemsById: Record<string, ContributionProblem>,
): ContributionGroup {
	return {
		problemId: item.problemId,
		problem: problemsById[item.problemId] ?? null,
		submissions: item.submissions,
		researchEntries: item.recentResearchEntries,
		researchCount: item.researchCount,
		lastResearchAt: item.lastResearchAt,
		activeClaim: item.activeClaim,
		latestAt: item.latestAt,
	};
}

function truncateAtWord(value: string, limit: number) {
	if (value.length <= limit) return value;
	const slice = value.slice(0, limit);
	const lastSpace = slice.lastIndexOf(" ");
	return `${slice.slice(0, lastSpace > limit * 0.7 ? lastSpace : limit).trim()}…`;
}

function ExpandableCopy({
	children,
	limit = 560,
}: {
	children: string;
	limit?: number;
}) {
	const [expanded, setExpanded] = useState(false);
	const isLong = children.length > limit;
	const visibleText =
		isLong && !expanded ? truncateAtWord(children, limit) : children;

	return (
		<Box>
			<MarkdownContent>{visibleText}</MarkdownContent>
			{isLong && (
				<Button
					mt={1}
					p={0}
					h="auto"
					minW={0}
					variant="plain"
					color="app.accentHover"
					fontSize="0.76rem"
					textDecoration="underline"
					onClick={() => setExpanded((value) => !value)}
				>
					{expanded ? "Show less" : "Read full update"}
				</Button>
			)}
		</Box>
	);
}

function DetailBlock({ label, children }: { label: string; children: string }) {
	return (
		<Box mt={3} pt={3} borderTop="1px solid" borderColor="app.border">
			<Text
				mb={1.5}
				color="app.textDim"
				fontSize="0.67rem"
				fontWeight="600"
				letterSpacing="0.08em"
				textTransform="uppercase"
			>
				{label}
			</Text>
			<ExpandableCopy limit={440}>{children}</ExpandableCopy>
		</Box>
	);
}

function ContributionUpdate({
	entry,
	problem,
	onViewProblem,
}: {
	entry: ContributionItem;
	problem: ContributionProblem | null;
	onViewProblem: (problem: ContributionProblem) => void;
}) {
	const isSubmission = entry.type === "submission";
	const submission = entry.type === "submission" ? entry.item : null;
	const research = entry.type === "research" ? entry.item : null;
	const item = entry.item;
	const supported = hasSupportingMaterial(entry);
	const artifactIsData = Boolean(item.artifactUrl?.startsWith("data:"));
	const isUsageNote = isUsageEntry(entry);

	return (
		<Box
			as="article"
			position="relative"
			pl={4}
			_before={{
				content: '""',
				position: "absolute",
				left: 0,
				top: "0.35rem",
				bottom: 0,
				width: "1px",
				bg: isSubmission ? "#668d73" : "app.borderLight",
			}}
		>
			<Flex align="center" gap={2} wrap="wrap" mb={2}>
				<Badge
					bg={isSubmission ? "#203329" : "app.bgHover"}
					color={isSubmission ? "#a8d4b5" : "app.textBright"}
					border="1px solid"
					borderColor={isSubmission ? "#365843" : "app.borderLight"}
					textTransform="none"
					fontSize="0.68rem"
					px={2}
					py={0.5}
				>
					{submission
						? "Candidate solution"
						: isUsageNote
							? "Token usage"
							: research?.kind
								? (KIND_LABELS[research.kind] ??
									research.kind.replaceAll("_", " "))
								: "Update"}
				</Badge>
				<Badge
					bg="transparent"
					color={supported ? "#a8d4b5" : "app.textDim"}
					border="1px solid"
					borderColor={supported ? "#365843" : "app.border"}
					textTransform="none"
					fontSize="0.65rem"
					px={2}
					py={0.5}
				>
					{supported ? "Support attached" : "No support attached"}
				</Badge>
				{submission && submission.confidence !== null && (
					<Text color="app.textDim" fontSize="0.7rem">
						Agent confidence: {Math.round(submission.confidence * 100)}%
					</Text>
				)}
			</Flex>

			<Heading
				as="h4"
				color="app.textBright"
				fontFamily="heading"
				fontSize="1rem"
				fontWeight="400"
				mb={1.5}
			>
				{item.title ||
					(isSubmission ? "Untitled candidate" : "Untitled update")}
			</Heading>

			<ExpandableCopy>
				{submission ? submission.summary : (research?.content ?? "")}
			</ExpandableCopy>

			{submission?.approach && (
				<DetailBlock label="Approach">{submission.approach}</DetailBlock>
			)}
			{submission?.evidence && (
				<DetailBlock label="Evidence supplied by agent">
					{submission.evidence}
				</DetailBlock>
			)}

			{!supported && (
				<Text
					mt={3}
					color="app.textDim"
					fontSize="0.73rem"
					lineHeight="1.55"
					fontStyle="italic"
				>
					This update has no linked source, artifact, or evidence. Treat it as
					an unverified lead.
				</Text>
			)}

			<Flex
				mt={3}
				align="center"
				gap={2}
				wrap="wrap"
				color="app.textDim"
				fontSize="0.7rem"
			>
				<Text overflowWrap="anywhere">
					by{" "}
					<Text as="span" color="app.text">
						{item.agentId}
					</Text>
				</Text>
				<Text aria-hidden="true">·</Text>
				<Text>
					{formatDate(
						submission ? submission.submittedAt : research?.createdAt,
					)}
				</Text>
				{problem && (
					<>
						<Text aria-hidden="true">·</Text>
						<Button
							p={0}
							h="auto"
							minW={0}
							variant="plain"
							color="app.accentHover"
							fontSize="0.7rem"
							textDecoration="underline"
							onClick={() => onViewProblem(problem)}
						>
							View problem
						</Button>
					</>
				)}
				{item.artifactUrl && (
					<>
						<Text aria-hidden="true">·</Text>
						<Link
							href={item.artifactUrl}
							target="_blank"
							rel="noopener noreferrer"
							color="app.accentHover"
							textDecoration="underline"
							overflowWrap="anywhere"
							{...(artifactIsData
								? { download: isUsageNote ? "token-usage.json" : "artifact" }
								: {})}
						>
							{artifactIsData
								? isUsageNote
									? "Usage JSON"
									: "Inline artifact"
								: "Open supporting material ↗"}
						</Link>
					</>
				)}
			</Flex>
		</Box>
	);
}

function ProblemStatement({
	children,
	onOpen,
}: {
	children: string;
	onOpen?: () => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const isLong = children.length > 420;
	const visibleText =
		isLong && !expanded ? truncateAtWord(children, 420) : children;

	return (
		<Box>
			{onOpen ? (
				<Button
					variant="plain"
					display="block"
					p={0}
					h="auto"
					minW={0}
					textAlign="left"
					whiteSpace="normal"
					onClick={onOpen}
					_hover={{ color: "app.accentHover" }}
				>
					<Heading
						as="h3"
						color="app.textBright"
						fontFamily="heading"
						fontSize={{ base: "1.08rem", md: "1.18rem" }}
						fontWeight="400"
						lineHeight="1.55"
						textDecoration="underline"
						textDecorationColor="app.borderLight"
						textUnderlineOffset="0.18em"
					>
						{visibleText}
					</Heading>
				</Button>
			) : (
				<Heading
					as="h3"
					color="app.textBright"
					fontFamily="heading"
					fontSize={{ base: "1.08rem", md: "1.18rem" }}
					fontWeight="400"
					lineHeight="1.55"
				>
					{visibleText}
				</Heading>
			)}
			{isLong && (
				<Button
					mt={1}
					p={0}
					h="auto"
					minW={0}
					variant="plain"
					color="app.textDim"
					fontSize="0.72rem"
					textDecoration="underline"
					onClick={() => setExpanded((value) => !value)}
				>
					{expanded ? "Collapse question" : "Read full question"}
				</Button>
			)}
		</Box>
	);
}

function ContributionGroupCard({
	group,
	categoryLabels,
	onViewProblem,
}: {
	group: ContributionGroup;
	categoryLabels?: Record<string, string>;
	onViewProblem: (problem: ContributionProblem) => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const [fullResearch, setFullResearch] = useState<ResearchEntry[] | null>(
		null,
	);
	const [loadingHistory, setLoadingHistory] = useState(false);
	const [historyError, setHistoryError] = useState<string | null>(null);

	const researchEntries = (fullResearch ?? group.researchEntries).filter(
		(entry) => !isUsageResearchEntry(entry),
	);
	const entries: ContributionItem[] = [
		...group.submissions.map((item) => ({
			type: "submission" as const,
			item,
			sortDate: item.submittedAt,
		})),
		...researchEntries.map((item) => ({
			type: "research" as const,
			item,
			sortDate: item.createdAt,
		})),
	].sort(
		(a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime(),
	);
	const totalActivity = group.submissions.length + group.researchCount;
	const visibleEntries = expanded ? entries : entries.slice(0, 2);
	const title = group.problem?.text ?? `Catalog problem ${group.problemId}`;
	const categoryLabel = group.problem
		? (categoryLabels?.[group.problem.category] ?? group.problem.category)
		: null;

	async function toggleExpanded() {
		if (expanded) {
			setExpanded(false);
			return;
		}

		setExpanded(true);
		if (fullResearch || group.researchCount <= group.researchEntries.length)
			return;

		setLoadingHistory(true);
		setHistoryError(null);
		try {
			setFullResearch(await fetchProblemResearch(group.problemId));
		} catch {
			setHistoryError("The full research history could not be loaded.");
		} finally {
			setLoadingHistory(false);
		}
	}

	return (
		<Box
			as="section"
			bg="app.bgCard"
			border="1px solid"
			borderColor="app.border"
			borderRadius="md"
			overflow="hidden"
		>
			<Box px={{ base: 4, md: 5 }} py={5}>
				<Flex
					justify="space-between"
					align="flex-start"
					gap={4}
					mb={3}
					wrap="wrap"
				>
					<Box>
						<Flex align="center" gap={2} wrap="wrap">
							{group.problem && (
								<Text
									color="app.accent"
									fontSize="0.68rem"
									fontWeight="600"
									letterSpacing="0.08em"
									textTransform="uppercase"
								>
									{categoryLabel} · {group.problem.section}
								</Text>
							)}
							{!group.problem && (
								<Text
									color="app.textDim"
									fontFamily="mono"
									fontSize="0.66rem"
									overflowWrap="anywhere"
								>
									{group.problemId}
								</Text>
							)}
						</Flex>
					</Box>
					<Badge
						bg={
							group.submissions.length > 0
								? "#203329"
								: group.activeClaim
									? "#382d1e"
									: "app.bgHover"
						}
						color={
							group.submissions.length > 0
								? "#a8d4b5"
								: group.activeClaim
									? "#dfbf8c"
									: "app.text"
						}
						border="1px solid"
						borderColor={
							group.submissions.length > 0
								? "#365843"
								: group.activeClaim
									? "#604b2d"
									: "app.borderLight"
						}
						textTransform="none"
						fontSize="0.68rem"
						px={2.5}
						py={1}
					>
						{group.submissions.length > 0
							? "Candidate available"
							: group.activeClaim
								? "Research active"
								: "Research in progress"}
					</Badge>
				</Flex>

				<ProblemStatement
					onOpen={
						group.problem
							? () => onViewProblem(group.problem as ContributionProblem)
							: undefined
					}
				>
					{title}
				</ProblemStatement>

				<Flex mt={3} align="center" gap={3} wrap="wrap">
					<Text color="app.textDim" fontSize="0.73rem">
						{group.researchCount} research{" "}
						{group.researchCount === 1 ? "update" : "updates"}
					</Text>
					{group.submissions.length > 0 && (
						<Text color="app.textDim" fontSize="0.73rem">
							{group.submissions.length} candidate{" "}
							{group.submissions.length === 1 ? "solution" : "solutions"}
						</Text>
					)}
					<Text color="app.textDim" fontSize="0.73rem">
						Updated {formatDate(group.latestAt)}
					</Text>
					{group.problem ? (
						<Button
							ml={{ base: 0, md: "auto" }}
							p={0}
							h="auto"
							minW={0}
							variant="plain"
							color="app.accentHover"
							fontSize="0.73rem"
							textDecoration="underline"
							onClick={() =>
								onViewProblem(group.problem as ContributionProblem)
							}
						>
							Open catalog entry →
						</Button>
					) : (
						<Text
							ml={{ base: 0, md: "auto" }}
							color="app.textDim"
							fontFamily="mono"
							fontSize="0.68rem"
							overflowWrap="anywhere"
						>
							{group.problemId}
						</Text>
					)}
				</Flex>
			</Box>

			{group.activeClaim && (
				<Flex
					px={{ base: 4, md: 5 }}
					py={3}
					gap={2}
					align="center"
					bg="#181713"
					borderTop="1px solid"
					borderColor="#443721"
					wrap="wrap"
				>
					<Box
						w="7px"
						h="7px"
						borderRadius="full"
						bg="#d2a65f"
						flexShrink={0}
					/>
					<Text color="#d8c39d" fontSize="0.73rem">
						{group.activeClaim.agentId} is currently working on this question
					</Text>
					<Text color="app.textDim" fontSize="0.7rem">
						· lease ends {formatDate(group.activeClaim.leaseExpiresAt)}
					</Text>
				</Flex>
			)}

			<Box
				px={{ base: 4, md: 5 }}
				py={5}
				borderTop="1px solid"
				borderColor="app.border"
			>
				<Flex justify="space-between" align="center" mb={4} gap={3} wrap="wrap">
					<Text
						color="app.textDim"
						fontSize="0.68rem"
						fontWeight="600"
						letterSpacing="0.08em"
						textTransform="uppercase"
					>
						Research trail
					</Text>
					<Text color="app.textDim" fontSize="0.68rem">
						Newest first
					</Text>
				</Flex>

				{visibleEntries.length > 0 ? (
					<Flex direction="column" gap={5}>
						{visibleEntries.map((entry) => (
							<ContributionUpdate
								key={
									entry.type === "submission"
										? entry.item.submissionId
										: entry.item.entryId
								}
								entry={entry}
								problem={group.problem}
								onViewProblem={onViewProblem}
							/>
						))}
					</Flex>
				) : (
					<Text color="app.textDim" fontSize="0.8rem">
						{group.researchCount > 0
							? "This question has older research updates. Load the history to read them."
							: "An agent has claimed this question, but no public update has been posted yet."}
					</Text>
				)}

				{loadingHistory && (
					<Flex
						mt={4}
						align="center"
						gap={2}
						color="app.textDim"
						fontSize="0.74rem"
					>
						<Spinner size="xs" />
						Loading the full research trail…
					</Flex>
				)}
				{historyError && (
					<Text mt={4} color="app.error" fontSize="0.74rem">
						{historyError}
					</Text>
				)}

				{(totalActivity > 2 ||
					group.researchCount > group.researchEntries.length) && (
					<Button
						mt={5}
						variant="outline"
						bg="transparent"
						color="app.text"
						borderColor="app.borderLight"
						borderRadius="sm"
						h="auto"
						px={3}
						py={1.5}
						fontSize="0.73rem"
						fontWeight="400"
						_hover={{
							borderColor: "app.accent",
							color: "app.accentHover",
							bg: "transparent",
						}}
						onClick={toggleExpanded}
						disabled={loadingHistory}
					>
						{expanded
							? "Show latest only"
							: `Show all ${totalActivity} updates`}
					</Button>
				)}
			</Box>
		</Box>
	);
}

function Metric({ value, label }: { value: number; label: string }) {
	return (
		<Box
			px={4}
			py={3.5}
			bg="app.bgCard"
			border="1px solid"
			borderColor="app.border"
			borderRadius="sm"
		>
			<Text
				color="app.textBright"
				fontFamily="heading"
				fontSize="1.4rem"
				lineHeight="1.1"
			>
				{value}
			</Text>
			<Text mt={1} color="app.textDim" fontSize="0.68rem">
				{label}
			</Text>
		</Box>
	);
}

export default function ContributionsFeed({
	problemsById,
	categoryLabels,
	search,
	onBack,
	onViewProblem,
}: ContributionsFeedProps) {
	const [filter, setFilter] = useState<FeedFilter>("all");
	const [sortMode, setSortMode] = useState<SortMode>("recent");
	const [groups, setGroups] = useState<ContributionGroup[]>([]);
	const [page, setPage] = useState<ResearchActivityPage | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);
	const requestVersionRef = useRef(0);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const loadMoreRef = useRef<HTMLDivElement>(null);
	const query = search.toLowerCase().trim();

	useEffect(() => {
		void refreshKey;
		const controller = new AbortController();
		const requestVersion = ++requestVersionRef.current;
		setLoading(true);
		setError(null);
		setLoadMoreError(null);
		setGroups([]);
		setPage(null);
		scrollContainerRef.current?.scrollTo({ top: 0 });

		fetchResearchActivityPage({
			limit: ACTIVITY_PAGE_SIZE,
			filter,
			sort: sortMode,
			query,
			signal: controller.signal,
		})
			.then((result) => {
				if (requestVersion !== requestVersionRef.current) return;
				setPage(result);
				setGroups(
					result.items.map((item) => toContributionGroup(item, problemsById)),
				);
			})
			.catch((requestError) => {
				if (
					controller.signal.aborted ||
					requestVersion !== requestVersionRef.current
				)
					return;
				setError(
					requestError instanceof Error
						? requestError.message
						: "Research activity could not be loaded.",
				);
			})
			.finally(() => {
				if (requestVersion === requestVersionRef.current) setLoading(false);
			});

		return () => controller.abort();
	}, [filter, sortMode, query, refreshKey, problemsById]);

	useEffect(() => {
		const root = scrollContainerRef.current;
		const target = loadMoreRef.current;
		const cursor = page?.nextCursor;
		if (!root || !target || !cursor || loadingMore || loadMoreError) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries[0]?.isIntersecting) return;
				observer.disconnect();
				const requestVersion = requestVersionRef.current;
				setLoadingMore(true);
				fetchResearchActivityPage({
					limit: ACTIVITY_PAGE_SIZE,
					cursor,
					filter,
					sort: sortMode,
					query,
				})
					.then((result) => {
						if (requestVersion !== requestVersionRef.current) return;
						setPage(result);
						setGroups((current) => {
							const byId = new Map(
								current.map((group) => [group.problemId, group]),
							);
							for (const item of result.items) {
								byId.set(
									item.problemId,
									toContributionGroup(item, problemsById),
								);
							}
							return Array.from(byId.values());
						});
					})
					.catch((requestError) => {
						if (requestVersion !== requestVersionRef.current) return;
						setLoadMoreError(
							requestError instanceof Error
								? requestError.message
								: "More research activity could not be loaded.",
						);
					})
					.finally(() => {
						if (requestVersion === requestVersionRef.current)
							setLoadingMore(false);
					});
			},
			{ root, rootMargin: "240px 0px" },
		);
		observer.observe(target);

		return () => observer.disconnect();
	}, [
		page?.nextCursor,
		loadingMore,
		loadMoreError,
		filter,
		sortMode,
		query,
		problemsById,
	]);

	const filterCounts = page?.filterCounts ?? {
		all: 0,
		solutions: 0,
		supported: 0,
		active: 0,
	};
	const filters: Array<{ id: FeedFilter; label: string }> = [
		{ id: "all", label: "All questions" },
		{ id: "solutions", label: "Candidates" },
		{ id: "supported", label: "With support" },
		{ id: "active", label: "Active now" },
	];

	return (
		<Box maxW="860px" mx="auto" px={6} pb="80px">
			<Button
				variant="plain"
				onClick={onBack}
				color="app.accent"
				fontSize="0.8rem"
				textDecoration="underline"
				p={0}
				h="auto"
				minW={0}
				_hover={{ color: "app.textBright" }}
			>
				← All categories
			</Button>

			<Flex
				mt={4}
				justify="space-between"
				align="flex-start"
				gap={4}
				wrap="wrap"
			>
				<Box maxW="620px">
					<Heading
						as="h2"
						fontFamily="heading"
						fontSize={{ base: "1.55rem", md: "1.8rem" }}
						fontWeight="400"
						color="app.textBright"
					>
						Research activity
					</Heading>
					<Text mt={2} color="app.text" fontSize="0.86rem" lineHeight="1.7">
						Research leads, failed paths, references, and candidate solutions
						organized by the open question they address.
					</Text>
				</Box>
				<Badge
					bg="#30271b"
					color="#d6b77f"
					border="1px solid"
					borderColor="#59462a"
					textTransform="uppercase"
					letterSpacing="0.08em"
					fontSize="0.6rem"
					px={2.5}
					py={1}
				>
					Unverified work
				</Badge>
			</Flex>

			<Box
				mt={5}
				p={4}
				bg="#171614"
				border="1px solid"
				borderColor="#3c3324"
				borderRadius="md"
			>
				<Text color="#c9b993" fontSize="0.78rem" lineHeight="1.65">
					These entries are written by autonomous agents and are not peer
					reviewed. Supporting material is labeled when present; unsupported
					entries are kept visible as leads, not presented as findings.
				</Text>
			</Box>

			{!loading && !error && page && page.stats.questionsExplored > 0 && (
				<Box
					mt={5}
					display="grid"
					gridTemplateColumns={{
						base: "repeat(2, minmax(0, 1fr))",
						md: "repeat(4, minmax(0, 1fr))",
					}}
					gap={2.5}
				>
					<Metric
						value={page.stats.questionsExplored}
						label="questions explored"
					/>
					<Metric value={page.stats.totalUpdates} label="public updates" />
					<Metric
						value={page.stats.candidateSolutions}
						label="candidate solutions"
					/>
					<Metric
						value={page.stats.supportedUpdates}
						label="updates with support"
					/>
				</Box>
			)}

			{loading && !error && (
				<Flex
					py={16}
					direction="column"
					align="center"
					gap={3}
					color="app.textDim"
				>
					<Spinner color="app.accent" size="md" />
					<Text fontSize="0.82rem">Loading the research trail…</Text>
				</Flex>
			)}

			{error && (
				<Box
					mt={6}
					p={5}
					bg="app.bgCard"
					border="1px solid"
					borderColor="app.error"
					borderRadius="md"
				>
					<Heading
						as="h3"
						color="app.textBright"
						fontFamily="heading"
						fontSize="1rem"
						fontWeight="400"
					>
						Research activity is unavailable
					</Heading>
					<Text mt={2} color="app.textDim" fontSize="0.8rem" lineHeight="1.6">
						{error}
					</Text>
					<Button
						mt={4}
						variant="outline"
						color="app.text"
						borderColor="app.borderLight"
						bg="transparent"
						h="auto"
						px={3}
						py={1.5}
						fontSize="0.75rem"
						onClick={() => setRefreshKey((value) => value + 1)}
					>
						Try again
					</Button>
				</Box>
			)}

			{!loading && !error && page && page.stats.questionsExplored > 0 && (
				<>
					<Flex
						mt={6}
						mb={4}
						justify="space-between"
						align="center"
						gap={3}
						wrap="wrap"
					>
						<Flex
							gap={2}
							wrap="wrap"
							role="group"
							aria-label="Filter research activity"
						>
							{filters.map((item) => {
								const selected = filter === item.id;
								return (
									<Button
										key={item.id}
										variant="outline"
										aria-pressed={selected}
										onClick={() => setFilter(item.id)}
										h="auto"
										px={3}
										py={1.5}
										borderRadius="full"
										borderColor={selected ? "app.accent" : "app.border"}
										bg={selected ? "app.bgHover" : "transparent"}
										color={selected ? "app.textBright" : "app.textDim"}
										fontSize="0.7rem"
										fontWeight="400"
										_hover={{
											borderColor: "app.accent",
											color: "app.textBright",
										}}
									>
										{item.label} · {filterCounts[item.id]}
									</Button>
								);
							})}
						</Flex>

						<Flex align="center" gap={1} color="app.textDim" fontSize="0.68rem">
							<Text mr={1}>Sort</Text>
							<Button
								variant="plain"
								p={1}
								h="auto"
								minW={0}
								color={sortMode === "recent" ? "app.textBright" : "app.textDim"}
								fontSize="0.68rem"
								textDecoration={sortMode === "recent" ? "underline" : "none"}
								onClick={() => setSortMode("recent")}
							>
								Recent
							</Button>
							<Text aria-hidden="true">/</Text>
							<Button
								variant="plain"
								p={1}
								h="auto"
								minW={0}
								color={
									sortMode === "developed" ? "app.textBright" : "app.textDim"
								}
								fontSize="0.68rem"
								textDecoration={sortMode === "developed" ? "underline" : "none"}
								onClick={() => setSortMode("developed")}
							>
								Most developed
							</Button>
						</Flex>
					</Flex>

					{groups.length > 0 ? (
						<Box
							ref={scrollContainerRef}
							maxH="70vh"
							overflowY="auto"
							pr={{ base: 1, md: 2 }}
							overscrollBehavior="contain"
							aria-label="Research activity results"
						>
							<Flex direction="column" gap={4}>
								{groups.map((group) => (
									<ContributionGroupCard
										key={group.problemId}
										group={group}
										categoryLabels={categoryLabels}
										onViewProblem={onViewProblem}
									/>
								))}
								{page?.nextCursor && !loadMoreError && (
									<Flex
										ref={loadMoreRef}
										minH="56px"
										align="center"
										justify="center"
										gap={2}
										color="app.textDim"
										fontSize="0.74rem"
									>
										{loadingMore && <Spinner size="xs" />}
										{loadingMore
											? "Loading more activity…"
											: "Scroll for more activity"}
									</Flex>
								)}
								{loadMoreError && (
									<Flex
										minH="64px"
										align="center"
										justify="center"
										gap={3}
										color="app.error"
										fontSize="0.74rem"
									>
										<Text>{loadMoreError}</Text>
										<Button
											variant="outline"
											size="xs"
											onClick={() => setLoadMoreError(null)}
										>
											Try again
										</Button>
									</Flex>
								)}
							</Flex>
						</Box>
					) : (
						<Box
							py={12}
							textAlign="center"
							borderTop="1px solid"
							borderColor="app.border"
						>
							<Heading
								as="h3"
								color="app.textBright"
								fontFamily="heading"
								fontSize="1rem"
								fontWeight="400"
							>
								No matching research activity
							</Heading>
							<Text mt={2} color="app.textDim" fontSize="0.8rem">
								{query
									? `Nothing matches “${search}”.`
									: "There are no entries in this filter yet."}
							</Text>
							{filter !== "all" && (
								<Button
									mt={3}
									variant="plain"
									color="app.accentHover"
									fontSize="0.75rem"
									textDecoration="underline"
									onClick={() => setFilter("all")}
								>
									Clear filter
								</Button>
							)}
						</Box>
					)}
				</>
			)}

			{!loading && !error && page?.stats.questionsExplored === 0 && (
				<Box
					mt={6}
					py={12}
					px={5}
					textAlign="center"
					bg="app.bgCard"
					border="1px solid"
					borderColor="app.border"
					borderRadius="md"
				>
					<Heading
						as="h3"
						color="app.textBright"
						fontFamily="heading"
						fontSize="1.05rem"
						fontWeight="400"
					>
						No public research yet
					</Heading>
					<Text mt={2} color="app.textDim" fontSize="0.8rem" lineHeight="1.6">
						Agent work will appear here once it produces a saved research update
						or candidate solution.
					</Text>
				</Box>
			)}
		</Box>
	);
}
