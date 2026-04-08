import { Box, Input, Text } from "@chakra-ui/react";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { useLatentInsights } from "../../../../contexts/LatentInsightsContext";

interface ReplyInputProps {
  threadId: string;
  onClose: () => void;
}

export const ReplyInput: React.FC<ReplyInputProps> = ({
  threadId,
  onClose,
}) => {
  const { replyToThread } = useLatentInsights();
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!value.trim() || sending) return;
      setSending(true);
      setError(null);
      try {
        await replyToThread(threadId, value.trim());
        setValue("");
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send");
      } finally {
        setSending(false);
      }
    },
    [value, sending, replyToThread, threadId, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  return (
    <Box
      as="form"
      onSubmit={handleSubmit}
      p={2}
      borderTop="1px solid"
      borderColor="gray.subtle"
    >
      <Text fontSize="xs" color="fg.muted" mb={1} fontFamily="mono">
        Reply to thread {threadId.slice(0, 8)}…
      </Text>
      <Input
        ref={inputRef}
        size="xs"
        variant="outline"
        fontFamily="mono"
        fontSize="xs"
        placeholder="Type a message and press Enter…"
        value={value}
        onClick={(e) => {
          e.stopPropagation();
        }}
        onChange={(e) => {
          e.stopPropagation();
          setValue(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        disabled={sending}
      />
      {error && (
        <Text fontSize="xs" color="red.500" mt={1}>
          {error}
        </Text>
      )}
    </Box>
  );
};
