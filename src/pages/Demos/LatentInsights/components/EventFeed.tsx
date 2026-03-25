import { Box, Code, Flex, Text } from "@chakra-ui/react";
import React, { useRef, useEffect, useMemo, useCallback, useState } from "react";
import { useLatentInsights } from "../../../../contexts/LatentInsightsContext";
import { useColorModeValue } from "../../../../components/ui/color-mode";
import { MarkdownContent } from "./MarkdownContent";
import { ReplyInput } from "./ReplyInput";
import { FeedEntry, SelectedNode, SSEEventType } from "../types";

const THREAD_SHADES_DARK = [
  "#888", "#999", "#777", "#aaa", "#666",
  "#8a8a8a", "#7a7a7a", "#9a9a9a", "#6a6a6a", "#b0b0b0",
];
const THREAD_SHADES_LIGHT = [
  "#666", "#555", "#777", "#444", "#888",
  "#5a5a5a", "#6a6a6a", "#4a4a4a", "#7a7a7a", "#3a3a3a",
];

function getThreadColor(
  threadId: string,
  threadIds: string[],
  isDark: boolean
): string {
  const palette = isDark ? THREAD_SHADES_DARK : THREAD_SHADES_LIGHT;
  const idx = threadIds.indexOf(threadId);
  return palette[idx % palette.length];
}

const TYPE_LABELS: Record<string, string> = {
  thread_start: "start",
  step_start: "step",
  llm_call: "llm",
  tool_call: "sql",
  step_complete: "done",
  thread_complete: "fin",
  thread_waiting: "wait",
};

function hasExpandableContent(entry: FeedEntry): boolean {
  return !!(
    entry.full_message ||
    entry.sql ||
    entry.tool_result ||
    entry.response ||
    entry.tables ||
    entry.event_type === "thread_waiting"
  );
}

function feedEntryToSelectedNode(entry: FeedEntry): SelectedNode | null {
  const id = entry.id;
  if (id.startsWith("ts:")) {
    return { type: "thread", threadId: id.slice(3) };
  }
  if (id.startsWith("tc:")) {
    return { type: "thread_end", threadId: id.slice(3), threadStatus: "complete" };
  }
  if (id.startsWith("tw:")) {
    return { type: "thread_end", threadId: id.slice(3), threadStatus: "waiting" };
  }
  if (id.startsWith("ss:")) {
    const parts = id.slice(3).split(":");
    return { type: "step", threadId: parts[0], stepNumber: Number(parts[1]) };
  }
  if (id.startsWith("sc:")) {
    const parts = id.slice(3).split(":");
    return { type: "step", threadId: parts[0], stepNumber: Number(parts[1]) };
  }
  if (id.startsWith("ev:")) {
    const parts = id.slice(3).split(":");
    return {
      type: "event",
      threadId: parts[0],
      stepNumber: Number(parts[1]),
      eventIndex: Number(parts[2]),
    };
  }
  return null;
}

function selectedNodeToFeedId(node: SelectedNode | null): string | null {
  if (!node) return null;
  switch (node.type) {
    case "thread":
      return node.threadId ? `ts:${node.threadId}` : null;
    case "thread_end":
      if (!node.threadId) return null;
      if (node.threadStatus === "waiting") return `tw:${node.threadId}`;
      return `tc:${node.threadId}`;
    case "step":
      return node.threadId && node.stepNumber !== undefined
        ? `ss:${node.threadId}:${node.stepNumber}` : null;
    case "event":
      return node.threadId && node.stepNumber !== undefined && node.eventIndex !== undefined
        ? `ev:${node.threadId}:${node.stepNumber}:${node.eventIndex}` : null;
    default:
      return null;
  }
}

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
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
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

const FeedRow: React.FC<FeedRowProps> = React.memo(
  ({ entry, threadIds, isDark, isExpanded, onToggle }) => {
    const color = getThreadColor(entry.thread_id, threadIds, isDark);
    const expandable = hasExpandableContent(entry);
    const typeLabel = TYPE_LABELS[entry.event_type as SSEEventType] || entry.event_type;
    const activeColor = isDark ? "#eee" : "#111";
    const dimColor = isExpanded ? activeColor : isDark ? "#888" : "#666";
    const mutedColor = isExpanded ? activeColor : isDark ? "#666" : "#999";
    const threadColor = isExpanded ? activeColor : color;

    return (
      <Box
        data-entry-id={entry.id}
        px={1}
        py="2px"
        minW={0}
        maxW="100%"
        w="100%"
        cursor={expandable ? "pointer" : "default"}
        _hover={expandable ? { bg: isDark ? "whiteAlpha.50" : "blackAlpha.50" } : undefined}
        borderRadius="sm"
        onClick={() => expandable && onToggle(entry.id, entry)}
      >
        <Flex gap="6px" align="center" minW={0} w="100%">
          <Text as="span" color={threadColor} flexShrink={0}>
            {entry.thread_id.slice(0, 6)}
          </Text>
          {entry.step_number !== undefined && (
            <Text as="span" color={dimColor} flexShrink={0}>
              s{entry.step_number}
            </Text>
          )}
          {entry.move && (
            <Text as="span" color={dimColor} fontWeight="bold" flexShrink={0}>
              {entry.move}
            </Text>
          )}
          {entry.agent && (
            <Text as="span" color={mutedColor} flexShrink={0}>
              {entry.agent}
            </Text>
          )}
          {!entry.agent && !entry.move && (
            <Text as="span" color={mutedColor} flexShrink={0}>
              {typeLabel}
            </Text>
          )}
          {entry.message && (
            <Box
              flex="1 1 0%"
              minW={0}
              maxW="100%"
              overflow="hidden"
              title={entry.message}
            >
              <Box
                as="div"
                color={dimColor}
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
                w="100%"
              >
                {entry.message}
              </Box>
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
            borderColor={isDark ? "#444" : "#ccc"}
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
