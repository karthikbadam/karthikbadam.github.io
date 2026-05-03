// Trajectory Atlas — TrajectoryTable. Declarative `<AnyTable>` over the
// `trajectories` table (queried via DuckDB through MosaicProvider). Bound
// to the same crossfilter Selection as the icicle/sankey so filter clauses
// they write narrow this view too.
//
// AnyTable's declarative spec doesn't expose an onSelectionChange hook, so
// we capture row clicks at the wrapper level and read the row's id via the
// rendered cell text — simple and stable.

import { Box, Flex, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnyTable,
  MosaicProvider,
  hasCell,
  registerCell,
  type TableSpec,
} from "@any_table/react";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { CAT_COLOR, categoryFor } from "./taxonomy";
import type { Category, Outcome, Step, Trajectory } from "./types";

if (!hasCell("ta-step-path")) {
  registerCell("ta-step-path", ({ value }) => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const names = raw.split(",");
    const max = 24;
    const shown = names.slice(0, max);
    const more = names.length - shown.length;
    return (
      <div className="ta-step-path">
        {shown.map((name, i) => {
          const cat = categoryFor(name);
          return (
            <span
              key={i}
              className="ta-step-dot"
              title={`${i + 1}. ${name}`}
              style={{ background: CAT_COLOR[cat as Category] ?? "#9498A0" }}
            />
          );
        })}
        {more > 0 && <span className="ta-step-more">+{more}</span>}
      </div>
    );
  });
}

if (!hasCell("ta-outcome")) {
  registerCell("ta-outcome", ({ value }) => {
    const o = String(value ?? "") as Outcome;
    return <span className={`ta-outcome-badge ta-outcome-${o}`}>{o}</span>;
  });
}

if (!hasCell("ta-tokens")) {
  registerCell("ta-tokens", ({ value }) => {
    const t = Number(value ?? 0);
    if (!Number.isFinite(t) || t < 1000) return String(Math.round(t));
    if (t < 1_000_000) return `${(t / 1000).toFixed(1)}k`;
    return `${(t / 1_000_000).toFixed(2)}M`;
  });
}

if (!hasCell("ta-reward")) {
  registerCell("ta-reward", ({ value }) => {
    const v = Number(value ?? 0);
    return v.toFixed(2);
  });
}

const SPEC: TableSpec = {
  data: { table: "trajectories" },
  rowKey: "id",
  height: "100%",
  selection: { mode: "single" },
  columns: [
    { key: "id", width: "9rem", cell: "text" },
    { key: "task", flex: 1, minWidth: "12rem", cell: "text" },
    { key: "model", width: "11rem", cell: "text" },
    { key: "step_count", width: "5rem", cell: "number", align: "right" },
    { key: "step_tools_str", width: "16rem", cell: "ta-step-path", sortable: false },
    { key: "outcome", width: "6rem", cell: "ta-outcome" },
    { key: "tokens", width: "5rem", cell: "ta-tokens", align: "right" },
    { key: "reward", width: "5rem", cell: "ta-reward", align: "right" },
  ],
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
  const { coordinator, crossfilter, setRowSelection, selectedTrajectory } =
    useTrajectoryAtlas();
  const containerRef = useRef<HTMLDivElement>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);

  const filter = useMemo(() => crossfilter ?? undefined, [crossfilter]);

  // Row-click capture: AnyTable's declarative API doesn't expose an
  // onSelectionChange callback; intercept clicks on the table host and
  // read the id cell text from the clicked [role="row"]. Simple and
  // robust to AnyTable internals changes.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || !coordinator) return;
    const handler = async (ev: MouseEvent) => {
      const row = (ev.target as HTMLElement | null)?.closest('[role="row"]');
      if (!row) return;
      // Skip the header row.
      if (row.getAttribute("aria-rowindex") === "1") return;
      // The id is the first cell's textContent. AnyTable renders cells in
      // the same column order as the spec, so this is stable.
      const firstCell = row.querySelector('[role="gridcell"]');
      const id = firstCell?.textContent?.trim();
      if (!id) return;
      // Toggle: clicking the same row clears the selection.
      if (selectedTrajectory?.id === id) {
        setRowSelection(null);
        return;
      }
      const escaped = id.replace(/'/g, "''");
      try {
        const res = await coordinator.query(
          `SELECT * FROM trajectories WHERE id = '${escaped}' LIMIT 1`,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const arr = (res as any)?.toArray?.() ?? [];
        if (!arr.length) return;
        setRowSelection(arrowToTrajectory(arr[0]));
      } catch (err) {
        console.error("[TrajectoryTable] row fetch failed:", err);
      }
    };
    node.addEventListener("click", handler);
    return () => node.removeEventListener("click", handler);
  }, [coordinator, setRowSelection, selectedTrajectory]);

  // Fetch the total row count for the footer.
  useEffect(() => {
    if (!coordinator) return;
    let cancelled = false;
    coordinator
      .query("SELECT COUNT(*) AS n FROM trajectories")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((res: any) => {
        if (cancelled) return;
        const arr = res?.toArray?.() ?? [];
        setRowCount(Number(arr[0]?.n ?? 0));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [coordinator]);

  return (
    <Flex direction="column" w="100%" h="100%" position="relative">
      <Box ref={containerRef} flex="1" minH={0} position="relative">
        <AnyTable spec={SPEC} filter={filter} />
      </Box>
      <Flex
        h={7}
        px={3}
        align="center"
        justify="space-between"
        borderTop="1px solid"
        borderColor="bg.subtle"
        bg="bg.panel"
        flexShrink={0}
      >
        <Text fontSize="xs" color="fg.subtle">
          {rowCount != null ? `${rowCount.toLocaleString()} trajectories` : "…"}
        </Text>
      </Flex>
    </Flex>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function arrowToTrajectory(row: any): Trajectory {
  return {
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asStringList(v: any): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => (x == null ? "" : String(x)));
  if (typeof v.toArray === "function") {
    return v.toArray().map((x: unknown) => (x == null ? "" : String(x)));
  }
  if (typeof v.length === "number" && typeof v.get === "function") {
    const out: string[] = [];
    for (let i = 0; i < v.length; i++) {
      const x = v.get(i);
      out.push(x == null ? "" : String(x));
    }
    return out;
  }
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asStepList(v: any): Step[] {
  if (v == null) return [];
  let arr: unknown[];
  if (Array.isArray(v)) arr = v;
  else if (typeof v.toArray === "function") arr = v.toArray();
  else if (typeof v.length === "number" && typeof v.get === "function") {
    arr = [];
    for (let i = 0; i < v.length; i++) arr.push(v.get(i));
  } else return [];
  return arr
    .map((s) => {
      if (s == null) return null;
      const r = s as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = (typeof (r as any).toJSON === "function" ? (r as any).toJSON() : r) as Record<
        string,
        unknown
      >;
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
