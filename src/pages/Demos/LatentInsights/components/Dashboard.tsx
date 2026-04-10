import { Box, Flex, Heading, Link, Text, VStack } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuArrowLeft, LuGithub } from "react-icons/lu";
import { useParams } from "react-router-dom";
import { PanelContainer } from "../../../../components/PanelContainer";
import { useLatentInsights } from "../../../../contexts/LatentInsightsContext";
import { FEATURED_SESSIONS, GITHUB_REPO_URL } from "../config";
import { formatSchemaSummary } from "../utils";
import { MarkdownContent } from "./MarkdownContent";
import { CommandBar } from "./CommandBar";
import { EventFeed } from "./EventFeed";
import { FlowViz } from "./FlowViz";
import { LandingScreen } from "./LandingScreen";

interface PanelHeaderProps {
  title: string;
  hint?: string;
  onClick?: () => void;
}

function PanelHeader({ title, hint, onClick }: PanelHeaderProps) {
  const clickable = !!onClick;
  return (
    <Text
      as={clickable ? "button" : "div"}
      type={clickable ? "button" : undefined}
      fontSize="xs"
      fontWeight="medium"
      color="accentSubtle"
      mb={2}
      px={2}
      pt={2}
      textAlign="left"
      cursor={clickable ? "pointer" : "default"}
      _hover={clickable ? { color: "fg" } : undefined}
      onClick={onClick}
    >
      {title}
      {hint && (
        <Text as="span" fontWeight="normal" color="fg.muted" ml={1}>
          • {hint}
        </Text>
      )}
    </Text>
  );
}

function SchemaSummaryPanel({ summary }: { summary: string }) {
  const [open, setOpen] = useState(true);
  const formatted = useMemo(() => formatSchemaSummary(summary), [summary]);
  return (
    <PanelContainer p={0} overflow="hidden" display="flex" flexDirection="column">
      <PanelHeader
        title="Dataset summary"
        hint={`click to ${open ? "collapse" : "expand"}`}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <Box px={3} pb={3} maxH="260px" overflowY="auto">
          <MarkdownContent content={formatted} />
        </Box>
      )}
    </PanelContainer>
  );
}

export function Dashboard() {
  const { state, loadLiveSession, loadSavedSession } = useLatentInsights();
  const { session } = state;
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>();
  const didAutoLoad = useRef(false);

  useEffect(() => {
    if (didAutoLoad.current) return;
    if (urlSessionId && !session && state.status === "idle") {
      didAutoLoad.current = true;
      const isFeatured = FEATURED_SESSIONS.some((s) => s.id === urlSessionId);
      if (isFeatured) {
        loadSavedSession(urlSessionId);
      } else {
        loadLiveSession(urlSessionId);
      }
    }
  }, [urlSessionId, session, state.status, loadLiveSession, loadSavedSession]);

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

  if (!session) {
    return <LandingScreen />;
  }

  const datasetFileName =
    session.dataset_path?.split("/").pop()?.trim() || "Dataset";
  const threadCountForTitle = session.threads?.length ?? 0;
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
      <Flex px={4} py={2} gap={6} maxW="100ch" mx="auto" align="flex-start">
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
          <Heading
            as="h1"
            size="md"
            color="accent"
            fontFamily="mono"
            fontWeight="600"
            lineHeight="1.1"
          >
            Latent Insights
          </Heading>
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
        {/* Left: Flow graph + command bar */}
        <Flex
          flex={3}
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
              title={`Dataset ${datasetFileName} (${threadCountForTitle} threads)`}
              hint="click a node to inspect"
            />
            <Box flex={1} minH={0} overflow="hidden">
              <FlowViz />
            </Box>
          </PanelContainer>

          {/* Command bar below graph -- live sessions only */}
          {isLive && (
            <CommandBar
              sessionId={session.id}
              selectedThreadId={state.selectedNode?.threadId}
            />
          )}
        </Flex>

        {/* Right: Schema summary (separate panel) + Feed */}
        <Flex
          flex={3}
          minW={0}
          minH={{ base: "50vh", md: "100%" }}
          h={{ md: "100%" }}
          direction="column"
          gap={2}
          data-feed-panel
        >
          {/* Dataset summary as its own panel (only when available) */}
          {session.schema_summary && (
            <Box flexShrink={0}>
              <SchemaSummaryPanel summary={session.schema_summary} />
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
              title="Feed of agent actions across threads"
              hint="click a row to expand"
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
