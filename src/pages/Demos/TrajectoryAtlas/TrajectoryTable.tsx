// Trajectory Atlas — TrajectoryTable. Wraps the @any_table/react useTable
// hook against the same DuckDB Mosaic coordinator the icicle and sankey
// use. Row click highlights the trajectory's path in the icicle / sankey
// (charts treat highlightedTrajIds as a dimming hint — they do not filter).
// The trailing chevron button opens the DetailPanel drawer.

import {
  MosaicProvider,
  Table,
  useTable,
  type ColumnDef,
} from "@any_table/react";
import { Box, IconButton, Text } from "@chakra-ui/react";
import type { Selection as VgSelection } from "@uwdata/mosaic-core";
import { useCallback, useMemo, useRef } from "react";
import { LuChevronRight } from "react-icons/lu";
import { asArray, asStringList } from "../../../components/chartUtils";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { OutcomeBadge } from "./OutcomeBadge";
import { StepPath } from "./StepPath";
import type { Category, Outcome, Step, Trajectory } from "./types";

interface ColMeta {
  key: string;
  label: string;
  align?: "left" | "right";
}

// Synthetic column for the row-action button. Width carved out at render time;
// no parquet column maps to it.
const DETAIL_COLUMN = "__detail__";

const COLUMNS: ColumnDef[] = [
  { key: "id", width: "8.5rem" },
  { key: "task", flex: 1, minWidth: "12rem" },
  { key: "model", width: "11rem" },
  { key: "step_count", width: "4.5rem" },
  { key: "step_tools_str", width: "16rem" },
  { key: "outcome", width: "6rem" },
  { key: "tokens", width: "5rem" },
  { key: "reward", width: "5rem" },
  { key: DETAIL_COLUMN, width: "2.5rem" },
];

const COL_META: Record<string, ColMeta> = {
  id: { key: "id", label: "ID" },
  task: { key: "task", label: "Task" },
  model: { key: "model", label: "Model" },
  step_count: { key: "step_count", label: "Steps", align: "right" },
  step_tools_str: { key: "step_tools_str", label: "Path" },
  outcome: { key: "outcome", label: "Outcome" },
  tokens: { key: "tokens", label: "Tokens", align: "right" },
  reward: { key: "reward", label: "Reward", align: "right" },
  [DETAIL_COLUMN]: { key: DETAIL_COLUMN, label: "" },
};

// AnyTable's VisibleRow exposes `.data` as `RowRecord | null`. Pull the
// trajectory id off it without sprinkling casts everywhere.
function rowId(row: { data: unknown }): string {
  const data = row.data as Record<string, unknown> | null;
  return data ? String(data.id ?? "") : "";
}

export function TrajectoryTable() {
  const { coordinator } = useTrajectoryAtlas();
  if (!coordinator) return null;
  return (
    <MosaicProvider coordinator={coordinator}>
      <TrajectoryTableInner />
    </MosaicProvider>
  );
}

function TrajectoryTableInner() {
  const {
    coordinator,
    crossfilter,
    highlightedTrajId,
    setHighlightedTrajId,
    setRowSelection,
  } = useTrajectoryAtlas();
  const containerRef = useRef<HTMLDivElement>(null);

  const filter = useMemo(() => crossfilter ?? undefined, [crossfilter]);

  const onSelectionChange = useCallback(
    (selected: Set<string>) => {
      const id = selected.values().next().value as string | undefined;
      setHighlightedTrajId(id ?? null);
    },
    [setHighlightedTrajId],
  );

  const selectedSet = useMemo(
    () =>
      highlightedTrajId ? new Set([highlightedTrajId]) : new Set<string>(),
    [highlightedTrajId],
  );

  const table = useTable({
    table: "trajectories",
    columns: COLUMNS,
    rowKey: "id",
    filter: filter as VgSelection | undefined,
    containerRef,
    selection: { mode: "single", selected: selectedSet, onSelectionChange },
    rowHeightConfig: { numLines: 2, padding: "8px" },
  });

  const toggleRow = useCallback(
    (id: string) => {
      if (!id) return;
      setHighlightedTrajId(highlightedTrajId === id ? null : id);
    },
    [highlightedTrajId, setHighlightedTrajId],
  );

  const openDetail = useCallback(
    (id: string) => {
      if (!id || !coordinator) return;
      const escaped = id.replace(/'/g, "''");
      coordinator
        .query(`SELECT * FROM trajectories WHERE id = '${escaped}' LIMIT 1`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((res: any) => {
          const arr = res?.toArray?.() ?? [];
          if (!arr.length) return;
          setRowSelection(toTrajectory(arr[0]));
        })
        .catch((err: unknown) =>
          console.error("[TrajectoryTable] detail query failed:", err),
        );
    },
    [coordinator, setRowSelection],
  );

  return (
    <Box
      ref={containerRef}
      position="relative"
      w="100%"
      maxH={{ base: "35vh", md: "auto" }}
      overflow="hidden"
      bg="bg"
      borderRadius="md"
      fontSize="sm"
      color="fg"
    >
      <Table.Root {...table.rootProps}>
        <Table.Header
          style={{
            height: 18,
            fontSize: "0.8rem",
            background: "var(--chakra-colors-bg)",
            borderBottom: "1px solid var(--chakra-colors-gray-subtle)",
            flex: "0 0 auto",
          }}
        >
          {({ columns: cols }) =>
            cols.map((col) => {
              const meta = COL_META[col.key];
              return (
                <Table.HeaderCell
                  key={col.key}
                  column={col.key}
                  style={{
                    padding: "0 8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent:
                      meta?.align === "right" ? "flex-end" : "flex-start",
                    cursor: "pointer",
                  }}
                >
                  <Table.SortTrigger column={col.key}>
                    <span>{meta?.label ?? col.key}</span>
                  </Table.SortTrigger>
                </Table.HeaderCell>
              );
            })
          }
        </Table.Header>

        <Table.Viewport>
          {({ rows }) =>
            rows.map((row) => (
              <Table.Row
                key={row.key}
                row={row}
                style={{
                  borderBottom: "1px solid var(--chakra-colors-bg-subtle)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {({ cells }) =>
                  cells.map((cell) => {
                    if (cell.column === DETAIL_COLUMN) {
                      return (
                        <Table.Cell
                          key={cell.column}
                          column={cell.column}
                          width={cell.width}
                          offset={cell.offset}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            padding: "0 4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <IconButton
                            size="2xs"
                            variant="ghost"
                            aria-label="Open detail"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetail(rowId(row));
                            }}
                          >
                            <LuChevronRight />
                          </IconButton>
                        </Table.Cell>
                      );
                    }
                    const meta = COL_META[cell.column];
                    const isTask = cell.column === "task";
                    return (
                      <Table.Cell
                        key={cell.column}
                        column={cell.column}
                        width={cell.width}
                        offset={cell.offset}
                        onClick={() => toggleRow(rowId(row))}
                        style={{
                          padding: "0px 12px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent:
                            meta?.align === "right" ? "flex-end" : "flex-start",
                          whiteSpace: isTask ? "normal" : "nowrap",
                          overflow: "hidden",
                          textOverflow: isTask ? undefined : "ellipsis",
                        }}
                      >
                        {renderCell(cell.column, cell.value)}
                      </Table.Cell>
                    );
                  })
                }
              </Table.Row>
            ))
          }
        </Table.Viewport>
      </Table.Root>
    </Box>
  );
}

function renderCell(column: string, value: unknown): React.ReactNode {
  if (value == null) return "";
  switch (column) {
    case "task":
      return <Text lineClamp={2}>{String(value)}</Text>;
    case "step_tools_str":
      return <StepPath value={String(value ?? "")} />;
    case "step_tools":
      return <StepPath value={asStringList(value).join(",")} />;
    case "steps": {
      const steps = asStepList(value);
      return <StepPath value={steps.map((s) => s.name || s.tool).join(",")} />;
    }
    case "outcome":
      return <OutcomeBadge outcome={String(value ?? "fail") as Outcome} />;
    case "tokens": {
      const t = Number(value ?? 0);
      if (t < 1000) return String(t);
      if (t < 1_000_000) return `${(t / 1000).toFixed(1)}k`;
      return `${(t / 1_000_000).toFixed(2)}M`;
    }
    case "reward":
      return Number(value).toFixed(2);
    case "step_count":
      return String(value);
    default:
      return String(value);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toTrajectory(row: any): Trajectory {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    dataset: String(r.dataset ?? ""),
    model: String(r.model ?? ""),
    task: String(r.task ?? ""),
    outcome: String(r.outcome ?? "fail") as Outcome,
    step_count: Number(r.step_count ?? 0),
    tokens: Number(r.tokens ?? 0),
    duration: Number(r.duration ?? 0),
    reward: Number(r.reward ?? 0),
    cost: Number(r.cost ?? 0),
    tools_used: asStringList(r.tools_used),
    step_tools: asStringList(r.step_tools),
    steps: asStepList(r.steps),
  };
}

// Normalises an Arrow vector / list-of-struct / plain JS array of step
// records into a uniform `Step[]`. Arrow row proxies sometimes need
// explicit field access via `toJSON()`; we handle both shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asStepList(v: any): Step[] {
  return asArray(v)
    .map((s) => {
      if (s == null) return null;
      const r = s as Record<string, unknown>;
      const o = (
        typeof r.toJSON === "function" ? r.toJSON() : r
      ) as Record<string, unknown>;
      const name = String(o.name ?? o.tool ?? "");
      return {
        idx: Number(o.idx ?? 0),
        name,
        category: String(o.category ?? "tool") as Category,
        tool: name,
        role: String(o.role ?? ""),
        tokens: Number(o.tokens ?? 0),
        duration: Number(o.duration ?? 0),
        ok: o.ok == null ? true : Boolean(o.ok),
      } satisfies Step;
    })
    .filter((s): s is Step => s !== null);
}
