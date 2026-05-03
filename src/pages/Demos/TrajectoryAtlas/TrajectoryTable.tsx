// Trajectory Atlas — TrajectoryTable. Wraps the @any_table/react useTable
// hook against the same DuckDB Mosaic coordinator the icicle and sankey use,
// so a click in either chart writes a clauseList to the crossfilter and the
// table (also bound to that crossfilter) re-fetches automatically.
//
// We use the imperative `useTable` + `Table.*` compound API rather than the
// declarative `<AnyTable spec>` because we need the `selection.onSelectionChange`
// callback to drive the detail panel.

import { Box } from "@chakra-ui/react";
import { useCallback, useMemo, useRef } from "react";
import { MosaicProvider, Table, useTable, type ColumnDef } from "@any_table/react";
import type { Selection as VgSelection } from "@uwdata/mosaic-core";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { asArray, asStringList } from "../../../components/chartUtils";
import { OutcomeBadge } from "./OutcomeBadge";
import { StepPath } from "./StepPath";
import type { Category, Outcome, Step, Trajectory } from "./types";

interface ColMeta {
  key: string;
  label: string;
  align?: "left" | "right";
  mono?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: "id", width: "8.5rem" },
  { key: "task", flex: 1, minWidth: "12rem" },
  { key: "model", width: "11rem" },
  { key: "step_count", width: "4.5rem" },
  { key: "step_tools_str", width: "16rem" },
  { key: "outcome", width: "6rem" },
  { key: "tokens", width: "5rem" },
  { key: "reward", width: "5rem" },
];

const COL_META: Record<string, ColMeta> = {
  id: { key: "id", label: "ID", mono: true },
  task: { key: "task", label: "Task" },
  model: { key: "model", label: "Model", mono: true },
  step_count: { key: "step_count", label: "Steps", align: "right", mono: true },
  step_tools_str: { key: "step_tools_str", label: "Path" },
  outcome: { key: "outcome", label: "Outcome" },
  tokens: { key: "tokens", label: "Tokens", align: "right", mono: true },
  reward: { key: "reward", label: "Reward", align: "right", mono: true },
};

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
  const { coordinator, crossfilter, setRowSelection, selectedTrajectory } = useTrajectoryAtlas();
  const containerRef = useRef<HTMLDivElement>(null);

  const filter = useMemo(() => crossfilter ?? undefined, [crossfilter]);

  const onSelectionChange = useCallback(
    (selected: Set<string>) => {
      const id = selected.values().next().value as string | undefined;
      if (!id) {
        setRowSelection(null);
        return;
      }
      if (!coordinator) return;
      const escaped = id.replace(/'/g, "''");
      coordinator
        .query(`SELECT * FROM trajectories WHERE id = '${escaped}' LIMIT 1`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((res: any) => {
          const arr = res?.toArray?.() ?? [];
          if (!arr.length) return;
          const row = arr[0] as Record<string, unknown>;
          const traj: Trajectory = {
            id: String(row.id ?? ""),
            dataset: String(row.dataset ?? ""),
            model: String(row.model ?? ""),
            task: String(row.task ?? ""),
            outcome: String(row.outcome ?? "fail") as Outcome,
            step_count: Number(row.step_count ?? 0),
            tokens: Number(row.tokens ?? 0),
            duration: Number(row.duration ?? 0),
            reward: Number(row.reward ?? 0),
            cost: Number(row.cost ?? 0),
            tools_used: asStringList(row.tools_used),
            step_tools: asStringList(row.step_tools),
            steps: asStepList(row.steps),
          };
          setRowSelection(traj);
        })
        .catch((err: unknown) => console.error("[TrajectoryTable] query error:", err));
    },
    [coordinator, setRowSelection],
  );

  const selectedSet = useMemo(
    () => (selectedTrajectory ? new Set([selectedTrajectory.id]) : new Set<string>()),
    [selectedTrajectory],
  );

  const table = useTable({
    table: "trajectories",
    columns: COLUMNS,
    rowKey: "id",
    filter: filter as VgSelection | undefined,
    containerRef,
    selection: { mode: "single", selected: selectedSet, onSelectionChange },
    rowHeightConfig: { numLines: 1, padding: "8px" },
  });

  return (
    <Box
      ref={containerRef}
      position="relative"
      w="100%"
      h="100%"
      overflow="hidden"
      bg="bg.panel"
      borderRadius="md"
      fontSize="sm"
      color="fg"
      // Bridge AnyTable's CSS-var dependencies onto Chakra's runtime tokens
      // so the table chrome flips with the active color mode.
      style={{
        ["--accent" as string]: "var(--chakra-colors-accent)",
        ["--border" as string]: "var(--chakra-colors-gray-subtle)",
        ["--fg" as string]: "var(--chakra-colors-fg)",
        ["--muted-fg" as string]: "var(--chakra-colors-fg-muted)",
      }}
    >
      <Table.Root {...table.rootProps}>
        <Table.Header
          style={{
            height: 32,
            background: "var(--chakra-colors-bg-subtle)",
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
                    fontWeight: 500,
                    fontSize: 12,
                    letterSpacing: "0.02em",
                    color: "var(--chakra-colors-fg-muted)",
                    padding: "0 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: meta?.align === "right" ? "flex-end" : "flex-start",
                    whiteSpace: "nowrap",
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
                    const meta = COL_META[cell.column];
                    return (
                      <Table.Cell
                        key={cell.column}
                        column={cell.column}
                        width={cell.width}
                        offset={cell.offset}
                        style={{
                          padding: "0 12px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: meta?.align === "right" ? "flex-end" : "flex-start",
                          fontFamily: meta?.mono
                            ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
                            : "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                          fontVariantNumeric: "tabular-nums",
                          color: "var(--chakra-colors-fg)",
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

// Normalises an Arrow vector / list-of-struct / plain JS array of step
// records into a uniform `Step[]`. Arrow row proxies sometimes need
// explicit field access via `toJSON()`; we handle both shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asStepList(v: any): Step[] {
  return asArray(v)
    .map((s) => {
      if (s == null) return null;
      const r = s as Record<string, unknown>;
      // Arrow row proxies sometimes need explicit field access via `toJSON()`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = (typeof (r as any).toJSON === "function" ? (r as any).toJSON() : r) as Record<string, unknown>;
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
