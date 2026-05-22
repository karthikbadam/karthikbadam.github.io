import { Box, Code, Flex, Text } from "@chakra-ui/react";
import React, { useRef, useEffect, useMemo, useCallback, useState } from "react";
import { LuDownload, LuX } from "react-icons/lu";
import { useAtomValue, useSetAtom } from "jotai";
import { feedEntriesAtom, metaAtom, selectNodeAtom, stateAtom } from "../atoms";
import { useColorModeValue } from "../../../../components/ui/color-mode";
import { MarkdownContent } from "./MarkdownContent";
import { ReplyInput } from "./ReplyInput";
import { FeedEntry } from "../types";
import { THREAD_ID_PREVIEW_LENGTH, SCROLL_BOTTOM_THRESHOLD } from "../config";
import {
  getThreadColor,
  getMoveColor,
  hasExpandableContent,
  feedEntryToSelectedNode,
  selectedNodeToFeedId,
} from "../utils";

export const EventFeed: React.FC = () => {
  const state = useAtomValue(stateAtom);
  const feedEntries = useAtomValue(feedEntriesAtom);
  const selectNode = useSetAtom(selectNodeAtom);
  const { selectedNode } = state;

  const isDark = useColorModeValue(false, true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const feedInitiatedRef = useRef(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expandedIdRef = useRef<string | null>(null);
  expandedIdRef.current = expandedId;

  const threadIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const e of feedEntries) {
      if (e.thread_id && !seen.has(e.thread_id)) {
        seen.add(e.thread_id);
        ids.push(e.thread_id);
      }
    }
    return ids;
  }, [feedEntries]);

  // Auto-scroll to bottom as new entries arrive
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [feedEntries.length]);

  // Scroll selected entry into view, with a fallback for step selections
  // that don't have a matching primary id (e.g., a step that has only
  // step_complete, no step_start).
  useEffect(() => {
    if (feedInitiatedRef.current) {
      feedInitiatedRef.current = false;
      return;
    }
    let targetId = selectedNodeToFeedId(selectedNode);
    if (!targetId) return;
    if (
      selectedNode?.type === "step" &&
      selectedNode.threadId &&
      selectedNode.stepNumber !== undefined
    ) {
      const tid = selectedNode.threadId;
      const sn = selectedNode.stepNumber;
      const match = feedEntries.find(
        (e) =>
          e.thread_id === tid &&
          e.step_number === sn &&
          (e.event_type === "step_start" ||
            e.event_type === "step_complete" ||
            e.event_type === "human_message" ||
            e.event_type === "thread_waiting"),
      );
      if (match) targetId = match.id;
    }
    setExpandedId(targetId);
    autoScrollRef.current = false;
    requestAnimationFrame(() => {
      setTimeout(() => {
        const container = scrollRef.current;
        const el = container?.querySelector(`[data-entry-id="${targetId}"]`) as HTMLElement | null;
        if (!container || !el) return;
        const cRect = container.getBoundingClientRect();
        const eRect = el.getBoundingClientRect();
        const targetTop =
          container.scrollTop +
          (eRect.top - cRect.top) -
          container.clientHeight / 2 +
          eRect.height / 2;
        container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
      }, 120);
    });
  }, [selectedNode, feedEntries]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    autoScrollRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD;
  }, []);

  const expand = useCallback(
    (id: string, entry: FeedEntry) => {
      feedInitiatedRef.current = true;
      setExpandedId(id);
      selectNode(feedEntryToSelectedNode(entry));
    },
    [selectNode],
  );

  const collapse = useCallback(() => {
    feedInitiatedRef.current = true;
    setExpandedId(null);
    selectNode(null);
  }, [selectNode]);

  return (
    <Flex direction="column" h="100%" minW={0} maxW="100%" overflow="hidden">
      <Box
        ref={scrollRef}
        flex={1}
        minW={0}
        w="100%"
        maxW="100%"
        overflowY="auto"
        overflowX="hidden"
        onScroll={handleScroll}
        fontFamily="mono"
        px={2}
        fontSize="xs"
        lineHeight="1.5"
      >
        {feedEntries.length === 0 && (
          <Text color="fg.muted" fontSize="xs" p={2} textAlign="center">
            {state.mode === "live" ? "Waiting for events…" : "No events to display"}
          </Text>
        )}
        {feedEntries.map((entry) => (
          <FeedRow
            key={entry.id}
            entry={entry}
            threadIds={threadIds}
            isDark={isDark}
            isExpanded={expandedId === entry.id}
            onExpand={expand}
            onCollapse={collapse}
          />
        ))}
      </Box>
    </Flex>
  );
};

interface FeedRowProps {
  entry: FeedEntry;
  threadIds: string[];
  isDark: boolean;
  isExpanded: boolean;
  onExpand: (id: string, entry: FeedEntry) => void;
  onCollapse: () => void;
}

function getTypeLabel(eventType: string): string {
  switch (eventType) {
    case "thread_start":    return "start";
    case "thread_complete": return "done";
    case "thread_waiting":  return "waiting";
    case "llm_call":        return "llm";
    case "tool_call":       return "sql";
    case "step_complete":   return "step done";
    case "human_message":   return "msg";
    default:                return "";
  }
}

const WAITING_HEADERS: Record<string, string> = {
  coordinator_stuck: "Analysis paused — needs guidance",
  repeated_moves: "Analysis got stuck in a loop",
  retry_exhausted: "LLM provider unreachable — send any reply to retry",
  unexpected_error: "Unexpected error",
  human_review: "Step complete — review and continue",
  context_exhausted: "Context window exhausted — send a narrower follow-up",
};

const FeedRow: React.FC<FeedRowProps> = React.memo(
  ({ entry, threadIds, isDark, isExpanded, onExpand, onCollapse }) => {
    const threadColor = getThreadColor(entry.thread_id, threadIds, isDark);
    const moveColor = getMoveColor(entry.move ?? undefined, isDark);
    const expandable = hasExpandableContent(entry);
    const dimColor = isDark ? "#888" : "#666";
    const mutedColor = isDark ? "#555" : "#aaa";

    const tid = entry.thread_id.slice(0, THREAD_ID_PREVIEW_LENGTH);
    const duration =
      entry.message && /^\d/.test(entry.message) ? entry.message : "";
    const textContent =
      entry.content ??
      entry.response_text ??
      entry.sql ??
      entry.full_message ??
      "";
    const previewText =
      textContent !== "" ? textContent : duration ? "" : entry.message ?? "";
    const typeHint = getTypeLabel(entry.event_type);

    return (
      <Box
        data-entry-id={entry.id}
        px={2}
        py={isExpanded ? 2 : "3px"}
        my={isExpanded ? 2 : 0}
        minW={0}
        maxW="100%"
        w="100%"
        cursor={!isExpanded && expandable ? "pointer" : "default"}
        bg={
          isExpanded
            ? isDark ? "whiteAlpha.100" : "blackAlpha.50"
            : undefined
        }
        borderLeft="2px solid"
        borderLeftColor={isExpanded ? threadColor : "transparent"}
        _hover={
          !isExpanded && expandable
            ? { bg: isDark ? "whiteAlpha.50" : "blackAlpha.50" }
            : undefined
        }
        borderRadius="sm"
        onClick={() => !isExpanded && expandable && onExpand(entry.id, entry)}
      >
        <Flex gap="6px" align="center" minW={0} w="100%">
          {/* Thread ID pill */}
          <Box
            flexShrink={0}
            px="5px"
            py="1px"
            borderRadius="3px"
            border="1px solid"
            borderColor={isDark ? "whiteAlpha.100" : "blackAlpha.100"}
          >
            <Text as="span" color={threadColor} fontWeight="medium">
              {tid}
            </Text>
          </Box>

          {/* Step number */}
          {entry.step_number !== undefined && (
            <Text as="span" color={mutedColor} flexShrink={0} fontSize="2xs">
              STEP {entry.step_number}
            </Text>
          )}

          {/* Move badge */}
          {entry.move && (
            <Box
              px="5px"
              py="1px"
              borderRadius="3px"
              bg={moveColor.bg}
              flexShrink={0}
            >
              <Text
                as="span"
                color={moveColor.fg}
                fontWeight="bold"
                fontSize="2xs"
                letterSpacing="0.03em"
              >
                {entry.move.toUpperCase()}
              </Text>
            </Box>
          )}

          {/* Type hint when no move */}
          {!entry.move && typeHint && (
            <Text as="span" color={dimColor} flexShrink={0} fontSize="2xs">
              {typeHint.toUpperCase()}
            </Text>
          )}

          {/* Agent */}
          {entry.agent && (
            <Text as="span" color={mutedColor} flexShrink={0} fontSize="2xs">
              {entry.agent}
            </Text>
          )}

          {/* Duration */}
          {duration && (
            <Text
              as="span"
              color={mutedColor}
              flexShrink={0}
              fontSize="2xs"
              fontVariantNumeric="tabular-nums"
            >
              {duration}
            </Text>
          )}

          {/* Preview text */}
          {!isExpanded && previewText && (
            <Box
              flex="1 1 0%"
              minW={0}
              maxW="100%"
              overflow="hidden"
              title={textContent !== "" ? textContent : entry.message}
            >
              <Text
                as="div"
                color={dimColor}
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
                w="100%"
              >
                {previewText}
              </Text>
            </Box>
          )}

          {/* Explicit collapse button — only when expanded */}
          {isExpanded && (
            <>
              <Box flex="1 1 0%" />
              <Box
                as="button"
                flexShrink={0}
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                w="20px"
                h="20px"
                borderRadius="3px"
                color={dimColor}
                _hover={{
                  color: "fg",
                  bg: isDark ? "whiteAlpha.200" : "blackAlpha.100",
                }}
                aria-label="Collapse"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onCollapse();
                }}
              >
                <LuX size={12} />
              </Box>
            </>
          )}
        </Flex>

        {isExpanded && (
          <Box
            mt={2}
            pt={2}
            pl={1}
            borderTop="1px solid"
            borderColor={isDark ? "whiteAlpha.200" : "blackAlpha.200"}
          >
            <ExpandedContent entry={entry} />
          </Box>
        )}
      </Box>
    );
  }
);

// --- Expanded content renderer ---

const JsonTable: React.FC<{ data: unknown[]; label?: string }> = ({ data, label }) => {
  if (!data.length || typeof data[0] !== "object" || data[0] === null) return null;
  const cols = Object.keys(data[0] as Record<string, unknown>);
  return (
    <Box my={1} overflowX="auto">
      {label && (
        <Text fontSize="2xs" fontFamily="mono" color="fg.muted" mb={0.5}>
          {label}
        </Text>
      )}
      <Box
        as="table"
        fontSize="2xs"
        fontFamily="mono"
        w="100%"
        css={{
          borderCollapse: "collapse",
          "& th, & td": {
            padding: "2px 6px",
            textAlign: "left",
            borderBottom: "1px solid var(--chakra-colors-border-muted, #333)",
          },
          "& th": { fontWeight: "bold", opacity: 0.7 },
        }}
      >
        <thead>
          <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {data.slice(0, 50).map((row, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c}>{String((row as Record<string, unknown>)[c] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>
      {data.length > 50 && (
        <Text fontSize="2xs" color="fg.muted">… {data.length - 50} more rows</Text>
      )}
    </Box>
  );
};

const ExpandedContent: React.FC<{ entry: FeedEntry }> = ({ entry }) => {
  if (entry.event_type === "thread_waiting") {
    const reason = (entry.reason as string | undefined) ?? undefined;
    const header = reason ? WAITING_HEADERS[reason] : undefined;
    return (
      <Box>
        {header && (
          <Text
            fontSize="2xs"
            fontFamily="mono"
            fontWeight="semibold"
            color="fg"
            mb={1}
          >
            {header}
          </Text>
        )}
        {entry.full_message && (
          <Box mb={2}>
            <MarkdownContent content={entry.full_message} />
          </Box>
        )}
        <ReplyInput
          threadId={entry.thread_id}
          label={
            reason === "retry_exhausted"
              ? "Send any reply to retry"
              : reason === "human_review"
                ? "Review and continue"
                : reason === "context_exhausted"
                  ? "Send a narrower follow-up"
                  : "Reply to waiting thread"
          }
          placeholder={
            reason === "retry_exhausted"
              ? "Press Enter to retry, or add new context…"
              : reason === "human_review"
                ? "Add direction, or press Enter to continue…"
                : reason === "context_exhausted"
                  ? "Narrow the question or add constraints…"
                  : "Type a reply and press Enter…"
          }
          onClose={() => {}}
        />
      </Box>
    );
  }

  if (entry.event_type === "human_message") {
    return (
      <Box>
        <Flex align="center" gap={2} mb={1}>
          <Text fontSize="2xs" fontFamily="mono" color="fg.muted">
            {entry.target === "session" ? "→ all threads" : "→ this thread"}
          </Text>
        </Flex>
        <Box
          as="blockquote"
          fontSize="xs"
          fontFamily="mono"
          borderLeft="2px solid"
          borderColor="gray.500"
          pl={2}
          py={0.5}
          whiteSpace="pre-wrap"
        >
          {entry.content ?? ""}
        </Box>
      </Box>
    );
  }

  if (entry.event_type === "thread_start" && entry.thread_status === "running") {
    return (
      <Box>
        {entry.full_message && (
          <Box mb={2}>
            <MarkdownContent content={entry.full_message} />
          </Box>
        )}
        <ReplyInput
          threadId={entry.thread_id}
          label="Send direction to running thread"
          placeholder="Guide this thread…"
          onClose={() => {}}
        />
      </Box>
    );
  }

  if (entry.event_type === "tool_call") {
    return (
      <Box>
        {entry.sql && (
          <Code
            display="block"
            p={1}
            my={1}
            fontSize="xs"
            fontFamily="mono"
            whiteSpace="pre-wrap"
            wordBreak="break-word"
            borderRadius="sm"
          >
            {entry.sql}
          </Code>
        )}
        {entry.tool_result && (
          <Box
            as="pre"
            fontSize="xs"
            fontFamily="mono"
            whiteSpace="pre"
            overflowX="auto"
            p={1}
            my={1}
            borderRadius="sm"
            bg="bg.subtle"
            lineHeight="1.3"
          >
            {entry.tool_result}
          </Box>
        )}
      </Box>
    );
  }

  if (entry.event_type === "llm_call") {
    return (
      <Box>
        {entry.response_text && <MarkdownContent content={entry.response_text} />}
        {entry.response_tables &&
          Object.entries(entry.response_tables).map(([key, rows]) => (
            <JsonTable key={key} data={rows} label={key} />
          ))}
      </Box>
    );
  }

  if (entry.full_message) return <MarkdownContent content={entry.full_message} />;
  return null;
};

// --- JSONL download button (rendered in the feed panel header) ---

export const FeedDownloadButton: React.FC = () => {
  const entries = useAtomValue(feedEntriesAtom);
  const meta = useAtomValue(metaAtom);
  const isDark = useColorModeValue(false, true);
  const disabled = entries.length === 0;

  const onClick = () => {
    if (disabled) return;
    const lines = entries.map((e) => JSON.stringify(e)).join("\n");
    const blob = new Blob([lines], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meta?.id ?? "session"}.feed.jsonl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Box
      as="button"
      display="inline-flex"
      alignItems="center"
      gap="4px"
      px="6px"
      py="2px"
      fontSize="2xs"
      fontFamily="mono"
      color="fg.muted"
      borderRadius="3px"
      cursor={disabled ? "not-allowed" : "pointer"}
      opacity={disabled ? 0.4 : 1}
      _hover={
        !disabled
          ? { color: "fg", bg: isDark ? "whiteAlpha.100" : "blackAlpha.50" }
          : undefined
      }
      aria-label="Download feed as JSONL"
      title={disabled ? "No entries to download" : "Download feed as .jsonl"}
      onClick={onClick}
    >
      <LuDownload size={11} />
      jsonl
    </Box>
  );
};
