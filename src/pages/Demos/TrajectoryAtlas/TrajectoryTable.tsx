// Trajectory Atlas — TrajectoryTable. Wraps the @any_table/react useTable
// hook against the same DuckDB Mosaic coordinator the icicle and sankey use,
// so a click in either chart writes a clauseList to the crossfilter and the
// table (also bound to that crossfilter) re-fetches automatically.
//
// We use the imperative `useTable` + `Table.*` compound API rather than the
// declarative `<AnyTable spec>` because we need the `selection.onSelectionChange`
// callback to drive the detail panel.

import { useCallback, useMemo, useRef } from "react";
import { MosaicProvider, Table, useTable, type ColumnDef } from "@any_table/react";
import type { Selection as VgSelection } from "@uwdata/mosaic-core";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { CAT_COLOR } from "./taxonomy";
import type { Category, Outcome, Step, Trajectory } from "./types";

interface ColMeta {
  key: string;
  label: string;
  align?: "left" | "right";
  mono?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: "id", width: "9rem" },
  { key: "task", flex: 1, minWidth: "12rem" },
  { key: "model", width: "10rem" },
  { key: "step_count", width: "5rem" },
  { key: "steps", width: "13rem" },
  { key: "outcome", width: "6rem" },
  { key: "duration", width: "5.5rem" },
  { key: "tokens", width: "5rem" },
  { key: "reward", width: "5rem" },
];

const COL_META: Record<string, ColMeta> = {
  id: { key: "id", label: "ID", mono: true },
  task: { key: "task", label: "Task" },
  model: { key: "model", label: "Model", mono: true },
  step_count: { key: "step_count", label: "Steps", align: "right", mono: true },
  steps: { key: "steps", label: "Path" },
  outcome: { key: "outcome", label: "Outcome" },
  duration: { key: "duration", label: "Duration", align: "right", mono: true },
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
    rowHeightConfig: { numLines: 1, padding: "6px" },
  });

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "var(--ta-bg-subtle)",
      }}
    >
      <Table.Root {...table.rootProps}>
        <Table.Header
          style={{
            height: "2rem",
            background: "var(--ta-bg-subtle)",
            borderBottom: "1px solid var(--ta-border)",
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
                    fontSize: "11px",
                    letterSpacing: "0.02em",
                    color: "var(--ta-fg-muted)",
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
                  borderBottom: "1px solid var(--ta-border-subtle)",
                  fontSize: "13px",
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
                          fontFamily: meta?.mono ? "var(--font-mono, ui-monospace)" : undefined,
                          fontVariantNumeric: "tabular-nums",
                          color: "var(--ta-fg)",
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
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 28,
          padding: "4px 12px",
          borderTop: "1px solid var(--ta-border-subtle)",
          background: "var(--ta-bg)",
          fontSize: "11px",
          color: "var(--ta-fg-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>
          {table.data.totalRows.toLocaleString()} trajectories
          {table.data.isLoading ? " · loading…" : ""}
        </span>
      </div>
    </div>
  );
}

function renderCell(column: string, value: unknown): React.ReactNode {
  if (value == null) return "";
  switch (column) {
    case "steps": {
      const steps = Array.isArray(value)
        ? (value as Step[])
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (value as any)?.toArray?.() ?? [];
      if (!steps.length) return null;
      const max = 16;
      const shown = steps.slice(0, max);
      const more = steps.length - shown.length;
      return (
        <div className="ta-step-path">
          {shown.map((s: Step, i: number) => (
            <span
              key={i}
              className="ta-step-dot"
              title={`${i + 1}. ${s.tool} (${s.category})`}
              style={{ background: CAT_COLOR[s.category as Category] ?? "var(--ta-fg-subtle)" }}
            />
          ))}
          {more > 0 && <span className="ta-step-more">+{more}</span>}
        </div>
      );
    }
    case "outcome": {
      const o = String(value ?? "") as Outcome;
      return <span className={`ta-outcome-badge ta-outcome-${o}`}>{o}</span>;
    }
    case "duration": {
      const ms = Number(value ?? 0);
      if (!Number.isFinite(ms) || ms <= 0) return <span style={{ color: "var(--ta-fg-subtle)" }}>—</span>;
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
      return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
    }
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
function asStringList(v: any): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (v && typeof v.toArray === "function") return v.toArray().map(String);
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asStepList(v: any): Step[] {
  let arr: unknown[];
  if (Array.isArray(v)) arr = v;
  else if (v && typeof v.toArray === "function") arr = v.toArray();
  else return [];
  return arr.map((s) => {
    const r = s as Record<string, unknown>;
    return {
      idx: Number(r.idx ?? 0),
      category: String(r.category ?? "tool") as Category,
      tool: String(r.tool ?? ""),
      tokens: Number(r.tokens ?? 0),
      duration: Number(r.duration ?? 0),
      ok: Boolean(r.ok ?? true),
    };
  });
}
