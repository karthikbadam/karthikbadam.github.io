import { Box, Flex, Heading, Input, Link, Text, Textarea, VStack } from "@chakra-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuArrowLeft, LuGithub, LuPlus, LuX } from "react-icons/lu";
import { useNavigate, useParams } from "react-router-dom";
import { Page } from "../../../components/Page";
import { PanelContainer } from "../../../components/PanelContainer";
import {
  LatentInsightsProvider,
  useLatentInsights,
} from "../../../contexts/LatentInsightsContext";
import { CommandBar } from "./components/CommandBar";
import { EventFeed } from "./components/EventFeed";
import { FlowViz } from "./components/FlowViz";
import { UploadButton } from "./components/UploadButton";
import {
  ExplorationPattern,
  FEATURED_SESSIONS,
  QuestionSource,
  SessionConfig,
} from "./types";

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

const PATTERN_OPTIONS: { value: ExplorationPattern; label: string; desc: string }[] = [
  { value: "coordinator_worker", label: "Coordinator-Worker", desc: "Standard sequential" },
  { value: "fan_out", label: "Fan Out", desc: "Parallel branches" },
  { value: "human_in_the_loop", label: "Human in the Loop", desc: "Interactive guided" },
];

const SOURCE_OPTIONS: { value: QuestionSource; label: string }[] = [
  { value: "scout", label: "Auto (scout)" },
  { value: "human", label: "Manual" },
  { value: "both", label: "Both" },
];

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; desc?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <Flex gap={2} flexWrap="wrap">
      {options.map((o) => (
        <Box
          key={o.value}
          as="button"
          type="button"
          px={2}
          py={1}
          fontSize="xs"
          fontFamily="mono"
          border="1px solid"
          borderColor={value === o.value ? "fg.muted" : "gray.600"}
          borderRadius="sm"
          color={value === o.value ? "fg" : "fg.muted"}
          cursor="pointer"
          _hover={{ borderColor: "fg.muted" }}
          transition="border-color 0.15s"
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.desc && (
            <Text as="span" color="fg.muted" ml={1} fontSize="2xs">
              {o.desc}
            </Text>
          )}
        </Box>
      ))}
    </Flex>
  );
}

function LandingScreen() {
  const { loadSavedSession, loadLiveSession, uploadDataset, state } =
    useLatentInsights();
  const navigate = useNavigate();
  const {
    sessions: localSessions,
    loading: localLoading,
    refresh,
  } = useLocalSessions();
  const isLoading = state.status === "loading" || localLoading;

  // Config state for new session
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [questionSource, setQuestionSource] = useState<QuestionSource>("scout");
  const [scoutContext, setScoutContext] = useState("");
  const [pattern, setPattern] = useState<ExplorationPattern>("coordinator_worker");
  const [seedThreads, setSeedThreads] = useState(3);
  const [fanOutSize, setFanOutSize] = useState(3);
  const [customQuestions, setCustomQuestions] = useState<string[]>([]);
  const [questionInput, setQuestionInput] = useState("");
  const [starting, setStarting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (file) setPendingFile(file);
    },
    [],
  );

  const addQuestion = useCallback(() => {
    const q = questionInput.trim();
    if (q) {
      setCustomQuestions((prev) => [...prev, q]);
      setQuestionInput("");
    }
  }, [questionInput]);

  const removeQuestion = useCallback((idx: number) => {
    setCustomQuestions((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleStart = useCallback(async () => {
    if (!pendingFile || starting) return;
    setStarting(true);
    const config: SessionConfig = {
      question_source: questionSource,
      seed_threads: seedThreads,
      pattern: {
        pattern,
        ...(pattern === "fan_out" ? { fan_out_size: fanOutSize } : {}),
        seed_threads: seedThreads,
      },
    };
    if (scoutContext.trim() && questionSource !== "human") {
      config.scout_context = scoutContext.trim();
    }
    const sessionId = await uploadDataset(pendingFile, config);
    if (sessionId) {
      refresh();
      setPendingFile(null);
      navigate(`/latent-insights/${sessionId}`, { replace: true });
      loadLiveSession(sessionId);
    }
    setStarting(false);
  }, [
    pendingFile,
    starting,
    questionSource,
    scoutContext,
    pattern,
    seedThreads,
    fanOutSize,
    uploadDataset,
    refresh,
    navigate,
    loadLiveSession,
  ]);

  return (
    <Box
      h="100%"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      bg="bg.muted"
      p={4}
      overflowY="auto"
    >
      <VStack gap={6} maxW="520px" w="100%" alignItems="flex-start">
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

        {/* Upload + source link */}
        <Flex align="center" gap={3}>
          <Box
            as="label"
            display="inline-flex"
            alignItems="center"
            gap={1}
            px={3}
            py={1}
            border="1px solid"
            borderColor="gray.600"
            borderRadius="md"
            cursor="pointer"
            fontSize="xs"
            fontFamily="mono"
            color="fg.muted"
            _hover={{ borderColor: "fg.muted" }}
            transition="border-color 0.15s"
          >
            {pendingFile ? pendingFile.name : "Select CSV"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
          </Box>
          <Link
            href="https://github.com/karthikbadam/latent-insights-service"
            target="_blank"
            rel="noopener noreferrer"
            display="flex"
            alignItems="center"
            gap={1}
            color="fg.muted"
            fontSize="xs"
            variant="underline"
            fontFamily="mono"
            _hover={{ color: "fg", textDecoration: "none" }}
          >
            <LuGithub size={13} />
            source
          </Link>
        </Flex>

        {/* Configuration panel — visible when file is selected */}
        {pendingFile && (
          <Box
            w="100%"
            border="1px solid"
            borderColor="gray.600"
            borderRadius="md"
            p={4}
          >
            <VStack gap={4} alignItems="flex-start" w="100%">
              <Text fontSize="xs" fontFamily="mono" fontWeight="bold" color="fg">
                Configure analysis for {pendingFile.name}
              </Text>

              {/* Question source */}
              <Box w="100%">
                <Text fontSize="2xs" fontFamily="mono" color="fg.muted" mb={1}>
                  Question source
                </Text>
                <ToggleGroup
                  options={SOURCE_OPTIONS}
                  value={questionSource}
                  onChange={setQuestionSource}
                />
              </Box>

              {/* Scout context */}
              {questionSource !== "human" && (
                <Box w="100%">
                  <Text fontSize="2xs" fontFamily="mono" color="fg.muted" mb={1}>
                    Guide analysis direction (optional)
                  </Text>
                  <Textarea
                    size="xs"
                    variant="outline"
                    fontFamily="mono"
                    fontSize="xs"
                    placeholder="e.g., Focus on correlations between price and fuel efficiency…"
                    value={scoutContext}
                    onChange={(e) => setScoutContext(e.target.value)}
                    rows={2}
                    resize="none"
                  />
                </Box>
              )}

              {/* Custom questions */}
              {questionSource !== "scout" && (
                <Box w="100%">
                  <Text fontSize="2xs" fontFamily="mono" color="fg.muted" mb={1}>
                    Custom questions
                  </Text>
                  {customQuestions.map((q, i) => (
                    <Flex key={i} gap={2} align="center" mb={1}>
                      <Text fontSize="xs" fontFamily="mono" flex={1}>
                        {q}
                      </Text>
                      <Box
                        as="button"
                        type="button"
                        onClick={() => removeQuestion(i)}
                        color="fg.muted"
                        _hover={{ color: "red.400" }}
                        cursor="pointer"
                        flexShrink={0}
                      >
                        <LuX size={10} />
                      </Box>
                    </Flex>
                  ))}
                  <Flex gap={2}>
                    <Input
                      flex={1}
                      size="xs"
                      variant="outline"
                      fontFamily="mono"
                      fontSize="xs"
                      placeholder="Type a question…"
                      value={questionInput}
                      onChange={(e) => setQuestionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addQuestion();
                        }
                      }}
                    />
                    <Box
                      as="button"
                      type="button"
                      display="flex"
                      alignItems="center"
                      gap={1}
                      px={2}
                      py={1}
                      fontSize="xs"
                      fontFamily="mono"
                      color="fg.muted"
                      border="1px solid"
                      borderColor="gray.600"
                      borderRadius="sm"
                      cursor="pointer"
                      _hover={{ borderColor: "fg.muted" }}
                      onClick={addQuestion}
                    >
                      <LuPlus size={10} /> Add
                    </Box>
                  </Flex>
                </Box>
              )}

              {/* Exploration pattern */}
              <Box w="100%">
                <Text fontSize="2xs" fontFamily="mono" color="fg.muted" mb={1}>
                  Exploration pattern
                </Text>
                <ToggleGroup
                  options={PATTERN_OPTIONS}
                  value={pattern}
                  onChange={setPattern}
                />
              </Box>

              {/* Pattern parameters */}
              <Flex gap={4}>
                <Box>
                  <Text fontSize="2xs" fontFamily="mono" color="fg.muted" mb={1}>
                    Seed threads
                  </Text>
                  <Input
                    size="xs"
                    variant="outline"
                    fontFamily="mono"
                    fontSize="xs"
                    type="number"
                    min={1}
                    max={10}
                    w="60px"
                    value={seedThreads}
                    onChange={(e) => setSeedThreads(Number(e.target.value) || 3)}
                  />
                </Box>
                {pattern === "fan_out" && (
                  <Box>
                    <Text fontSize="2xs" fontFamily="mono" color="fg.muted" mb={1}>
                      Fan-out size
                    </Text>
                    <Input
                      size="xs"
                      variant="outline"
                      fontFamily="mono"
                      fontSize="xs"
                      type="number"
                      min={2}
                      max={10}
                      w="60px"
                      value={fanOutSize}
                      onChange={(e) => setFanOutSize(Number(e.target.value) || 3)}
                    />
                  </Box>
                )}
              </Flex>

              {/* Start button */}
              <Box
                as="button"
                type="button"
                px={4}
                py={2}
                fontSize="xs"
                fontFamily="mono"
                fontWeight="bold"
                border="1px solid"
                borderColor="fg.muted"
                borderRadius="md"
                color="fg"
                cursor={starting ? "wait" : "pointer"}
                _hover={{ bg: "whiteAlpha.100" }}
                opacity={starting ? 0.5 : 1}
                onClick={handleStart}
              >
                {starting ? "Starting…" : "Start Analysis"}
              </Box>
            </VStack>
          </Box>
        )}

        {/* Past sessions + featured */}
        <VStack gap={2} w="100%" alignItems="flex-start">
          <Text fontSize="xs" color="fg.muted" fontFamily="mono">
            Past sessions
          </Text>
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
                  : ""}{" "}
                · {s.status}
              </Text>
            </Box>
          ))}
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
              href="https://github.com/karthikbadam/latent-insights-service"
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
        {/* Left: Flow graph (compact) */}
        <Box flex={2} minW={0} minH={{ base: "50vh", md: 0 }}>
          <PanelContainer
            p={2}
            overflow="auto"
            display="flex"
            flexDirection="column"
          >
            <Text fontSize="xs" fontWeight="medium" color="accentSubtle" mb={2}>
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
              fontWeight="medium"
              color="accentSubtle"
              mb={2}
              px={2}
              pt={2}
            >
              Feed of agent actions across threads
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

      {/* Command bar — live sessions only */}
      {state.mode === "live" && session && (
        <CommandBar
          sessionId={session.id}
          selectedThreadId={state.selectedNode?.threadId}
        />
      )}
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
