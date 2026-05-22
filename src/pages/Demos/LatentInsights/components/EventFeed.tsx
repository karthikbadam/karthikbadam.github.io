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

// --- Session metrics: aggregated tokens + estimated cost ---

// Prices in USD per 1M tokens. Update as providers change rates.
// Keys are normalized model names (provider prefix and date/tag suffix stripped).
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-opus-4-7":     { input: 15,   output: 75 },
  "claude-opus-4-6":     { input: 15,   output: 75 },
  "claude-opus-4-5":     { input: 15,   output: 75 },
  "claude-opus-4":       { input: 15,   output: 75 },
  "claude-sonnet-4-6":   { input: 3,    output: 15 },
  "claude-sonnet-4-5":   { input: 3,    output: 15 },
  "claude-sonnet-4":     { input: 3,    output: 15 },
  "claude-haiku-4-5":    { input: 1,    output: 5 },
  "claude-3-7-sonnet":   { input: 3,    output: 15 },
  "claude-3-5-sonnet":   { input: 3,    output: 15 },
  "claude-3-5-haiku":    { input: 0.8,  output: 4 },
  "claude-3-opus":       { input: 15,   output: 75 },
  // OpenAI
  "gpt-5":               { input: 1.25, output: 10 },
  "gpt-4.1":             { input: 2,    output: 8 },
  "gpt-4o":              { input: 2.5,  output: 10 },
  "gpt-4o-mini":         { input: 0.15, output: 0.6 },
  // OSS (typical OpenRouter pricing)
  "gpt-oss-20b":         { input: 0.05, output: 0.2 },
  "gpt-oss-120b":        { input: 0.15, output: 0.6 },
};

function normalizeModel(m: string): string {
  let n = m.split("/").pop() ?? m;     // strip provider prefix
  n = n.split(":")[0];                  // strip ":nitro" / ":beta"
  n = n.replace(/-\d{8}$/, "");         // strip date suffix
  n = n.replace(/-latest$/, "");
  return n.toLowerCase();
}

interface ModelTotals {
  input: number;
  output: number;
  calls: number;
  cost: number | null;
}

function aggregateMetrics(entries: FeedEntry[]): {
  totalInput: number;
  totalOutput: number;
  totalCost: number;
  unpricedTokens: number;
  perModel: Map<string, ModelTotals>;
} {
  const perModel = new Map<string, ModelTotals>();
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  let unpricedTokens = 0;

  for (const e of entries) {
    if (e.event_type !== "llm_call") continue;
    const i = e.input_tokens ?? 0;
    const o = e.output_tokens ?? 0;
    if (i === 0 && o === 0) continue;
    totalInput += i;
    totalOutput += o;

    const key = e.model ? normalizeModel(e.model) : "unknown";
    const price = MODEL_PRICING[key] ?? null;
    const callCost = price
      ? (i * price.input + o * price.output) / 1_000_000
      : null;
    if (callCost !== null) totalCost += callCost;
    else unpricedTokens += i + o;

    const t = perModel.get(key) ?? { input: 0, output: 0, calls: 0, cost: price ? 0 : null };
    t.input += i;
    t.output += o;
    t.calls += 1;
    if (price && t.cost !== null) t.cost += callCost!;
    perModel.set(key, t);
  }

  return { totalInput, totalOutput, totalCost, unpricedTokens, perModel };
}

function formatTokens(n: number): string {
  if (n === 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`;
}

function formatCost(c: number): string {
  if (c === 0) return "$0";
  if (c < 0.01) return "<$0.01";
  if (c < 1) return `$${c.toFixed(2)}`;
  if (c < 100) return `$${c.toFixed(2)}`;
  return `$${c.toFixed(0)}`;
}

export const FeedMetrics: React.FC = () => {
  const entries = useAtomValue(feedEntriesAtom);
  const metrics = useMemo(() => aggregateMetrics(entries), [entries]);

  if (metrics.totalInput === 0 && metrics.totalOutput === 0) return null;

  const tooltipLines: string[] = [];
  for (const [model, t] of Array.from(metrics.perModel.entries())) {
    const costStr = t.cost !== null ? formatCost(t.cost) : "—";
    tooltipLines.push(
      `${model}: ${t.calls} calls · ${formatTokens(t.input)} in · ${formatTokens(t.output)} out · ${costStr}`,
    );
  }
  if (metrics.unpricedTokens > 0) {
    tooltipLines.push(
      `* unpriced models: ${formatTokens(metrics.unpricedTokens)} tokens not counted toward cost`,
    );
  }
  const title = tooltipLines.join("\n");

  const costSuffix =
    metrics.unpricedTokens > 0 && metrics.totalCost > 0 ? "+" : "";

  return (
    <Flex
      align="center"
      gap={2}
      fontSize="2xs"
      fontFamily="mono"
      color="fg.muted"
      title={title}
    >
      <Text as="span">
        {formatTokens(metrics.totalInput)} in
      </Text>
      <Text as="span" color="fg.subtle">·</Text>
      <Text as="span">
        {formatTokens(metrics.totalOutput)} out
      </Text>
      <Text as="span" color="fg.subtle">·</Text>
      <Text as="span">
        {metrics.totalCost > 0 || metrics.unpricedTokens === 0
          ? formatCost(metrics.totalCost) + costSuffix
          : "—"}
      </Text>
    </Flex>
  );
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
