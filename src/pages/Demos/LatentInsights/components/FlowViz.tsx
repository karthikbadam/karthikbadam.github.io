import { Box, Flex, Text } from "@chakra-ui/react";
import React, { useMemo, useCallback, useRef, useEffect, useState } from "react";
import { useColorModeValue } from "../../../../components/ui/color-mode";
import { useLatentInsights } from "../../../../contexts/LatentInsightsContext";
import { SelectedNode } from "../types";
import {
  STEP_H,
  STEP_GAP,
  EVENT_H,
  EVENT_GAP,
  EVENT_WIDTH_RATIO,
  THREAD_GAP,
  TOP_PAD,
  MARKER_H,
  START_MARKER_H,
} from "../config";
import { getMoveColor, getThreadColor } from "../utils";

const RX = 3;
const MIN_THREAD_W = 40;
const MAX_THREAD_W = 110;
const FULL_NAME_THRESHOLD = 72;

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
  const { state, selectNode } = useLatentInsights();
  const { session, selectedNode } = state;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(400);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isDark = useColorModeValue(false, true);
  const selectedStroke = useColorModeValue("#000", "#fff");

  const layout = useMemo(() => {
    if (!session?.threads?.length) return null;
    const threads = session.threads;
    const n = threads.length;

    const totalGaps = (n - 1) * THREAD_GAP;
    const natural = (containerWidth - totalGaps) / n;
    const threadW = Math.max(MIN_THREAD_W, Math.min(natural, MAX_THREAD_W));
    const usedW = n * threadW + totalGaps;
    const svgW = Math.max(containerWidth, usedW);
    const xOffset = usedW >= containerWidth ? 0 : (containerWidth - usedW) / 2;

    let maxH = 0;
    const columns = threads.map((thread, ti) => {
      const x = xOffset + ti * (threadW + THREAD_GAP);
      let y = TOP_PAD;

      const startY = y;
      y += START_MARKER_H + STEP_GAP;

      const steps = thread.steps.map((step) => {
        const stepY = y;
        y += STEP_H + STEP_GAP;
        const evtW = threadW * EVENT_WIDTH_RATIO;
        const evtX = x + (threadW - evtW) / 2;
        const events = step.events.map((evt, ei) => {
          const eY = y;
          y += EVENT_H + EVENT_GAP;
          return { x: evtX, y: eY, w: evtW, h: EVENT_H, type: evt.type, eventIndex: ei };
        });
        y += STEP_GAP;
        return {
          x, y: stepY, w: threadW, h: STEP_H,
          stepNumber: step.step_number,
          move: step.move,
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
  }, [session, containerWidth]);

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

  if (!session || !layout) return null;

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
          style={{ display: "block", userSelect: "none" }}
        >
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
                  const label = useFullNames
                    ? (step.move || "").toUpperCase()
                    : (step.move || "").toUpperCase().slice(0, 2);

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
                        className={col.status === "running" && step === col.steps[col.steps.length - 1] ? "flow-pulse" : undefined}
                        style={{ cursor: "pointer" }}
                        onClick={() => selectNode({ type: "step", threadId: col.threadId, stepNumber: step.stepNumber })}
                      />
                      {step.w > 22 && label && (
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
                      )}

                      {/* Events — colored by step's move */}
                      {step.events.map((evt) => {
                        const eSel = isSelected("event", col.threadId, step.stepNumber, evt.eventIndex);
                        return (
                          <rect
                            key={`e-${evt.eventIndex}`}
                            x={evt.x}
                            y={evt.y}
                            width={evt.w}
                            height={evt.h}
                            fill={moveColor.bg}
                            opacity={evt.type === "tool_call" ? 0.75 : 0.55}
                            rx={2}
                            stroke={eSel ? selectedStroke : "none"}
                            strokeWidth={eSel ? 1 : 0}
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
                        style={{ cursor: "pointer" }}
                        onClick={() => selectNode({ type: "thread_end", threadId: col.threadId, threadStatus: col.status })}
                      />
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
          gap={3}
          flexWrap="wrap"
          borderTop="1px solid"
          borderColor="gray.subtle"
          bg="bg.panel"
          flexShrink={0}
        >
          {[
            ["SC", "Scope"], ["FO", "Forage"], ["FR", "Frame"],
            ["IN", "Interrogate"], ["SY", "Synthesize"],
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
