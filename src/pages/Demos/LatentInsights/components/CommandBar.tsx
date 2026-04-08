import { Box, Flex, Input, Text } from "@chakra-ui/react";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { LuChevronDown, LuSend } from "react-icons/lu";
import { useLatentInsights } from "../../../../contexts/LatentInsightsContext";
import { CommandMode, ExplorationPattern } from "../types";

const MODE_CONFIG: Record<
  CommandMode,
  { label: string; placeholder: string; description: string }
> = {
  ask: {
    label: "Ask",
    placeholder: "Ask a new question to start a thread…",
    description: "Creates a new analysis thread",
  },
  broadcast: {
    label: "Broadcast",
    placeholder: "Send a message to all active threads…",
    description: "Message all threads at once",
  },
  direct: {
    label: "Direct",
    placeholder: "Send direction to selected thread…",
    description: "Message a specific thread",
  },
  pattern: {
    label: "Pattern",
    placeholder: "Select a pattern below…",
    description: "Switch exploration pattern",
  },
  continue: {
    label: "Continue",
    placeholder: "Press Enter to resume stuck threads…",
    description: "Resume waiting/stuck threads",
  },
};

const PATTERNS: { value: ExplorationPattern; label: string; description: string }[] = [
  { value: "coordinator_worker", label: "Coordinator-Worker", description: "Standard sequential analysis" },
  { value: "fan_out", label: "Fan Out", description: "Parallel exploration branches" },
  { value: "human_in_the_loop", label: "Human in the Loop", description: "Interactive guided analysis" },
];

interface CommandBarProps {
  sessionId: string;
  selectedThreadId?: string;
}

export const CommandBar: React.FC<CommandBarProps> = ({
  sessionId,
  selectedThreadId,
}) => {
  const {
    createThread,
    broadcastMessage,
    replyToThread,
    switchPattern,
    continueSession,
  } = useLatentInsights();

  const [mode, setMode] = useState<CommandMode>("ask");
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<ExplorationPattern>("coordinator_worker");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-switch to "direct" mode when a thread is selected
  useEffect(() => {
    if (selectedThreadId && mode !== "direct") {
      setMode("direct");
    }
  }, [selectedThreadId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (sending) return;
      setError(null);
      setSending(true);
      try {
        switch (mode) {
          case "ask":
            if (!value.trim()) break;
            await createThread(sessionId, value.trim());
            setValue("");
            break;
          case "broadcast":
            if (!value.trim()) break;
            await broadcastMessage(sessionId, value.trim());
            setValue("");
            break;
          case "direct":
            if (!value.trim() || !selectedThreadId) {
              setError("Select a thread in the flow visualization first");
              break;
            }
            await replyToThread(selectedThreadId, value.trim());
            setValue("");
            break;
          case "pattern":
            await switchPattern(sessionId, selectedPattern);
            break;
          case "continue":
            await continueSession(sessionId);
            break;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
      } finally {
        setSending(false);
      }
    },
    [
      mode,
      value,
      sending,
      sessionId,
      selectedThreadId,
      selectedPattern,
      createThread,
      broadcastMessage,
      replyToThread,
      switchPattern,
      continueSession,
    ],
  );

  const selectMode = useCallback((m: CommandMode) => {
    setMode(m);
    setDropdownOpen(false);
    setError(null);
    setValue("");
    inputRef.current?.focus();
  }, []);

  const cfg = MODE_CONFIG[mode];
  const showInput = mode !== "pattern" && mode !== "continue";

  return (
    <Box px={4} pb={2}>
      <Box
        border="1px solid"
        borderColor="gray.600"
        borderRadius="md"
        bg="bg.panel"
        overflow="hidden"
      >
        <Flex
          as="form"
          onSubmit={handleSubmit}
          align="center"
          gap={0}
          minH="36px"
        >
          {/* Mode selector */}
          <Box position="relative" ref={dropdownRef} flexShrink={0}>
            <Box
              as="button"
              type="button"
              display="flex"
              alignItems="center"
              gap={1}
              px={3}
              h="36px"
              fontSize="xs"
              fontFamily="mono"
              fontWeight="bold"
              color="fg.muted"
              borderRight="1px solid"
              borderColor="gray.600"
              cursor="pointer"
              _hover={{ bg: "whiteAlpha.50" }}
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              {cfg.label}
              {mode === "direct" && selectedThreadId && (
                <Text as="span" fontWeight="normal" color="fg.muted">
                  {selectedThreadId.slice(0, 6)}
                </Text>
              )}
              <LuChevronDown size={10} />
            </Box>

            {dropdownOpen && (
              <Box
                position="absolute"
                bottom="100%"
                left={0}
                mb={1}
                bg="bg.panel"
                border="1px solid"
                borderColor="gray.600"
                borderRadius="md"
                zIndex={10}
                minW="200px"
                py={1}
              >
                {(Object.keys(MODE_CONFIG) as CommandMode[]).map((m) => (
                  <Box
                    key={m}
                    as="button"
                    type="button"
                    display="block"
                    w="100%"
                    textAlign="left"
                    px={3}
                    py={1.5}
                    fontSize="xs"
                    fontFamily="mono"
                    cursor="pointer"
                    bg={m === mode ? (undefined) : undefined}
                    fontWeight={m === mode ? "bold" : "normal"}
                    color={m === mode ? "fg" : "fg.muted"}
                    _hover={{ bg: "whiteAlpha.100" }}
                    onClick={() => selectMode(m)}
                  >
                    <Text fontWeight="bold">{MODE_CONFIG[m].label}</Text>
                    <Text color="fg.muted" fontSize="2xs">
                      {MODE_CONFIG[m].description}
                    </Text>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          {/* Input area */}
          {showInput && (
            <Input
              ref={inputRef}
              flex={1}
              variant="unstyled"
              size="xs"
              fontFamily="mono"
              fontSize="xs"
              px={3}
              placeholder={
                mode === "direct" && selectedThreadId
                  ? `Direct thread ${selectedThreadId.slice(0, 8)}…`
                  : cfg.placeholder
              }
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={sending}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setValue("");
                }
              }}
            />
          )}

          {/* Pattern selector (shown only in pattern mode) */}
          {mode === "pattern" && (
            <Flex flex={1} align="center" gap={2} px={3}>
              {PATTERNS.map((p) => (
                <Box
                  key={p.value}
                  as="button"
                  type="button"
                  px={2}
                  py={1}
                  fontSize="xs"
                  fontFamily="mono"
                  border="1px solid"
                  borderColor={selectedPattern === p.value ? "fg.muted" : "gray.600"}
                  borderRadius="sm"
                  color={selectedPattern === p.value ? "fg" : "fg.muted"}
                  cursor="pointer"
                  _hover={{ borderColor: "fg.muted" }}
                  onClick={() => setSelectedPattern(p.value)}
                >
                  {p.label}
                </Box>
              ))}
            </Flex>
          )}

          {/* Continue placeholder */}
          {mode === "continue" && (
            <Text flex={1} px={3} fontSize="xs" fontFamily="mono" color="fg.muted">
              Resume all stuck/waiting threads
            </Text>
          )}

          {/* Send button */}
          <Box
            as="button"
            type="submit"
            display="flex"
            alignItems="center"
            justifyContent="center"
            px={3}
            h="36px"
            fontSize="xs"
            fontFamily="mono"
            color="fg.muted"
            cursor={sending ? "wait" : "pointer"}
            _hover={{ color: "fg" }}
            opacity={sending ? 0.5 : 1}
            borderLeft="1px solid"
            borderColor="gray.600"
          >
            <LuSend size={12} />
          </Box>
        </Flex>

        {error && (
          <Text fontSize="xs" color="red.400" px={3} pb={1} fontFamily="mono">
            {error}
          </Text>
        )}
      </Box>
    </Box>
  );
};
