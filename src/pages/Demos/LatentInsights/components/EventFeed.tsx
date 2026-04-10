import { Box, Code, Flex, Text } from "@chakra-ui/react";
import React, { useRef, useEffect, useMemo, useCallback, useState } from "react";
import { useLatentInsights } from "../../../../contexts/LatentInsightsContext";
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
  const { state, selectNode } = useLatentInsights();
  const { feedEntries, session, selectedNode } = state;

  const isDark = useColorModeValue(false, true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const feedInitiatedRef = useRef(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expandedIdRef = useRef<string | null>(null);
  expandedIdRef.current = expandedId;

  const threadIds = useMemo(
    () => session?.threads?.map((t) => t.id) ?? [],
    [session],
  );

  // Auto-scroll to bottom as new entries arrive
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [feedEntries.length]);

  // Scroll selected entry into view
  useEffect(() => {
    if (feedInitiatedRef.current) {
      feedInitiatedRef.current = false;
      return;
    }
    const targetId = selectedNodeToFeedId(selectedNode);
    if (!targetId) return;
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
  }, [selectedNode]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    autoScrollRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD;
  }, []);

  const toggleExpand = useCallback(
    (id: string, entry: FeedEntry) => {
      feedInitiatedRef.current = true;
      const next = expandedIdRef.current === id ? null : id;
      setExpandedId(next);
      selectNode(next ? feedEntryToSelectedNode(entry) : null);
    },
    [selectNode],
  );

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
            onToggle={toggleExpand}
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
  onToggle: (id: string, entry: FeedEntry) => void;
}

function getTypeLabel(eventType: string): string {
  switch (eventType) {
    case "thread_start":    return "start";
    case "thread_complete": return "done";
    case "thread_waiting":  return "waiting";
    case "llm_call":        return "llm";
    case "tool_call":       return "sql";
    case "step_complete":   return "step done";
    default:                return "";
  }
}

const FeedRow: React.FC<FeedRowProps> = React.memo(
  ({ entry, threadIds, isDark, isExpanded, onToggle }) => {
    const threadColor = getThreadColor(entry.thread_id, threadIds, isDark);
    const moveColor = getMoveColor(entry.move, isDark);
    const expandable = hasExpandableContent(entry);
    const dimColor = isDark ? "#888" : "#666";
    const mutedColor = isDark ? "#555" : "#aaa";

    const tid = entry.thread_id.slice(0, THREAD_ID_PREVIEW_LENGTH);
    const duration = entry.message && /^\d/.test(entry.message) ? entry.message : "";
    const textContent = entry.response || entry.sql || entry.full_message || "";
    const previewText = textContent || (duration ? "" : entry.message || "");
    const typeHint = getTypeLabel(entry.event_type);
    const isRunning = entry.thread_status === "running";

    return (
      <Box
        data-entry-id={entry.id}
        px={2}
        py="3px"
        minW={0}
        maxW="100%"
        w="100%"
        cursor={expandable ? "pointer" : "default"}
        _hover={expandable ? { bg: isDark ? "whiteAlpha.50" : "blackAlpha.50" } : undefined}
        borderRadius="sm"
        onClick={() => expandable && onToggle(entry.id, entry)}
      >
        <Flex gap="6px" align="center" minW={0} w="100%">
          {/* Thread ID pill with status dot in thread color */}
          <Flex
            align="center"
            gap="4px"
            flexShrink={0}
            px="5px"
            py="1px"
            borderRadius="3px"
            border="1px solid"
            borderColor={isDark ? "whiteAlpha.100" : "blackAlpha.100"}
          >
            <Box
              w="5px"
              h="5px"
              borderRadius="full"
              bg={threadColor}
              flexShrink={0}
              animation={isRunning ? "flow-pulse 2s ease-in-out infinite" : undefined}
            />
            <Text as="span" color={threadColor} fontWeight="medium">
              {tid}
            </Text>
          </Flex>

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
            <Text as="span" color={dimColor} flexShrink={0} fontSize="2xs" fontStyle="italic">
              {typeHint}
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
              title={textContent || entry.message}
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
        </Flex>

        {isExpanded && (
          <Box
            mt={1}
            mb={2}
            ml={2}
            pl={2}
            borderLeft="2px solid"
            borderColor={threadColor}
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
    return (
      <Box>
        {entry.full_message && (
          <Box mb={2}>
            <MarkdownContent content={entry.full_message} />
          </Box>
        )}
        <ReplyInput
          threadId={entry.thread_id}
          label="Reply to waiting thread"
          placeholder="Type a reply and press Enter…"
          onClose={() => {}}
        />
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
        {entry.response && <MarkdownContent content={entry.response} />}
        {entry.tables &&
          Object.entries(entry.tables).map(([key, rows]) => (
            <JsonTable key={key} data={rows} label={key} />
          ))}
      </Box>
    );
  }

  if (entry.full_message) return <MarkdownContent content={entry.full_message} />;
  return null;
};
