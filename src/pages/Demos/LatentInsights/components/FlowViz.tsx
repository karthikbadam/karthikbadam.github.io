import { Box } from "@chakra-ui/react";
import React, { useMemo, useCallback, useRef, useEffect, useState } from "react";
import { useColorModeValue } from "../../../../components/ui/color-mode";
import { useLatentInsights } from "../../../../contexts/LatentInsightsContext";
import { SelectedNode } from "../types";

const STEP_H = 14;
const STEP_GAP = 2;
const EVENT_H = 8;
const EVENT_GAP = 1;
const EVENT_WIDTH_RATIO = 0.55;
const THREAD_GAP = 8;
const SESSION_H = 20;
const TOP_PAD = 4;
const MARKER_H = 12;

const MOVE_ABBR: Record<string, string> = {
  SCOPE: "SC",
  FORAGE: "FO",
  FRAME: "FR",
  INTERROGATE: "IN",
  SYNTHESIZE: "SY",
};

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
  const textColor = useColorModeValue("#222", "#ddd");
  const sessionFill = useColorModeValue("#d8d8d8", "#2e2e2e");
  const selectedStroke = useColorModeValue("#000", "#fff");

  const stepFill = useCallback(
    (status: string) => {
      if (status === "waiting") return isDark ? "#3a4a5a" : "#d0dae8";
      if (status === "error") return isDark ? "#4a3a3a" : "#e0d0d0";
      if (status === "running") return isDark ? "#4a4a4a" : "#ccc";
      return isDark ? "#505050" : "#bbb";
    },
    [isDark]
  );

  const markerFill = useCallback(
    (status: string, isEnd: boolean) => {
      if (status === "waiting") return isDark ? (isEnd ? "#3a4a5a" : "#344858") : (isEnd ? "#d0dae8" : "#dce4f0");
      if (status === "error") return isDark ? (isEnd ? "#6a3a3a" : "#583434") : (isEnd ? "#e0c0c0" : "#ecd4d4");
      if (status === "complete") return isDark ? (isEnd ? "#4a6a4a" : "#3e5a3e") : (isEnd ? "#b0d0b0" : "#c4dcc4");
      return isDark ? (isEnd ? "#4a4a4a" : "#444") : (isEnd ? "#ccc" : "#d4d4d4");
    },
    [isDark]
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
    [isDark]
  );

  const layout = useMemo(() => {
    if (!session || !session.threads) return null;
    const threads = session.threads;
    const threadCount = threads.length;
    if (threadCount === 0) return null;

    const totalGaps = (threadCount - 1) * THREAD_GAP;
    const threadW = Math.max(8, (containerWidth - totalGaps) / threadCount);

    let maxColH = 0;

    const columns = threads.map((thread, ti) => {
      const x = ti * (threadW + THREAD_GAP);
      let y = SESSION_H + TOP_PAD;

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

        y += 1;

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

    const svgH = Math.max(maxColH + 8, SESSION_H + 40);
    return { columns, svgW: containerWidth, svgH, threadW };
  }, [session, containerWidth]);

  const handleClick = useCallback(
    (node: SelectedNode) => {
      selectNode(node);
    },
    [selectNode]
  );

  const isSelected = useCallback(
    (type: string, threadId?: string, stepNumber?: number, eventIndex?: number): boolean => {
      if (!selectedNode) return false;
      if (selectedNode.type !== type) return false;
      if (type === "session") return true;
      if (selectedNode.threadId !== threadId) return false;
      if (type === "thread" || type === "thread_end") return true;
      if (selectedNode.stepNumber !== stepNumber) return false;
      if (type === "step") return true;
      return selectedNode.eventIndex === eventIndex;
    },
    [selectedNode]
  );

  if (!session || !layout) return null;

  const { columns, svgW, svgH } = layout;

  return (
    <Box ref={containerRef} position="relative" w="100%" h="100%" overflow="auto">
      <style>{`
        @keyframes flow-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.65; }
        }
        .flow-pulse { animation: flow-pulse 2s ease-in-out infinite; }
      `}</style>
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ display: "block", background: "transparent", userSelect: "none" }}
      >
        {/* Session root */}
        <rect
          x={0}
          y={0}
          width={svgW}
          height={SESSION_H}
          fill={sessionFill}
          rx={2}
          style={{ cursor: "pointer" }}
          onClick={() => handleClick({ type: "session" })}
        />
        <text
          x={4}
          y={SESSION_H / 2}
          fill={textColor}
          fontSize={5.5}
          fontFamily="monospace"
          dominantBaseline="central"
          style={{ pointerEvents: "none", opacity: 0.8 }}
        >
          {session.dataset_path.split("/").pop()} — {session.threads.length} threads
        </text>

        {/* Thread columns */}
        {columns.map((col) => (
          <g key={col.threadId}>
            {/* Thread start marker */}
            {(() => {
              const startSel = isSelected("thread", col.threadId);
              return (
                <>
                  <rect
                    x={col.x}
                    y={col.startY}
                    width={col.w}
                    height={MARKER_H}
                    fill={markerFill(col.status, false)}
                    rx={1}
                    stroke={startSel ? selectedStroke : "none"}
                    strokeWidth={startSel ? 1.5 : 0}
                    style={{ cursor: "pointer" }}
                    onClick={() => handleClick({ type: "thread", threadId: col.threadId })}
                  />
                  {col.w > 14 && (
                    <text
                      x={col.x + col.w / 2}
                      y={col.startY + MARKER_H / 2}
                      fill={textColor}
                      fontSize={5}
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{ pointerEvents: "none", opacity: 0.7 }}
                    >
                      ST
                    </text>
                  )}
                </>
              );
            })()}

            {col.steps.map((step) => {
              const sel = isSelected("step", col.threadId, step.stepNumber);
              const abbr = MOVE_ABBR[step.move] || step.move?.slice(0, 2) || "";
              return (
                <g key={`s-${step.stepNumber}`}>
                  <rect
                    x={step.x}
                    y={step.y}
                    width={step.w}
                    height={step.h}
                    fill={stepFill(step.status)}
                    rx={1}
                    stroke={sel ? selectedStroke : "none"}
                    strokeWidth={sel ? 1.5 : 0}
                    className={step.status === "running" ? "flow-pulse" : undefined}
                    style={{ cursor: "pointer" }}
                    onClick={() =>
                      handleClick({
                        type: "step",
                        threadId: col.threadId,
                        stepNumber: step.stepNumber,
                      })
                    }
                  />
                  {step.w > 14 && (
                    <text
                      x={step.x + step.w / 2}
                      y={step.y + step.h / 2}
                      fill={textColor}
                      fontSize={5}
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{ pointerEvents: "none", opacity: 0.7 }}
                    >
                      {abbr}
                    </text>
                  )}

                  {/* Event rectangles */}
                  {step.events.map((evt) => {
                    const eSel = isSelected(
                      "event",
                      col.threadId,
                      step.stepNumber,
                      evt.eventIndex
                    );
                    return (
                      <rect
                        key={`e-${evt.eventIndex}`}
                        x={evt.x}
                        y={evt.y}
                        width={evt.w}
                        height={evt.h}
                        fill={eventFill(evt.type, evt.threadStatus)}
                        rx={1}
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

            {/* Thread end marker (hidden for running threads) */}
            {col.showEnd && (() => {
              const endSel = isSelected("thread_end", col.threadId);
              const endLabel = col.status === "complete" ? "OK"
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
                    rx={1}
                    stroke={endSel ? selectedStroke : "none"}
                    strokeWidth={endSel ? 1.5 : 0}
                    style={{ cursor: "pointer" }}
                    onClick={() => handleClick({ type: "thread_end", threadId: col.threadId, threadStatus: col.status })}
                  />
                  {col.w > 14 && (
                    <text
                      x={col.x + col.w / 2}
                      y={col.endY + MARKER_H / 2}
                      fill={textColor}
                      fontSize={5}
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{ pointerEvents: "none", opacity: 0.7 }}
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
  );
};
