import { Box, Flex, Input, Text } from "@chakra-ui/react";
import React, { useState, useCallback, useRef } from "react";
import { LuSend } from "react-icons/lu";
import { useLatentInsights } from "../../../../contexts/LatentInsightsContext";
import { THREAD_ID_PREVIEW_LENGTH } from "../config";

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
    continueSession,
  } = useLatentInsights();

  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDirectMode = !!selectedThreadId;

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (sending) return;
      const text = value.trim();
      if (!text) return;
      setError(null);
      setSending(true);
      try {
        if (isDirectMode) {
          await replyToThread(selectedThreadId!, text);
        } else {
          await createThread(sessionId, text);
        }
        setValue("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
      } finally {
        setSending(false);
      }
    },
    [value, sending, sessionId, selectedThreadId, isDirectMode, createThread, replyToThread],
  );

  const handleBroadcast = useCallback(async () => {
    const text = value.trim();
    if (!text || sending) return;
    setError(null);
    setSending(true);
    try {
      await broadcastMessage(sessionId, text);
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSending(false);
    }
  }, [value, sending, sessionId, broadcastMessage]);

  const handleContinue = useCallback(async () => {
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      await continueSession(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSending(false);
    }
  }, [sending, sessionId, continueSession]);

  const placeholder = isDirectMode
    ? `Direct thread ${selectedThreadId!.slice(0, THREAD_ID_PREVIEW_LENGTH)}…`
    : "Ask a new question to start a thread…";

  return (
    <Box>
      <Flex
        as="form"
        onSubmit={handleSubmit}
        align="center"
        gap={0}
        border="1px solid"
        borderColor="gray.600"
        borderRadius="md"
        bg="bg.panel"
        overflow="hidden"
      >
        {/* Mode indicator */}
        <Text
          px={2}
          fontSize="2xs"
          fontFamily="mono"
          color="fg.muted"
          flexShrink={0}
          borderRight="1px solid"
          borderColor="gray.600"
          h="32px"
          lineHeight="32px"
          whiteSpace="nowrap"
        >
          {isDirectMode ? "direct" : "ask"}
        </Text>

        <Input
          ref={inputRef}
          flex={1}
          variant="unstyled"
          size="xs"
          fontFamily="mono"
          fontSize="xs"
          px={2}
          h="32px"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={sending}
          onKeyDown={(e) => {
            if (e.key === "Escape") setValue("");
          }}
        />

        {/* Send */}
        <Box
          as="button"
          type="submit"
          display="flex"
          alignItems="center"
          justifyContent="center"
          px={2}
          h="32px"
          color="fg.muted"
          cursor={sending ? "wait" : "pointer"}
          _hover={{ color: "fg" }}
          opacity={sending ? 0.5 : 1}
          borderLeft="1px solid"
          borderColor="gray.600"
          flexShrink={0}
        >
          <LuSend size={11} />
        </Box>
      </Flex>

      {/* Secondary actions row */}
      <Flex gap={3} mt={1} px={1}>
        <Box
          as="button"
          type="button"
          fontSize="2xs"
          fontFamily="mono"
          color="fg.muted"
          cursor="pointer"
          _hover={{ color: "fg" }}
          onClick={handleBroadcast}
          opacity={value.trim() ? 1 : 0.4}
        >
          broadcast to all
        </Box>
        <Box
          as="button"
          type="button"
          fontSize="2xs"
          fontFamily="mono"
          color="fg.muted"
          cursor="pointer"
          _hover={{ color: "fg" }}
          onClick={handleContinue}
          title="Resumes stuck threads and scouts for new questions (may spawn new threads)"
        >
          continue + rescan
        </Box>
      </Flex>

      {error && (
        <Text fontSize="2xs" color="red.400" mt={1} px={1} fontFamily="mono">
          {error}
        </Text>
      )}
    </Box>
  );
};
