import { Box, Flex, Input, Text } from "@chakra-ui/react";
import React, { useState, useCallback, useRef } from "react";
import { LuCornerDownLeft } from "react-icons/lu";
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
    ? `Reply to ${selectedThreadId!.slice(0, THREAD_ID_PREVIEW_LENGTH)}…`
    : "Ask a question…";

  return (
    <Box>
      <Flex
        as="form"
        onSubmit={handleSubmit}
        align="center"
        gap={0}
        borderRadius="xl"
        bg="bg.subtle"
        border="1px solid"
        borderColor="border.muted"
        overflow="hidden"
        transition="border-color 0.15s"
        _focusWithin={{ borderColor: "fg.muted" }}
      >
        <Input
          ref={inputRef}
          flex={1}
          variant="flushed"
          size="sm"
          fontFamily="mono"
          fontSize="xs"
          px={4}
          py={2}
          h="36px"
          border="none"
          borderBottom="none"
          outline="none"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={sending}
          _placeholder={{ color: "fg.muted" }}
          _focus={{ boxShadow: "none", borderColor: "transparent" }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setValue("");
          }}
        />

        <Box
          as="button"
          display="flex"
          alignItems="center"
          justifyContent="center"
          px={4}
          h="36px"
          color="fg.muted"
          cursor={sending ? "wait" : "pointer"}
          _hover={{ color: "fg" }}
          opacity={sending ? 0.4 : value.trim() ? 0.8 : 0.3}
          flexShrink={0}
          transition="opacity 0.15s, color 0.15s"
        >
          <LuCornerDownLeft size={14} />
        </Box>
      </Flex>

      {/* Secondary actions */}
      <Flex gap={1} mt="6px" px={2} align="center">
        <Box
          as="button"
          fontSize="2xs"
          fontFamily="mono"
          color="fg.muted"
          cursor="pointer"
          _hover={{ color: "fg" }}
          opacity={value.trim() ? 0.8 : 0.35}
          transition="opacity 0.15s"
          onClick={handleBroadcast}
        >
          broadcast
        </Box>
        <Text fontSize="2xs" color="fg.muted" opacity={0.3} userSelect="none">
          ·
        </Text>
        <Box
          as="button"
          fontSize="2xs"
          fontFamily="mono"
          color="fg.muted"
          cursor="pointer"
          _hover={{ color: "fg" }}
          opacity={0.8}
          transition="opacity 0.15s"
          onClick={handleContinue}
          title="Resume waiting threads and scout for new questions"
        >
          continue + rescan
        </Box>
      </Flex>

      {error && (
        <Text fontSize="2xs" color="red.400" mt={1} px={2} fontFamily="mono">
          {error}
        </Text>
      )}
    </Box>
  );
};
