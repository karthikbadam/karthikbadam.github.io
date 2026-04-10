import { Box, Flex, Text } from "@chakra-ui/react";
import React, {
  useMemo,
  useCallback,
  useRef,
  useEffect,
  useState,
} from "react";
import { useColorModeValue } from "../../../../components/ui/color-mode";
import { useLatentInsights } from "../../../../contexts/LatentInsightsContext";
import { SelectedNode } from "../types";
import { getThreadColor } from "../utils";
import {
  STEP_H,
  STEP_GAP,
  EVENT_H,
  EVENT_GAP,
  EVENT_WIDTH_RATIO,
  THREAD_GAP,
  TOP_PAD,
  MARKER_H,
  MOVE_COLORS_DARK,
  MOVE_COLORS_LIGHT,
} from "../config";

const RX = 3;
const MAX_THREAD_W = 100;
const MIN_THREAD_W = 32;

const MOVE_FULL: Record<string, string> = {
  SCOPE: "Scope",
  FORAGE: "Forage",
  FRAME: "Frame",
  INTERROGATE: "Interrogate",
  SYNTHESIZE: "Synthesize",
  ERROR: "Error",
  UNKNOWN: "",
};

function moveLabel(move: string | undefined, wide: boolean): string {
  if (!move) return "";
  const upper = move.toUpperCase();
  if (wide) return MOVE_FULL[upper] || upper;
  const ABBR: Record<string, string> = {
    SCOPE: "SC", FORAGE: "FO", FRAME: "FR",
    INTERROGATE: "IN", SYNTHESIZE: "SY", ERROR: "ER", UNKNOWN: "??",
  };
  return ABBR[upper] || upper.slice(0, 2);
}

export const FlowViz: React.FC = () => {
  const { state, selectNode } = useLatentInsights();
  const { session, selectedNode } = state;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(400);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isDark = useColorModeValue(false, true);
  const textColor = useColorModeValue("#000", "#fff");
  const selectedStroke = useColorModeValue("#000", "#fff");

  const moveColors = isDark ? MOVE_COLORS_DARK : MOVE_COLORS_LIGHT;

  const stepFill = useCallback(
    (move: string | undefined, status: string) => {
      // Error overrides move color
      if (status === "error") return isDark ? "#4a3a3a" : "#e0d0d0";
      // Use move color if available
      const upper = move?.toUpperCase();
      if (upper && moveColors[upper]) {
        return moveColors[upper].bg.replace(/[\d.]+\)$/, "0.35)");
      }
      // Fallback: subdued gray by status
      if (status === "running") return isDark ? "#4a4a4a" : "#ccc";
      return isDark ? "#505050" : "#bbb";
    },
    [isDark, moveColors],
  );

  const stepStroke = useCallback(
    (move: string | undefined) => {
      const upper = move?.toUpperCase();
      if (upper && moveColors[upper]) return moveColors[upper].fg;
      return "none";
    },
    [moveColors],
  );

  const markerFill = useCallback(
    (status: string, isEnd: boolean) => {
      if (status === "waiting")
        return isDark
          ? isEnd ? "#3a4a5a" : "#344858"
          : isEnd ? "#d0dae8" : "#dce4f0";
      if (status === "error")
        return isDark
          ? isEnd ? "#6a3a3a" : "#583434"
          : isEnd ? "#e0c0c0" : "#ecd4d4";
      if (status === "complete")
        return isDark
          ? isEnd ? "#4a6a4a" : "#3e5a3e"
          : isEnd ? "#b0d0b0" : "#c4dcc4";
      return isDark ? (isEnd ? "#4a4a4a" : "#444") : isEnd ? "#ccc" : "#d4d4d4";
    },
    [isDark],
  );

  const eventFill = useCallback(
    (evtType: string, threadStatus: string) => {
      if (threadStatus === "waiting") {
        return evtType === "tool_call"
          ? isDark ? "#4a5a6a" : "#c0d0e0"
          : isDark ? "#3a4a58" : "#d0d8e8";
      }
      return evtType === "tool_call"
        ? isDark ? "#666" : "#a8a8a8"
        : isDark ? "#5a5a5a" : "#b8b8b8";
    },
    [isDark],
  );

  const layout = useMemo(() => {
    if (!session || !session.threads) return null;
    const threads = session.threads;
    const threadCount = threads.length;
    if (threadCount === 0) return null;

    const totalGaps = (threadCount - 1) * THREAD_GAP;
    const naturalW = (containerWidth - totalGaps) / threadCount;
    const threadW = Math.max(MIN_THREAD_W, Math.min(naturalW, MAX_THREAD_W));
    const usedW = threadCount * threadW + totalGaps;
    // If columns are wider than container (small screen), svg extends to full
    // usedW so the parent can horizontally scroll. Otherwise center.
    const svgWFinal = Math.max(containerWidth, usedW);
    const xOffset = usedW >= containerWidth ? 0 : (containerWidth - usedW) / 2;

    let maxColH = 0;

    const columns = threads.map((thread, ti) => {
      const x = xOffset + ti * (threadW + THREAD_GAP);
      let y = TOP_PAD;

      const startY = y;
      y += MARKER_H + STEP_GAP;

      const steps = thread.steps.map((step) => {
        const stepY = y;
        y += STEP_H + STEP_GAP;

        const evtW = threadW * EVENT_WIDTH_RATIO;
        const evtX = x + (threadW - evtW) / 2;
        const events = step.events.map((evt, ei) => {
          const eY = y;
          y += EVENT_H + EVENT_GAP;
          return {
            x: evtX,
            y: eY,
            w: evtW,
            h: EVENT_H,
            type: evt.type,
            eventIndex: ei,
            threadStatus: thread.status,
          };
        });

        y += STEP_GAP;

        return {
          x,
          y: stepY,
          w: threadW,
          h: STEP_H,
          stepNumber: step.step_number,
          move: step.move,
          status: thread.status,
          events,
        };
      });

      const showEnd = thread.status !== "running";
      const endY = y;
      if (showEnd) y += MARKER_H + STEP_GAP;

      if (y > maxColH) maxColH = y;

      return {
        threadId: thread.id,
        x,
        w: threadW,
        status: thread.status,
        question: thread.seed_question,
        startY,
        endY,
        showEnd,
        steps,
      };
    });

    const svgH = maxColH + TOP_PAD;
    return { columns, svgW: svgWFinal, svgH, threadW };
  }, [session, containerWidth]);

  const handleClick = useCallback(
    (node: SelectedNode) => {
      selectNode(node);
    },
    [selectNode],
  );

  const isSelected = useCallback(
    (
      type: string,
      threadId?: string,
      stepNumber?: number,
      eventIndex?: number,
    ): boolean => {
      if (!selectedNode) return false;
      if (selectedNode.type !== type) return false;
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
  const useFullNames = threadW >= 60;

  return (
    <Flex
      ref={containerRef}
      direction="column"
      w="100%"
      h="100%"
      minH={0}
    >
      <style>{`
        @keyframes flow-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.65; }
        }
        .flow-pulse { animation: flow-pulse 2s ease-in-out infinite; }
      `}</style>

      {/* Scrollable SVG area */}
      <Box flex={1} overflow="auto" px={2} minH={0}>
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{
            display: "block",
            background: "transparent",
            userSelect: "none",
          }}
        >
          {columns.map((col, ci) => (
            <g key={col.threadId}>
              {(() => {
                const startSel = isSelected("thread", col.threadId);
                const threadIdColor = getThreadColor(
                  col.threadId,
                  columns.map((c) => c.threadId),
                  isDark,
                );
                const showTid = col.w >= 60;
                return (
                  <>
                    <rect
                      x={col.x}
                      y={col.startY}
                      width={col.w}
                      height={MARKER_H}
                      fill={markerFill(col.status, false)}
                      rx={RX}
                      stroke={startSel ? selectedStroke : threadIdColor}
                      strokeWidth={startSel ? 1.5 : 1}
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        handleClick({ type: "thread", threadId: col.threadId })
                      }
                    />
                    {col.w > 18 && (
                      <text
                        x={col.x + col.w / 2}
                        y={col.startY + MARKER_H / 2}
                        fill={textColor}
                        fontFamily="monospace"
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{ pointerEvents: "none", fontSize: 10 }}
                      >
                        {showTid ? col.threadId.slice(0, 6) : useFullNames ? "Start" : "ST"}
                      </text>
                    )}
                  </>
                );
              })()}

              {col.steps.map((step) => {
                const sel = isSelected("step", col.threadId, step.stepNumber);
                const label = moveLabel(step.move, useFullNames);
                const moveUpper = step.move?.toUpperCase();
                const moveColor = moveUpper ? moveColors[moveUpper] : undefined;
                const stepTextColor = moveColor?.fg || textColor;
                return (
                  <g key={`s-${step.stepNumber}`}>
                    <rect
                      x={step.x}
                      y={step.y}
                      width={step.w}
                      height={step.h}
                      fill={stepFill(step.move, step.status)}
                      rx={RX}
                      stroke={sel ? selectedStroke : stepStroke(step.move)}
                      strokeWidth={sel ? 1.5 : moveColor ? 0.5 : 0}
                      className={
                        step.status === "running" ? "flow-pulse" : undefined
                      }
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        handleClick({
                          type: "step",
                          threadId: col.threadId,
                          stepNumber: step.stepNumber,
                        })
                      }
                    />
                    {step.w > 18 && label && (
                      <text
                        x={step.x + step.w / 2}
                        y={step.y + step.h / 2}
                        fill={stepTextColor}
                        fontFamily="monospace"
                        fontWeight="600"
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{ pointerEvents: "none", fontSize: 10 }}
                      >
                        {label}
                      </text>
                    )}

                    {step.events.map((evt) => {
                      const eSel = isSelected(
                        "event",
                        col.threadId,
                        step.stepNumber,
                        evt.eventIndex,
                      );
                      return (
                        <rect
                          key={`e-${evt.eventIndex}`}
                          x={evt.x}
                          y={evt.y}
                          width={evt.w}
                          height={evt.h}
                          fill={eventFill(evt.type, evt.threadStatus)}
                          rx={2}
                          stroke={eSel ? selectedStroke : "none"}
                          strokeWidth={eSel ? 1 : 0}
                          style={{ cursor: "pointer" }}
                          onClick={() =>
                            handleClick({
                              type: "event",
                              threadId: col.threadId,
                              stepNumber: step.stepNumber,
                              eventIndex: evt.eventIndex,
                            })
                          }
                        />
                      );
                    })}
                  </g>
                );
              })}

              {col.showEnd &&
                (() => {
                  const endSel = isSelected("thread_end", col.threadId);
                  const endLabel = useFullNames
                    ? col.status === "complete" ? "Complete"
                      : col.status === "waiting" ? "Waiting"
                      : col.status === "error" ? "Error"
                      : col.status
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
                        fill={markerFill(col.status, true)}
                        rx={RX}
                        stroke={endSel ? selectedStroke : "none"}
                        strokeWidth={endSel ? 1.5 : 0}
                        style={{ cursor: "pointer" }}
                        onClick={() =>
                          handleClick({
                            type: "thread_end",
                            threadId: col.threadId,
                            threadStatus: col.status,
                          })
                        }
                      />
                      {col.w > 18 && (
                        <text
                          x={col.x + col.w / 2}
                          y={col.endY + MARKER_H / 2}
                          fill={textColor}
                          fontFamily="monospace"
                          textAnchor="middle"
                          dominantBaseline="central"
                          style={{ pointerEvents: "none", fontSize: 10 }}
                        >
                          {endLabel}
                        </text>
                      )}
                    </>
                  );
                })()}
            </g>
          ))}
        </svg>
      </Box>

      {/* Legend — fixed at bottom, hidden when full move names are visible */}
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
          ["ST", "Start"],
          ["SC", "Scope"],
          ["FO", "Forage"],
          ["FR", "Frame"],
          ["IN", "Interrogate"],
          ["SY", "Synthesize"],
          ["OK", "Complete"],
          ["WT", "Waiting"],
          ["ER", "Error"],
        ].map(([abbr, label]) => (
          <Text
            key={abbr}
            fontSize="2xs"
            fontFamily="mono"
            color="fg.muted"
            lineHeight="1.2"
          >
            <Text as="span" fontWeight="bold" color="fg.subtle">
              {abbr}
            </Text>{" "}
            {label}
          </Text>
        ))}
      </Flex>
      )}
    </Flex>
  );
};
