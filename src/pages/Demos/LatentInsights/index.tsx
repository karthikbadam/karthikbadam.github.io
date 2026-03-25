import {
  Box,
  Flex,
  Heading,
  Link,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuArrowLeft, LuGithub, LuRefreshCw } from "react-icons/lu";
import { useNavigate, useParams } from "react-router-dom";
import { Page } from "../../../components/Page";
import { PanelContainer } from "../../../components/PanelContainer";
import {
  LatentInsightsProvider,
  useLatentInsights,
} from "../../../contexts/LatentInsightsContext";
import { EventFeed } from "./components/EventFeed";
import { FlowViz } from "./components/FlowViz";
import { UploadButton } from "./components/UploadButton";
import { FEATURED_SESSIONS } from "./types";

const API_BASE = import.meta.env.DEV
  ? "http://localhost:8000/api"
  : "https://latent-insights-service-production.up.railway.app/api";

interface LocalSession {
  id: string;
  dataset_path?: string;
  thread_count: number;
  created_at: string;
  status: string;
}

function useLocalSessions() {
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sessions`);
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.sessions ?? []);
      setSessions(
        list.map((s: Record<string, unknown>) => ({
          id: s.id as string,
          dataset_path: s.dataset_path as string,
          thread_count:
            (s.thread_count as number) ??
            (s.num_threads as number) ??
            (Array.isArray(s.threads) ? s.threads.length : 0),
          created_at: s.created_at as string,
          status: (s.status as string) || "running",
        })),
      );
    } catch {
      // server not reachable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sessions, loading, refresh };
}

function LandingScreen() {
  const { loadSavedSession, loadLiveSession, state } = useLatentInsights();
  const navigate = useNavigate();
  const isLoading = state.status === "loading";
  const {
    sessions: localSessions,
    loading: localLoading,
    refresh,
  } = useLocalSessions();

  const openLive = useCallback(
    (id: string) => {
      if (isLoading) return;
      navigate(`/latent-insights/${id}`, { replace: true });
      loadLiveSession(id);
    },
    [isLoading, navigate, loadLiveSession],
  );

  const openSaved = useCallback(
    (id: string) => {
      if (isLoading) return;
      navigate(`/latent-insights/${id}`, { replace: true });
      loadSavedSession(id);
    },
    [isLoading, navigate, loadSavedSession],
  );

  return (
    <Box
      h="100%"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      bg="bg.muted"
      p={4}
    >
      <VStack gap={6} maxW="480px" w="100%" alignItems="flex-start">
        <VStack gap={1} alignItems="flex-start">
          <Heading
            as="h1"
            size="lg"
            color="accent"
            fontFamily="mono"
            fontWeight="600"
          >
            Latent Insights
          </Heading>
          <Text fontSize="xs" color="fg.muted" fontFamily="mono">
            Parallel-agent data analysis modeling a sensemaking process. Upload
            a dataset or explore a saved session.
          </Text>
        </VStack>

        <Flex align="center" gap={3}>
          <UploadButton onUploaded={refresh} />
          <Link
            href="https://github.com/karthikbadam/latent-insights-service"
            target="_blank"
            rel="noopener noreferrer"
            display="flex"
            alignItems="center"
            gap={1}
            color="fg.muted"
            fontSize="xs"
            fontFamily="mono"
            _hover={{ color: "fg", textDecoration: "none" }}
          >
            <LuGithub size={13} />
            source
          </Link>
        </Flex>

        {localSessions.length > 0 && (
          <VStack gap={2} w="100%" alignItems="flex-start">
            <Flex align="center" gap={2}>
              <Text fontSize="xs" color="fg.muted" fontFamily="mono">
                History
              </Text>
              <Box
                as="button"
                onClick={refresh}
                color="fg.muted"
                _hover={{ color: "fg" }}
                cursor="pointer"
                display="flex"
                alignItems="center"
              >
                {localLoading ? (
                  <Spinner size="xs" />
                ) : (
                  <LuRefreshCw size={10} />
                )}
              </Box>
            </Flex>
            {localSessions.map((s) => (
              <Box
                key={s.id}
                as="button"
                w="100%"
                p={3}
                border="1px solid"
                borderColor="gray.600"
                borderRadius="md"
                textAlign="left"
                cursor={isLoading ? "wait" : "pointer"}
                _hover={{ borderColor: "fg.muted" }}
                transition="border-color 0.15s"
                onClick={() => openLive(s.id)}
                opacity={isLoading ? 0.5 : 1}
              >
                <Text fontSize="xs" fontFamily="mono" fontWeight="bold">
                  {s.dataset_path?.split("/").pop() ?? s.id.slice(0, 12)}
                </Text>
                <Text fontSize="xs" fontFamily="mono" color="fg.muted">
                  {s.id.slice(0, 12)}
                  {s.thread_count > 0
                    ? ` · ${s.thread_count} threads`
                    : ""} · {s.status}
                </Text>
              </Box>
            ))}
          </VStack>
        )}

        <VStack gap={2} w="100%" alignItems="flex-start">
          <Text fontSize="xs" color="fg.muted" fontFamily="mono">
            Saved sessions
          </Text>
          {FEATURED_SESSIONS.map((s) => (
            <Box
              key={s.id}
              as="button"
              w="100%"
              p={3}
              border="1px solid"
              borderColor="gray.600"
              borderRadius="md"
              textAlign="left"
              cursor={isLoading ? "wait" : "pointer"}
              _hover={{ borderColor: "fg.muted" }}
              transition="border-color 0.15s"
              onClick={() => openSaved(s.id)}
              opacity={isLoading ? 0.5 : 1}
            >
              <Text fontSize="xs" fontFamily="mono" fontWeight="bold">
                {s.dataset}
              </Text>
              <Text fontSize="xs" fontFamily="mono" color="fg.muted">
                {s.description}
              </Text>
            </Box>
          ))}
        </VStack>

        {state.status === "error" && (
          <Text fontSize="xs" color="red.500" fontFamily="mono">
            {state.error}
          </Text>
        )}
      </VStack>
    </Box>
  );
}

function DashboardContent() {
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
      <Flex px={4} py={2} gap={4} maxW="100ch" mx="auto" align="flex-start">
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
              href="https://github.com/karthikbadam/latent-insights-service"
              target="_blank"
              rel="noopener noreferrer"
              display="inline-flex"
              alignItems="center"
              gap={1}
              border="1px solid"
              borderColor="gray.focusRing"
              borderRadius="sm"
              px={2}
              as="span"
              ml={2}
              whiteSpace="nowrap"
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
        {/* Left: Flow graph (compact) */}
        <Box flex={2} minW={0} minH={{ base: "50vh", md: 0 }}>
          <PanelContainer
            p={2}
            overflow="auto"
            display="flex"
            flexDirection="column"
          >
            <Text
              fontSize="xs"
              fontWeight="semibold"
              color="accentSubtle"
              mb={1}
              px={1}
            >
              Dataset {`${datasetFileName} (${threadCountForTitle} threads)`}
              <Text as="span" fontWeight="normal" color="fg.muted" ml={1}>
                {"• "}click a node to inspect
              </Text>
            </Text>
            <Box flex={1} overflow="auto">
              <FlowViz />
            </Box>
          </PanelContainer>
        </Box>

        {/* Right: Feed + Detail */}
        <Box flex={3} minW={0} minH={{ base: "50vh", md: 0 }} data-feed-panel>
          <PanelContainer
            p={0}
            overflow="hidden"
            display="flex"
            flexDirection="column"
          >
            <Text
              fontSize="xs"
              fontWeight="semibold"
              color="accentSubtle"
              mb={0}
              px={3}
              pt={2}
            >
              Feed of Observations
              <Text as="span" fontWeight="normal" color="fg.muted" ml={1}>
                {"• "}click a row to expand
              </Text>
            </Text>
            <Box flex={1} minW={0} maxW="100%" overflow="hidden">
              <EventFeed />
            </Box>
          </PanelContainer>
        </Box>
      </Box>
    </Box>
  );
}

export function LatentInsights() {
  return (
    <Page>
      <LatentInsightsProvider>
        <DashboardContent />
      </LatentInsightsProvider>
    </Page>
  );
}
