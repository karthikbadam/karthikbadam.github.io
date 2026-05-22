import { Box, Flex, Text } from "@chakra-ui/react";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { LuPlay, LuSquare, LuRotateCcw } from "react-icons/lu";
import { useColorModeValue } from "../../../../components/ui/color-mode";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  allFeedEntriesAtom,
  feedEntriesAtom,
  replayCursorAtom,
  selectNodeAtom,
  stateAtom,
} from "../atoms";
import {
  EVENT_GAP,
  EVENT_H,
  EVENT_WIDTH_RATIO,
  MARKER_H,
  START_MARKER_H,
  STEP_GAP,
  STEP_H,
  THREAD_GAP,
  TOP_PAD,
} from "../config";
import { getMoveColor, getThreadColor } from "../utils";
import type { FeedEntry } from "../types";

const RX = 4;
// Fixed per-thread column width. The parent panel sizes itself from
// the live thread count (see Dashboard), so FlowViz no longer needs a
// natural-width clamp or centering offset — columns are always rendered
// at this width and either fit the panel or overflow horizontally.
export const FIXED_THREAD_W = 90;
const FULL_NAME_THRESHOLD = 72;

interface FlowEvent {
  type: "llm_call" | "tool_call" | "human_message";
  eventIndex: number;
}
interface FlowStep {
  step_number: number;
  move: string;
  events: FlowEvent[];
}
interface FlowThread {
  id: string;
  status: string;
  steps: FlowStep[];
}

// Group flat feed entries into thread → step → events, in insertion order.
// Relies on backend feed_index ordering — no sorting, no timestamp math.
function deriveFlowThreads(entries: FeedEntry[]): FlowThread[] {
  const threads = new Map<string, FlowThread>();
  const stepIndex = new Map<string, Map<number, FlowStep>>();

  const ensureThread = (id: string): FlowThread | null => {
    if (!id) return null;
    let t = threads.get(id);
    if (!t) {
      t = { id, status: "running", steps: [] };
      threads.set(id, t);
      stepIndex.set(id, new Map());
    }
    return t;
  };

  const ensureStep = (
    t: FlowThread,
    stepNumber: number,
    move: string,
  ): FlowStep => {
    const cache = stepIndex.get(t.id)!;
    let step = cache.get(stepNumber);
    if (!step) {
      step = { step_number: stepNumber, move, events: [] };
      t.steps.push(step);
      cache.set(stepNumber, step);
    }
    return step;
  };

  for (const e of entries) {
    if (e.event_type === "thread_start") {
      const t = ensureThread(e.thread_id);
      if (t && e.thread_status) t.status = e.thread_status;
      continue;
    }
    if (e.event_type === "thread_resumed") {
      const t = ensureThread(e.thread_id);
      if (t) t.status = "running";
      continue;
    }
    if (e.event_type === "thread_complete") {
      const t = ensureThread(e.thread_id);
      if (t) t.status = "complete";
      continue;
    }
    if (e.event_type === "thread_waiting") {
      // Status alone — the "WT" end marker conveys waiting visually.
      // Don't materialize a WAITING_FOR_HUMAN step: thread_waiting's
      // step_number often collides with the last real step (e.g. a step
      // that errored out and triggered the waiting transition).
      const t = ensureThread(e.thread_id);
      if (t) t.status = "waiting";
      continue;
    }
    if (e.event_type === "step_start" && e.step_number !== undefined) {
      const t = ensureThread(e.thread_id);
      if (t) ensureStep(t, e.step_number, e.move ?? "");
      continue;
    }
    if (e.event_type === "human_message" && e.step_number !== undefined) {
      const t = ensureThread(e.thread_id);
      if (t) ensureStep(t, e.step_number, e.move ?? "HUMAN_INPUT");
      continue;
    }
    if (
      (e.event_type === "llm_call" || e.event_type === "tool_call") &&
      e.step_number !== undefined
    ) {
      const t = ensureThread(e.thread_id);
      if (!t) continue;
      const step = stepIndex.get(t.id)!.get(e.step_number);
      if (!step) continue;
      // Pull eventIndex from "ev:tid:N:I" so it matches the feed id.
      const parts = e.id.split(":");
      const eventIndex =
        parts[0] === "ev" ? Number(parts[3]) : step.events.length;
      step.events.push({ type: e.event_type, eventIndex });
    }
  }

  return Array.from(threads.values());
}

// Status-based fill for markers when thread is in a terminal/waiting state.
// Returns { bg, fg } for the rect + label.
function getStatusFill(
  status: string,
  isDark: boolean,
): { bg: string; fg: string } | null {
  if (status === "complete") {
    return isDark
      ? { bg: "#1f3520", fg: "#b6de8a" }
      : { bg: "#d8ecce", fg: "#254820" };
  }
  if (status === "waiting") {
    return isDark
      ? { bg: "#3a3a3a", fg: "#d0d0d0" }
      : { bg: "#e0e0e0", fg: "#444444" };
  }
  if (status === "error") {
    return isDark
      ? { bg: "#3d1e26", fg: "#f6909c" }
      : { bg: "#f5d2d8", fg: "#74212f" };
  }
  return null;
}

export const FlowViz: React.FC = () => {
  const selectedNode = useAtomValue(stateAtom).selectedNode;
  const feedEntries = useAtomValue(feedEntriesAtom);
  const selectNode = useSetAtom(selectNodeAtom);

  const flowThreads = useMemo(() => deriveFlowThreads(feedEntries), [feedEntries]);

  const scrollRef = useRef<HTMLDivElement>(null);

  const isDark = useColorModeValue(false, true);
  const selectedStroke = useColorModeValue("#000", "#fff");

  const layout = useMemo(() => {
    if (!flowThreads.length) return null;
    const threads = flowThreads;
    const n = threads.length;

    const threadW = FIXED_THREAD_W;
    const svgW = n * threadW + (n - 1) * THREAD_GAP;

    let maxH = 0;
    const columns = threads.map((thread, ti) => {
      const x = ti * (threadW + THREAD_GAP);
      let y = TOP_PAD;

      const startY = y;
      y += START_MARKER_H + STEP_GAP;

      const steps = thread.steps.map((step) => {
        const isHumanTouchpoint =
          step.move === "HUMAN_INPUT" || step.move === "WAITING_FOR_HUMAN";
        const stepY = y;
        y += STEP_H + STEP_GAP;
        const evtW = threadW * EVENT_WIDTH_RATIO;
        const evtX = x + (threadW - evtW) / 2;
        const events = step.events.map((evt) => {
          const eY = y;
          y += EVENT_H + EVENT_GAP;
          return { x: evtX, y: eY, w: evtW, h: EVENT_H, type: evt.type, eventIndex: evt.eventIndex };
        });
        y += STEP_GAP;
        return {
          x, y: stepY, w: threadW, h: STEP_H,
          stepNumber: step.step_number,
          move: step.move,
          isHumanTouchpoint,
          events,
        };
      });

      const showEnd = thread.status !== "running";
      const endY = y;
      if (showEnd) y += MARKER_H + STEP_GAP;

      if (y > maxH) maxH = y;
      return { threadId: thread.id, x, w: threadW, status: thread.status, startY, endY, showEnd, steps };
    });

    return { columns, svgW, svgH: maxH + TOP_PAD, threadW };
  }, [flowThreads]);

  const isSelected = useCallback(
    (type: string, threadId?: string, stepNumber?: number, eventIndex?: number): boolean => {
      if (!selectedNode || selectedNode.type !== type) return false;
      if (type === "session") return true;
      if (selectedNode.threadId !== threadId) return false;
      if (type === "thread" || type === "thread_end") return true;
      if (selectedNode.stepNumber !== stepNumber) return false;
      if (type === "step") return true;
      return selectedNode.eventIndex === eventIndex;
    },
    [selectedNode],
  );

  if (!layout) return null;

  const { columns, svgW, svgH, threadW } = layout;
  const useFullNames = threadW >= FULL_NAME_THRESHOLD;
  const threadIds = columns.map((c) => c.threadId);

  return (
    <Flex direction="column" w="100%" h="100%" minH={0}>
      <style>{`
        @keyframes flow-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
        .flow-pulse { animation: flow-pulse 2s ease-in-out infinite; }
      `}</style>

      <Box ref={scrollRef} flex={1} overflow="auto" px={2} minH={0}>
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ display: "block", userSelect: "none", overflow: "visible" }}
        >
          <defs>
            {/* Warm amber halo behind human-touchpoint steps so they
                read as "person in the loop" even at column widths where
                a label barely fits. */}
            <filter
              id="human-glow"
              x="-60%"
              y="-60%"
              width="220%"
              height="220%"
            >
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feFlood floodColor={isDark ? "#f0b95a" : "#d4912a"} floodOpacity="0.75" />
              <feComposite in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {columns.map((col) => {
            const threadColor = getThreadColor(col.threadId, threadIds, isDark);
            const startStatusFill = getStatusFill(col.status, isDark);
            const startFill = startStatusFill
              ? startStatusFill.bg
              : isDark ? "#2a2a2a" : "#f0f0f0";
            const startFg = startStatusFill
              ? startStatusFill.fg
              : threadColor;
            const startSel = isSelected("thread", col.threadId);

            return (
              <g key={col.threadId}>
                {/* Start marker — START label + thread ID stacked */}
                <rect
                  x={col.x}
                  y={col.startY}
                  width={col.w}
                  height={START_MARKER_H}
                  fill={startFill}
                  rx={RX}
                  stroke={startSel ? selectedStroke : "none"}
                  strokeWidth={startSel ? 1.5 : 0}
                  style={{ cursor: "pointer" }}
                  onClick={() => selectNode({ type: "thread", threadId: col.threadId })}
                />
                {col.w > 24 && (
                  <>
                    <text
                      x={col.x + col.w / 2}
                      y={col.startY + 13}
                      fill={startFg}
                      fontFamily="Poppins, sans-serif"
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{ pointerEvents: "none", fontSize: 11, fontWeight: 600 }}
                    >
                      START
                    </text>
                    <text
                      x={col.x + col.w / 2}
                      y={col.startY + 27}
                      fill={startFg}
                      fontFamily="Poppins, sans-serif"
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{ pointerEvents: "none", fontSize: 11, fontWeight: 600 }}
                    >
                      {col.threadId.slice(0, 6)}
                    </text>
                  </>
                )}

                {/* Steps */}
                {col.steps.map((step) => {
                  const sel = isSelected("step", col.threadId, step.stepNumber);
                  // Error overrides move color; waiting uses neutral gray
                  const moveColor =
                    col.status === "error"
                      ? getStatusFill("error", isDark)!
                      : getMoveColor(step.move, isDark);
                  const moveUp = (step.move ?? "").toUpperCase().replace(/_/g, " ");
                  const label = useFullNames
                    ? moveUp === "HUMAN INPUT" ? "HUMAN"
                      : moveUp === "WAITING FOR HUMAN" ? "WAITING"
                      : moveUp
                    : moveUp === "HUMAN INPUT" ? "HI"
                    : moveUp === "WAITING FOR HUMAN" ? "WH"
                    : moveUp.replace(/ /g, "").slice(0, 2);
                  const isRunningTip =
                    col.status === "running" && step === col.steps[col.steps.length - 1];
                  // Cap glow at one per column. When the thread is waiting,
                  // the WT end marker owns the glow; otherwise the last
                  // human-touchpoint step gets it.
                  const shouldGlow =
                    step.isHumanTouchpoint && col.status !== "waiting";

                  return (
                    <g key={`s-${step.stepNumber}`}>
                      <rect
                        x={step.x}
                        y={step.y}
                        width={step.w}
                        height={step.h}
                        fill={moveColor.bg}
                        rx={RX}
                        stroke={sel ? selectedStroke : "none"}
                        strokeWidth={sel ? 1.5 : 0}
                        filter={shouldGlow ? "url(#human-glow)" : undefined}
                        className={isRunningTip ? "flow-pulse" : undefined}
                        style={{ cursor: "pointer" }}
                        onClick={() => selectNode({ type: "step", threadId: col.threadId, stepNumber: step.stepNumber })}
                      />
                      {step.w > 22 && label ? (
                        <text
                          x={step.x + step.w / 2}
                          y={step.y + step.h / 2}
                          fill={moveColor.fg}
                          fontFamily="Poppins, sans-serif"
                          textAnchor="middle"
                          dominantBaseline="central"
                          style={{ pointerEvents: "none", fontSize: 11, fontWeight: 600 }}
                        >
                          {label}
                        </text>
                      ) : null}

                      {/* Events — colored by step's move */}
                      {step.events.map((evt) => {
                        const eSel = isSelected("event", col.threadId, step.stepNumber, evt.eventIndex);
                        const isHuman = evt.type === "human_message";
                        const opacity = isHuman ? 1 : evt.type === "tool_call" ? 0.75 : 0.55;
                        const fill = isHuman
                          ? (isDark ? "#d6c5a8" : "#7a5e2a")
                          : moveColor.bg;
                        const humanStroke = isDark ? "#f0e2c4" : "#5a4318";
                        return (
                          <rect
                            key={`e-${evt.eventIndex}`}
                            x={evt.x}
                            y={evt.y}
                            width={evt.w}
                            height={evt.h}
                            fill={fill}
                            opacity={opacity}
                            rx={2}
                            stroke={eSel ? selectedStroke : isHuman ? humanStroke : "none"}
                            strokeWidth={eSel ? 1 : isHuman ? 0.75 : 0}
                            style={{ cursor: "pointer" }}
                            onClick={() => selectNode({ type: "event", threadId: col.threadId, stepNumber: step.stepNumber, eventIndex: evt.eventIndex })}
                          />
                        );
                      })}
                    </g>
                  );
                })}

                {/* End marker */}
                {col.showEnd && (() => {
                  const endStatusFill = getStatusFill(col.status, isDark);
                  if (!endStatusFill) return null;
                  const endSel = isSelected("thread_end", col.threadId);
                  const needsHuman = col.status === "waiting";
                  const endLabel = useFullNames
                    ? col.status.toUpperCase()
                    : col.status === "complete" ? "OK"
                      : col.status === "waiting" ? "WT"
                      : col.status === "error" ? "ER"
                      : col.status.slice(0, 2).toUpperCase();
                  return (
                    <>
                      <rect
                        x={col.x}
                        y={col.endY}
                        width={col.w}
                        height={MARKER_H}
                        fill={endStatusFill.bg}
                        rx={RX}
                        stroke={endSel ? selectedStroke : "none"}
                        strokeWidth={endSel ? 1.5 : 0}
                        filter={needsHuman ? "url(#human-glow)" : undefined}
                        style={{ cursor: "pointer" }}
                        onClick={() => selectNode({ type: "thread_end", threadId: col.threadId, threadStatus: col.status })}
                      >
                        {needsHuman && (
                          <title>Waiting for your reply — click to focus the reply input</title>
                        )}
                      </rect>
                      {col.w > 22 && (
                        <text
                          x={col.x + col.w / 2}
                          y={col.endY + MARKER_H / 2}
                          fill={endStatusFill.fg}
                          fontFamily="Poppins, sans-serif"
                          textAnchor="middle"
                          dominantBaseline="central"
                          style={{ pointerEvents: "none", fontSize: 11, fontWeight: 600 }}
                        >
                          {endLabel}
                        </text>
                      )}
                    </>
                  );
                })()}
              </g>
            );
          })}
        </svg>
      </Box>

      {/* Legend — only shown when using abbreviations */}
      {!useFullNames && (
        <Flex
          px={2}
          py={1}
          gap={4}
          flexWrap="wrap"
          borderTop="1px solid"
          borderColor="gray.subtle"
          bg="bg"
          flexShrink={0}
        >
          {[
            ["SC", "Scope"], ["FO", "Forage"], ["FR", "Frame"],
            ["IN", "Interrogate"], ["SY", "Synthesize"],
            ["HI", "Human Input"], ["WH", "Wait/Human"],
            ["OK", "Complete"], ["WT", "Waiting"], ["ER", "Error"],
          ].map(([abbr, label]) => (
            <Text key={abbr} fontSize="2xs" fontFamily="mono" color="fg.muted" lineHeight="1.2">
              <Text as="span" fontWeight="bold" color="fg.subtle">{abbr}</Text> {label}
            </Text>
          ))}
        </Flex>
      )}
    </Flex>
  );
};

// --- Replay button (rendered in the FlowViz panel header) ---
//
// Animates a saved feed back through the same atoms the live SSE uses,
// so the viewer can see the graph + feed + cost chip filling in as if
// the session were running right now.
//
// Total replay duration is targeted at ~REPLAY_TARGET_MS — per-entry
// delays scale from the real timestamp deltas, clamped so single-tick
// bursts (synthesized rows that share a timestamp) don't fire faster
// than the browser can paint and long LLM pauses don't stall the demo.

const REPLAY_TARGET_MS = 45_000;
const REPLAY_MIN_STEP_MS = 30;
const REPLAY_MAX_STEP_MS = 1200;

export const ReplayButton: React.FC = () => {
  const entries = useAtomValue(allFeedEntriesAtom);
  const [cursor, setCursor] = useAtom(replayCursorAtom);
  const mode = useAtomValue(stateAtom).mode;
  const isDark = useColorModeValue(false, true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up the timer on unmount or when entries change underneath us.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // Stop any in-flight replay if the underlying entries change (new session loaded).
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [entries]);

  if (mode !== "saved" || entries.length === 0) return null;

  const total = entries.length;
  const playing = cursor !== null && cursor < total;
  const done = cursor !== null && cursor >= total;

  const stop = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCursor(null);
  };

  const start = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const first = entries[0]?.timestamp ?? 0;
    const last = entries[entries.length - 1]?.timestamp ?? first;
    const totalDeltaMs = Math.max(1, (last - first) * 1000);
    const scale = REPLAY_TARGET_MS / totalDeltaMs;

    setCursor(0);
    let i = 0;
    const tick = () => {
      i += 1;
      setCursor(i);
      if (i >= total) {
        timerRef.current = null;
        return;
      }
      const dtMs = Math.max(0, (entries[i].timestamp - entries[i - 1].timestamp) * 1000);
      const delay = Math.max(
        REPLAY_MIN_STEP_MS,
        Math.min(REPLAY_MAX_STEP_MS, dtMs * scale),
      );
      timerRef.current = setTimeout(tick, delay);
    };
    timerRef.current = setTimeout(tick, 100);
  };

  const onClick = playing ? stop : start;
  const Icon = playing ? LuSquare : done ? LuRotateCcw : LuPlay;
  const label = playing
    ? `stop (${cursor}/${total})`
    : done
      ? "replay again"
      : "replay";

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
      color={playing ? "fg" : "fg.muted"}
      borderRadius="3px"
      cursor="pointer"
      _hover={{
        color: "fg",
        bg: isDark ? "whiteAlpha.100" : "blackAlpha.50",
      }}
      aria-label={playing ? "Stop replay" : done ? "Replay again" : "Replay session"}
      title={
        playing
          ? "Stop playback — restores the full feed"
          : "Replay this saved session as if it were streaming live"
      }
      onClick={onClick}
    >
      <Icon size={11} />
      {label}
    </Box>
  );
};
