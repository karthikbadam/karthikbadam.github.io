import { Box, Code, Flex, Text } from "@chakra-ui/react";
import React, { useRef, useEffect, useMemo, useCallback, useState } from "react";
import { useLatentInsights } from "../../../../contexts/LatentInsightsContext";
import { useColorModeValue } from "../../../../components/ui/color-mode";
import { MarkdownContent } from "./MarkdownContent";
import { ReplyInput } from "./ReplyInput";
import { FeedEntry } from "../types";
import {
  THREAD_ID_PREVIEW_LENGTH,
  SCROLL_BOTTOM_THRESHOLD,
  MOVE_COLORS_DARK,
  MOVE_COLORS_LIGHT,
  STATUS_COLORS,
} from "../config";
import {
  getThreadColor,
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

  const threadIds = useMemo(() => {
    if (!session?.threads) return [];
    return session.threads.map((t) => t.id);
  }, [session]);

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [feedEntries.length]);

  useEffect(() => {
    if (feedInitiatedRef.current) {
      feedInitiatedRef.current = false;
      return;
    }
    const targetId = selectedNodeToFeedId(selectedNode);
    if (!targetId) return;
    setExpandedId(targetId);
    autoScrollRef.current = false;
    const scrollToTarget = () => {
      const container = scrollRef.current;
      if (!container) return;
      const el = container.querySelector(
        `[data-entry-id="${targetId}"]`
      ) as HTMLElement | null;
      if (!el) return;
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const targetTop =
        container.scrollTop +
        (elRect.top - containerRect.top) -
        container.clientHeight / 2 +
        elRect.height / 2;
      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
      });
      if (el.tabIndex < 0) el.tabIndex = -1;
      el.focus({ preventScroll: true });
    };

    const container = scrollRef.current;
    const feedPanel = container?.closest("[data-feed-panel]") as HTMLElement | null;
    if (feedPanel) {
      feedPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    requestAnimationFrame(() => {
      setTimeout(scrollToTarget, 120);
    });
  }, [selectedNode]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD;
    autoScrollRef.current = atBottom;
  }, []);

  const toggleExpand = useCallback(
    (id: string, entry: FeedEntry) => {
      feedInitiatedRef.current = true;
      const prev = expandedIdRef.current;
      const next = prev === id ? null : id;
      setExpandedId(next);
      if (next) {
        const node = feedEntryToSelectedNode(entry);
        if (node) selectNode(node);
      } else {
        selectNode(null);
      }
    },
    [selectNode]
  );

  return (
    <Flex direction="column" h="100%" minW={0} maxW="100%" overflow="hidden">
      <style>{`
        @keyframes flow-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
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
            {state.mode === "live"
              ? "Waiting for events…"
              : "No events to display"}
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

function getEventIcon(eventType: string): string {
  switch (eventType) {
    case "thread_start":    return "▸";
    case "thread_complete": return "✓";
    case "thread_waiting":  return "◐";
    case "step_start":      return "·";
    case "step_complete":   return "◆";
    case "llm_call":        return "◇";
    case "tool_call":       return "▪";
    default:                return "·";
  }
}

function getEventTypeHint(eventType: string): string {
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
    const expandable = hasExpandableContent(entry);
    const moveColors = isDark ? MOVE_COLORS_DARK : MOVE_COLORS_LIGHT;
    const fgColor = isDark ? "#d0d0d0" : "#222";
    const dimColor = isDark ? "#888" : "#666";
    const mutedColor = isDark ? "#555" : "#aaa";

    const tid = entry.thread_id.slice(0, THREAD_ID_PREVIEW_LENGTH);
    const isEvent = entry.event_type === "llm_call" || entry.event_type === "tool_call";
    const isStepBoundary = entry.event_type === "step_start" || entry.event_type === "step_complete";
    const icon = getEventIcon(entry.event_type);

    // Move badge colors
    const moveUpper = entry.move?.toUpperCase();
    const moveColor = moveUpper ? (moveColors[moveUpper] || moveColors.UNKNOWN) : null;

    // Status dot color
    const statusColor = entry.thread_status
      ? STATUS_COLORS[entry.thread_status] || mutedColor
      : null;

    // Build content preview
    const duration = entry.message && /^\d/.test(entry.message) ? entry.message : "";
    const textContent = entry.response || entry.sql || entry.full_message || "";
    const previewText = textContent || (duration ? "" : entry.message || "");
    const typeHint = getEventTypeHint(entry.event_type);

    return (
      <Box
        data-entry-id={entry.id}
        position="relative"
        pl="10px"
        pr={2}
        py="3px"
        minW={0}
        maxW="100%"
        w="100%"
        cursor={expandable ? "pointer" : "default"}
        _hover={expandable ? { bg: isDark ? "whiteAlpha.50" : "blackAlpha.50" } : undefined}
        borderRadius="sm"
        onClick={() => expandable && onToggle(entry.id, entry)}
        _before={{
          content: '""',
          position: "absolute",
          left: "2px",
          top: "3px",
          bottom: "3px",
          width: "2px",
          borderRadius: "1px",
          bg: threadColor,
          opacity: isExpanded ? 1 : 0.7,
        }}
      >
        <Flex gap="6px" align="center" minW={0} w="100%">
          {/* Event type icon */}
          <Text
            as="span"
            color={isEvent ? mutedColor : dimColor}
            flexShrink={0}
            fontSize="10px"
            lineHeight="1"
            w="10px"
            textAlign="center"
          >
            {icon}
          </Text>

          {/* Thread ID pill */}
          <Flex
            align="center"
            gap="3px"
            flexShrink={0}
            px="4px"
            py="1px"
            borderRadius="3px"
            border="1px solid"
            borderColor={isDark ? "whiteAlpha.100" : "blackAlpha.100"}
          >
            {statusColor && (
              <Box
                w="5px"
                h="5px"
                borderRadius="full"
                bg={statusColor}
                flexShrink={0}
                animation={entry.thread_status === "running" ? "flow-pulse 2s ease-in-out infinite" : undefined}
              />
            )}
            <Text as="span" color={threadColor} fontWeight="medium">
              {tid}
            </Text>
          </Flex>

          {/* Step number */}
          {entry.step_number !== undefined && (
            <Text as="span" color={mutedColor} flexShrink={0} fontSize="2xs">
              #{entry.step_number}
            </Text>
          )}

          {/* Move badge with colored background */}
          {moveUpper && moveColor && (
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
                {entry.move}
              </Text>
            </Box>
          )}

          {/* Type hint for non-move rows (start, waiting, llm, sql) */}
          {!moveUpper && typeHint && (
            <Text as="span" color={dimColor} flexShrink={0} fontSize="2xs" fontStyle="italic">
              {typeHint}
            </Text>
          )}

          {/* Agent role */}
          {isEvent && entry.agent && (
            <Text as="span" color={mutedColor} flexShrink={0} fontSize="2xs">
              {entry.agent}
            </Text>
          )}

          {/* Duration chip */}
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

          {/* Preview text fills remaining */}
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
                color={isStepBoundary ? fgColor : dimColor}
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
                w="100%"
                fontStyle={isStepBoundary ? "normal" : "normal"}
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
      <Box as="table" fontSize="2xs" fontFamily="mono" w="100%" css={{
        borderCollapse: "collapse",
        "& th, & td": { padding: "2px 6px", textAlign: "left", borderBottom: "1px solid var(--chakra-colors-border-muted, #333)" },
        "& th": { fontWeight: "bold", opacity: 0.7 },
      }}>
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
        <Text fontSize="2xs" color="fg.muted">{"…"} {data.length - 50} more rows</Text>
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
        {entry.tables && Object.entries(entry.tables).map(([key, rows]) => (
          <JsonTable key={key} data={rows} label={key} />
        ))}
      </Box>
    );
  }

  if (entry.full_message) {
    return <MarkdownContent content={entry.full_message} />;
  }

  return null;
};
