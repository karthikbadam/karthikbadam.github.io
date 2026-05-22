import { Box, Flex, Heading, Link, Text, VStack } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuArrowLeft, LuGithub } from "react-icons/lu";
import { useParams } from "react-router-dom";
import { PanelContainer } from "../../../../components/PanelContainer";
import { useAtomValue, useSetAtom } from "jotai";
import {
  feedEntriesAtom,
  loadLiveSessionAtom,
  loadSavedSessionAtom,
  metaAtom,
  schemaSummaryAtom,
  stateAtom,
} from "../atoms";
import { FEATURED_SESSIONS, GITHUB_REPO_URL, THREAD_GAP } from "../config";
import { MarkdownContent } from "./MarkdownContent";
import { CommandBar } from "./CommandBar";
import {
  EventFeed,
  FeedDownloadButton,
  FeedMetrics,
  SessionMetricsPanel,
} from "./EventFeed";
import { FIXED_THREAD_W, FlowViz, ReplayButton } from "./FlowViz";
import { LandingScreen } from "./LandingScreen";

const LEFT_PANEL_PADDING = 32;
const MIN_LEFT_W = 240;

interface PanelHeaderProps {
  title: string;
  hint?: string;
  onClick?: () => void;
  action?: React.ReactNode;
}

function PanelHeader({ title, hint, onClick, action }: PanelHeaderProps) {
  const clickable = !!onClick;
  return (
    <Flex
      align="center"
      justify="space-between"
      px={2}
      pt={2}
      mb={2}
      gap={2}
      role={clickable ? "button" : undefined}
      cursor={clickable ? "pointer" : "default"}
      onClick={onClick}
    >
      <Text
        as="div"
        fontSize="xs"
        fontWeight="semibold"
        color="accent"
        textAlign="left"
        minW={0}
      >
        {title}
        {hint && (
          <Text as="span" fontWeight="normal" color="fg.muted" ml={1}>
            • {hint}
          </Text>
        )}
      </Text>
      {action && (
        <Box
          flexShrink={0}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {action}
        </Box>
      )}
    </Flex>
  );
}

function SchemaSummaryPanel({ markdown }: { markdown: string }) {
  const [open, setOpen] = useState(false);
  return (
    <PanelContainer
      p={0}
      overflow="hidden"
      display="flex"
      flexDirection="column"
    >
      <PanelHeader
        title="Dataset Summary"
        hint={`click to ${open ? "collapse" : "expand"}`}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <Box px={2} pb={2} maxH="260px" overflowY="auto">
          <MarkdownContent content={markdown} />
        </Box>
      )}
    </PanelContainer>
  );
}

export function Dashboard() {
  const state = useAtomValue(stateAtom);
  const meta = useAtomValue(metaAtom);
  const schemaMarkdown = useAtomValue(schemaSummaryAtom);
  const feedEntries = useAtomValue(feedEntriesAtom);
  const loadLiveSession = useSetAtom(loadLiveSessionAtom);
  const loadSavedSession = useSetAtom(loadSavedSessionAtom);
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>();
  const didAutoLoad = useRef(false);

  const threadCount = useMemo(() => {
    const seen = new Set<string>();
    for (const e of feedEntries) {
      if (e.event_type === "thread_start" && e.thread_id) seen.add(e.thread_id);
    }
    return seen.size;
  }, [feedEntries]);

  const leftWidth = useMemo(() => {
    const n = Math.max(threadCount, 1);
    const natural =
      n * FIXED_THREAD_W + (n - 1) * THREAD_GAP + LEFT_PANEL_PADDING;
    return Math.max(MIN_LEFT_W, natural);
  }, [threadCount]);

  useEffect(() => {
    if (didAutoLoad.current) return;
    if (urlSessionId && !meta && state.status === "idle") {
      didAutoLoad.current = true;
      const isFeatured = FEATURED_SESSIONS.some((s) => s.id === urlSessionId);
      if (isFeatured) {
        loadSavedSession(urlSessionId);
      } else {
        loadLiveSession(urlSessionId);
      }
    }
  }, [urlSessionId, meta, state.status, loadLiveSession, loadSavedSession]);

  if (state.status === "loading") {
    return (
      <Box
        h="100%"
        display="flex"
        alignItems="center"
        justifyContent="center"
        bg="bg.muted"
      >
        <Text fontSize="xs" color="fg.muted" fontFamily="mono">
          Loading session…
        </Text>
      </Box>
    );
  }

  if (!meta) {
    return <LandingScreen />;
  }

  const datasetFileName =
    meta.dataset_path?.split("/").pop()?.trim() ?? "Dataset";
  const isLive = state.mode === "live";

  return (
    <Box
      h={{ base: "auto", md: "100%" }}
      overflow={{ base: "auto", md: "hidden" }}
      display="flex"
      flexDirection="column"
      bg="bg.muted"
      pb={2}
    >
      {/* Header */}
      <Flex px={4} py={4} gap={4} maxW="100ch" mx="auto" align="flex-start">
        <Box
          as="button"
          onClick={() => {
            window.location.hash = "#/latent-insights";
            window.location.reload();
          }}
          display="flex"
          alignItems="center"
          gap={1}
          color="fg.muted"
          fontSize="xs"
          fontFamily="mono"
          _hover={{ color: "fg" }}
          cursor="pointer"
          flexShrink={0}
        >
          <LuArrowLeft size={11} />
          back
        </Box>
        <VStack gap={0} align="flex-start" flex={1} minW={0}>
          <Flex align="baseline" gap={2} minW={0} maxW="100%">
            <Heading
              as="h1"
              size="md"
              color="accent"
              fontFamily="mono"
              fontWeight="600"
              lineHeight="1.1"
              flexShrink={0}
            >
              Latent Insights
            </Heading>
            <Text
              as="span"
              fontSize="sm"
              fontFamily="mono"
              color="fg.muted"
              lineHeight="1.1"
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
              minW={0}
              title={meta.dataset_path ?? datasetFileName}
            >
              · {datasetFileName} ({threadCount} threads)
            </Text>
          </Flex>
          <Text
            fontSize="xs"
            color="fg.muted"
            fontFamily="mono"
            minW={0}
            mt={2}
          >
            Parallel-agent data analysis with live thread orchestration,
            step-level traces, and inline observation feeds.{" "}
            <Link
              href={GITHUB_REPO_URL}
              variant="underline"
              target="_blank"
              rel="noopener noreferrer"
              display="inline-flex"
              gap={1}
              color="fg.muted"
              fontSize="xs"
              fontFamily="mono"
              _hover={{ color: "fg", textDecoration: "none" }}
            >
              <LuGithub size={12} />
              source
            </Link>
          </Text>
        </VStack>
      </Flex>

      {/* Two-column layout */}
      <Box
        flex={1}
        px={4}
        pb={2}
        overflow={{ base: "auto", md: "hidden" }}
        display="flex"
        flexDirection={{ base: "column", md: "row" }}
        gap={4}
        minH={0}
      >
        <Flex
          flexShrink={0}
          w={{ base: "100%", md: `${leftWidth}px` }}
          maxW={{ base: "100%", md: "calc(50vw - 24px)" }}
          minW={0}
          minH={{ base: "50vh", md: "100%" }}
          h={{ md: "100%" }}
          direction="column"
          gap={2}
        >
          <PanelContainer
            p={0}
            overflow="hidden"
            display="flex"
            flexDirection="column"
            flex={1}
          >
            <PanelHeader
              title="Agent Flow"
              hint="click a node to inspect"
              action={<ReplayButton />}
            />
            <Box flex={1} minH={0} overflow="hidden">
              <FlowViz />
            </Box>
            <SessionMetricsPanel />
          </PanelContainer>

          {/* Command bar below graph -- live sessions only */}
          {isLive && (
            <CommandBar
              sessionId={meta.id}
              selectedThreadId={state.selectedNode?.threadId}
            />
          )}
        </Flex>

        <Flex
          flex={1}
          minW={0}
          minH={{ base: "50vh", md: "100%" }}
          h={{ md: "100%" }}
          direction="column"
          gap={2}
          data-feed-panel
        >
          {/* Dataset summary as its own panel (only when available) */}
          {schemaMarkdown && (
            <Box flexShrink={0}>
              <SchemaSummaryPanel markdown={schemaMarkdown} />
            </Box>
          )}

          {/* Feed panel */}
          <PanelContainer
            p={0}
            overflow="hidden"
            display="flex"
            flexDirection="column"
            flex={1}
            minH={0}
          >
            <PanelHeader
              title="Agent Actions"
              hint="click a row to expand"
              action={
                <Flex align="center" gap={3}>
                  <FeedMetrics />
                  <FeedDownloadButton />
                </Flex>
              }
            />
            <Box flex={1} minW={0} maxW="100%" overflow="hidden">
              <EventFeed />
            </Box>
          </PanelContainer>
        </Flex>
      </Box>
    </Box>
  );
}
