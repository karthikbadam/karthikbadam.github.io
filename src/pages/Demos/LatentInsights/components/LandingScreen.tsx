import { Box, Flex, Heading, Input, Link, Text, Textarea, VStack } from "@chakra-ui/react";
import { useCallback, useRef, useState } from "react";
import { LuGithub, LuPlus, LuX } from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import { useLatentInsights } from "../../../../contexts/LatentInsightsContext";
import { useLocalSessions } from "../hooks/useLocalSessions";
import {
  QuestionSource,
  SessionConfig,
} from "../types";
import {
  FEATURED_SESSIONS,
  GITHUB_REPO_URL,
  SESSION_ID_PREVIEW_LENGTH,
  SOURCE_OPTIONS,
} from "../config";

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; desc?: string; description?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <Flex gap={2} flexWrap="wrap">
      {options.map((o) => (
        <Box
          key={o.value}
          as="button"
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
          {(o.desc ?? o.description) && (
            <Text as="span" color="fg.muted" ml={1} fontSize="2xs">
              {o.desc ?? o.description}
            </Text>
          )}
        </Box>
      ))}
    </Flex>
  );
}

export function LandingScreen() {
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
  const [seedThreads, setSeedThreads] = useState(3);
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
    };
    if (scoutContext.trim() && questionSource !== "human") {
      config.scout_context = scoutContext.trim();
    }
    if (questionSource !== "scout" && customQuestions.length > 0) {
      config.initial_questions = customQuestions;
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
    seedThreads,
    customQuestions,
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
      justifyContent={pendingFile ? "flex-start" : "center"}
      bg="bg.muted"
      p={4}
      overflowY="auto"
    >
      <Flex
        maxW={pendingFile ? "820px" : "480px"}
        w="100%"
        gap={8}
        direction={{ base: "column", md: pendingFile ? "row" : "column" }}
        align="flex-start"
        transition="max-width 0.2s"
      >
        {/* Left column: title, upload, sessions */}
        <VStack gap={6} flex={pendingFile ? 1 : undefined} w={pendingFile ? undefined : "100%"} minW={0} alignItems="flex-start">
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
              Run parallel threads of agents to gather insights and answer
              specific questions from the dataset.
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
              borderColor={pendingFile ? "fg.muted" : "gray.600"}
              borderRadius="md"
              cursor="pointer"
              fontSize="xs"
              fontFamily="mono"
              color={pendingFile ? "fg" : "fg.muted"}
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
              href={GITHUB_REPO_URL}
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

          {/* Live sessions */}
          {localSessions.length > 0 && (
            <VStack gap={2} w="100%" alignItems="flex-start">
              <Text fontSize="xs" color="fg.muted" fontFamily="mono">
                Live sessions
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
                    {s.dataset_path?.split("/").pop() ?? s.id.slice(0, SESSION_ID_PREVIEW_LENGTH)}
                  </Text>
                  <Text fontSize="xs" fontFamily="mono" color="fg.muted">
                    {s.id.slice(0, SESSION_ID_PREVIEW_LENGTH)}
                    {s.thread_count > 0
                      ? ` · ${s.thread_count} threads`
                      : ""}{" "}
                    · {s.status}
                  </Text>
                </Box>
              ))}
            </VStack>
          )}

          {/* Saved sessions */}
          <VStack gap={2} w="100%" alignItems="flex-start">
            <Text fontSize="xs" color="fg.muted" fontFamily="mono">
              Demos
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

        {/* Right column: config panel (only when file selected) */}
        {pendingFile && (
          <Box
            flex={1}
            minW={0}
            border="1px solid"
            borderColor="gray.600"
            borderRadius="md"
            p={4}
            position={{ base: "static", md: "sticky" }}
            top={{ md: 4 }}
          >
            <VStack gap={4} alignItems="flex-start" w="100%">
              <Flex justify="space-between" align="center" w="100%">
                <Text fontSize="xs" fontFamily="mono" fontWeight="bold" color="fg">
                  Configure analysis
                </Text>
                <Box
                  as="button"
                  onClick={() => setPendingFile(null)}
                  color="fg.muted"
                  _hover={{ color: "fg" }}
                  cursor="pointer"
                >
                  <LuX size={12} />
                </Box>
              </Flex>

              <Text fontSize="2xs" fontFamily="mono" color="fg.muted">
                {pendingFile.name}
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

              {/* Seed threads */}
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
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setSeedThreads(Number.isFinite(n) && n > 0 ? n : 3);
                  }}
                />
              </Box>

              {/* Start button */}
              <Box
                as="button"
                w="100%"
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
      </Flex>
    </Box>
  );
}
