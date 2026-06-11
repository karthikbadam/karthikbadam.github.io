/**
 * SankeyMosaicClient — generic N-column sankey rendered as a Mosaic client.
 *
 * The component is fully data-driven: column count, column expressions, and
 * the node sets within each column all come from props/data. Each column is a
 * SQL expression that resolves to a string per trajectory; the component
 * issues N node-count queries (one per column) and N-1 link-count queries
 * (between adjacent columns), then lays out the result with a hand-rolled
 * cubic-bezier ribbon path (no `d3-sankey` dependency).
 *
 * Click a ribbon → write a `clauseList(idCol, [trajectoryIds...])` clause to
 * the supplied crossfilter `Selection`. Other panels bound to the same
 * selection re-query, just like any other Mosaic chart.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { clausePoints } from "@uwdata/mosaic-core";
import type { Coordinator, Selection as VgSelection } from "@uwdata/mosaic-core";
import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import {
  chartColumnHeaderStyle,
  chartFg,
  chartFgMuted,
  chartLabelStyle,
  chartTextHalo,
  chartValueStyle,
  tooltipContainerStyle,
  tooltipRowStyle,
  tooltipTitleStyle,
} from "./chartStyles";
import { arrowRows, asArray, setIntersects } from "./chartUtils";

export interface SankeyColumnSpec {
  /** Unique column name used as a node-set key. */
  name: string;
  /** Display label rendered above the column in the SVG. Defaults to `name`. */
  label?: string;
  /** SQL expression that resolves to a string per group (per-traj_id). */
  expr: string;
}

export interface SankeyMosaicClientProps {
  coordinator: Coordinator;
  /** Source table (typically per-step rows or per-trajectory rows). */
  table: string;
  /** Unique trajectory id column (used in GROUP BY and click clauses). */
  idCol: string;
  /** ≥2 columns. Each row in the table is grouped by `idCol`; each col spec
   * gets one value per group via its `expr`. */
  columns: SankeyColumnSpec[];
  selection?: VgSelection | null;
  /** Optional WHERE-body (without WHERE) applied to the source. */
  whereExpr?: string | null;
  /** Per-column-value color resolver (CSS string). Falls back to a neutral grey. */
  palette?: (column: string, value: string) => string;
  /** Per-column ordering override; values not listed appear after, sorted by count desc. */
  orderings?: Record<string, string[]>;
  /** Whether to render light or dark mode chrome (tooltip). */
  dark?: boolean;
  /** Cap on nodes per column. Long tail collapsed into a single 'other (N)' node. */
  maxNodesPerColumn?: number;
  /** Column alignment. "bottom" (default) leaves whitespace at the top for
   * skip-edges; "top" pins the biggest node of every column to a shared top
   * line and routes skip-edges through a bottom gutter instead. */
  align?: "bottom" | "top";
  /** Annotate each non-final column with the number of trajectories that
   * end there (skip-edges straight to the final column). */
  dropoffLabels?: boolean;
  /** Node ordering within columns. "count" (default) sorts by size;
   * "barycenter" additionally runs crossing-reduction sweeps that pull
   * connected nodes toward each other. Columns with an `orderings` override
   * are never reordered. */
  nodeOrder?: "count" | "barycenter";
  /** Trajectory ids to highlight (e.g. clicked-row in the trajectory table).
   * Ribbons whose trajectory set intersects this are emphasised; the rest
   * dim. */
  highlightedTrajIds?: Set<string> | null;
  /** Optional fired-after-Selection-write callback. */
  onLinkClick?: (col: number, from: string, to: string, ids: string[]) => void;
  /** Increment to clear the sankey's local ribbon selection and the matching
   * crossfilter clause. Used by an external "Clear all" button. */
  resetSignal?: number;
  /** Reports whether the sankey currently has a ribbon selection — surfaced
   * by the topbar so it can keep its "Clear filters" button visible. */
  onSelectionStateChange?: (active: boolean) => void;
}

interface NodeRow {
  col: number;
  key: string;
  count: number;
  trajIds: Set<string>;
}

interface LinkRow {
  fromCol: number;
  /** Destination column. May be > fromCol+1 (skip-edges) when intermediate
   * columns are the synthetic NONE_VALUE. */
  toCol: number;
  from: string;
  to: string;
  count: number;
  trajIds: Set<string>;
}

// Trajectories whose value at a column is the synthetic placeholder are
// SKIPPED past that column entirely — links route directly to the next
// non-NONE column. Excluded from node lists.
const NONE_VALUE = "(none)";

interface NodeLayout extends NodeRow {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: string;
}

interface LinkLayout extends LinkRow {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t0: number;
  t1: number;
  color: string;
}

const DEFAULT_PALETTE = () => "var(--ta-fg-subtle)";

export function SankeyMosaicClient({
  coordinator,
  table,
  idCol,
  columns,
  selection,
  whereExpr,
  palette = DEFAULT_PALETTE,
  orderings,
  dark = false,
  maxNodesPerColumn,
  align = "bottom",
  dropoffLabels = false,
  nodeOrder = "count",
  highlightedTrajIds,
  onLinkClick,
  resetSignal,
  onSelectionStateChange,
}: SankeyMosaicClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  type HoverState =
    | { kind: "link"; lk: LinkLayout }
    | { kind: "node"; n: NodeLayout }
    | null;
  const [hover, setHover] = useState<HoverState>(null);
  const [localSelection, setLocalSelection] = useState<{
    col: number;
    toCol: number;
    from: string;
    to: string;
  } | null>(null);
  // Click-to-expand: the column rendered as the wide "detail" layer (others
  // compress). Null = even overview. Cleared when the columns change.
  const [focusedCol, setFocusedCol] = useState<number | null>(null);
  useEffect(() => setFocusedCol(null), [columns]);
  const toggleFocus = (ci: number) =>
    setFocusedCol((cur) => (cur === ci ? null : ci));

  // Stable token for the selection's "source" identity.
  const sourceRef = useRef<{ id: string }>({ id: "sankey-mosaic-client" });

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const [version, setVersion] = useState(0);

  // Subscribe to upstream selection changes — bump a version token to retrigger.
  useEffect(() => {
    if (!selection) return;
    const handler = () => setVersion((v) => v + 1);
    selection.addEventListener("value", handler);
    return () => selection.removeEventListener("value", handler);
  }, [selection]);

  // External "Clear all" — drop the local ribbon selection and clear our
  // contribution to the crossfilter so other charts unfilter.
  useEffect(() => {
    if (resetSignal === undefined) return;
    setLocalSelection(null);
    setFocusedCol(null);
    onSelectionStateChange?.(false);
    if (selection) {
      selection.update(
        clausePoints([idCol], undefined, { source: sourceRef.current, clients: new Set() }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // Run the node + link queries in parallel. Re-runs whenever the column
  // spec, base WHERE, or upstream-selection version changes.
  useEffect(() => {
    if (!coordinator || columns.length < 2) return;
    let cancelled = false;

    const upstreamPredicate = readPredicate(selection, sourceRef.current);
    const baseWhere = combineWhere(whereExpr ?? null, upstreamPredicate);
    const trajCte = `
      WITH traj_cols AS (
        SELECT ${idCol} AS traj_id,
          ${columns.map((c) => `${c.expr} AS ${col(c.name)}`).join(",\n          ")}
        FROM ${table}
        ${baseWhere ? `WHERE ${baseWhere}` : ""}
        GROUP BY ${idCol}
      )
    `;

    // For each pair (i, j) with i < j, generate a link query that captures
    // trajectories whose values at i and j are non-NONE AND whose
    // intermediate columns are all NONE — i.e. trajectories that "skip"
    // through (none) on intermediate columns and want a direct edge.
    // `(none)` is terminal: once a run stops it stays stopped, so the only
    // real edges are adjacent columns plus each column's dropoff straight to
    // the final column. That keeps link queries O(n) instead of O(n²).
    const lastCol = columns.length - 1;
    const linkPairs: Array<{ i: number; j: number }> = [];
    for (let i = 0; i < lastCol; i++) {
      linkPairs.push({ i, j: i + 1 });
      if (i + 1 < lastCol) linkPairs.push({ i, j: lastCol });
    }
    const noneStr = `'${NONE_VALUE.replace(/'/g, "''")}'`;
    const realCheck = (k: number) =>
      `${col(columns[k].name)} IS NOT NULL AND ${col(columns[k].name)} <> ${noneStr}`;
    const noneCheck = (k: number) =>
      `${col(columns[k].name)} = ${noneStr}`;

    (async () => {
      try {
        // Node counts in one query; ids are carried on links only.
        const nodeSql = columns
          .map(
            (c, i) =>
              `SELECT ${i} AS col_i, ${col(c.name)} AS key, COUNT(*) AS n
               FROM traj_cols WHERE ${realCheck(i)} GROUP BY 1, 2`,
          )
          .join("\nUNION ALL\n");

        const [nodeData, linkRes] = await Promise.all([
          coordinator
            .query(`${trajCte}\n${nodeSql}\nORDER BY col_i, n DESC`)
            .then((r) => arrowRows(r)),
          Promise.all(
            linkPairs.map(({ i, j }) => {
              const intermediates: string[] = [];
              for (let k = i + 1; k < j; k++) intermediates.push(noneCheck(k));
              const where = [realCheck(i), realCheck(j), ...intermediates].join(" AND ");
              return coordinator
                .query(`
                  ${trajCte}
                  SELECT ${col(columns[i].name)} AS from_key,
                         ${col(columns[j].name)} AS to_key,
                         COUNT(*) AS n, ARRAY_AGG(traj_id) AS traj_ids
                  FROM traj_cols
                  WHERE ${where}
                  GROUP BY 1, 2 ORDER BY 1, 2
                `)
                .then((r) => ({ i, j, rows: arrowRows(r) }));
            }),
          ),
        ]);

        if (cancelled) return;

        let nextNodes: NodeRow[] = [];
        for (const r of nodeData) {
          nextNodes.push({
            col: Number(r.col_i ?? 0),
            key: String(r.key ?? ""),
            count: Number(r.n ?? 0),
            trajIds: new Set(),
          });
        }
        let nextLinks: LinkRow[] = [];
        for (const { i, j, rows } of linkRes) {
          for (const r of rows) {
            nextLinks.push({
              fromCol: i,
              toCol: j,
              from: String(r.from_key ?? ""),
              to: String(r.to_key ?? ""),
              count: Number(r.n ?? 0),
              trajIds: new Set(asArray(r.traj_ids).map(String)),
            });
          }
        }

        if (typeof maxNodesPerColumn === "number" && maxNodesPerColumn > 1) {
          const collapse = collapseTopK(nextNodes, nextLinks, columns, maxNodesPerColumn);
          nextNodes = collapse.nodes;
          nextLinks = collapse.links;
        }

        setNodes(nextNodes);
        setLinks(nextLinks);
      } catch (err) {
        console.error("[SankeyMosaicClient] query error:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [version, coordinator, table, idCol, columns, whereExpr, selection, maxNodesPerColumn]);

  // Layout — produces nodes and links with x/y/w/h.
  const layout = useMemo(() => {
    return layoutSankey(
      columns, nodes, links, size.w, size.h, orderings, palette, align,
      dropoffLabels, nodeOrder, focusedCol,
    );
  }, [columns, nodes, links, size.w, size.h, orderings, palette, align, dropoffLabels, nodeOrder, focusedCol]);

  // Per-column label width budget: the space up to the neighboring column
  // (or the chart edge), so labels never bleed into the next column. The
  // last column's labels render to its LEFT, so it budgets that side.
  const labelAvail = useMemo(() => {
    const xw = new Map<number, { x: number; w: number }>();
    for (const n of layout.nodes) {
      if (!xw.has(n.col)) xw.set(n.col, { x: n.x, w: n.w });
    }
    const cols = Array.from(xw.entries()).sort((a, b) => a[1].x - b[1].x);
    const m = new Map<number, number>();
    cols.forEach(([ci, { x, w }], i) => {
      if (ci === columns.length - 1) {
        const prev = cols[i - 1]?.[1];
        m.set(ci, x - 6 - (prev ? prev.x + prev.w + 6 : 0));
      } else {
        const next = cols[i + 1]?.[1].x ?? size.w;
        m.set(ci, next - (x + w + 6) - 6);
      }
    });
    return m;
  }, [layout.nodes, columns.length, size.w]);

  // Per-column dropoff counts: trajectories whose link from this column goes
  // straight to the final column, skipping at least one column in between —
  // i.e. they stop calling tools here.
  const dropoffs = useMemo(() => {
    if (!dropoffLabels) return new Map<number, number>();
    const last = columns.length - 1;
    const m = new Map<number, number>();
    for (const lk of links) {
      if (lk.toCol === last && lk.fromCol < last - 1) {
        m.set(lk.fromCol, (m.get(lk.fromCol) ?? 0) + lk.count);
      }
    }
    return m;
  }, [dropoffLabels, links, columns.length]);

  function isSelected(lk: LinkRow): boolean {
    return (
      localSelection !== null &&
      localSelection.col === lk.fromCol &&
      localSelection.toCol === lk.toCol &&
      localSelection.from === lk.from &&
      localSelection.to === lk.to
    );
  }

  function handleClick(lk: LinkLayout) {
    const next = isSelected(lk)
      ? null
      : { col: lk.fromCol, toCol: lk.toCol, from: lk.from, to: lk.to };
    setLocalSelection(next);
    onSelectionStateChange?.(next !== null);
    if (selection) {
      if (next === null) {
        selection.update(
          clausePoints([idCol], undefined, { source: sourceRef.current, clients: new Set() }),
        );
      } else {
        const ids = Array.from(lk.trajIds).map((id) => [id]);
        selection.update(
          clausePoints([idCol], ids, { source: sourceRef.current, clients: new Set() }),
        );
      }
    }
    onLinkClick?.(lk.fromCol, lk.from, lk.to, Array.from(lk.trajIds));
  }

  // Ribbons fade uniformly as columns grow — at depth they're too thin to
  // trace, so the nodes carry the read. Dim tracks base so hover never turns
  // a deep chart black.
  const linkBase = Math.min(
    0.32,
    Math.max(0.08, 0.32 - (columns.length - 4) * 0.006),
  );
  const dimOpacity = Math.max(0.03, linkBase * 0.15);
  const lastCol = columns.length - 1;
  const colSlot = (ci: number) =>
    (layout.cols[ci + 1]?.x ?? size.w) - (layout.cols[ci]?.x ?? 0);
  // Top edge of each column, so headers hug their column instead of floating
  // in a fixed row above bottom-aligned bars.
  const colTops = useMemo(() => {
    const m = new Map<number, number>();
    for (const n of layout.nodes) {
      const cur = m.get(n.col);
      if (cur === undefined || n.y < cur) m.set(n.col, n.y);
    }
    return m;
  }, [layout.nodes]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg width={size.w} height={size.h} style={{ display: "block" }}>
        <Group>
          {/* Click a column's band to expand that layer. */}
          {layout.cols.map((c, i) => {
            if (!layout.nodes.some((n) => n.col === i)) return null;
            const left = i === 0 ? 0 : (layout.cols[i - 1].x + layout.cols[i - 1].w + c.x) / 2;
            const right =
              i === lastCol ? size.w : (c.x + c.w + layout.cols[i + 1].x) / 2;
            const isFocused = focusedCol === i;
            return (
              <rect
                key={`f-${i}`}
                x={left}
                y={0}
                width={Math.max(0, right - left)}
                height={size.h}
                fill={
                  isFocused
                    ? dark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.04)"
                    : "transparent"
                }
                style={{ cursor: "pointer" }}
                onClick={() => toggleFocus(i)}
              />
            );
          })}
          {layout.links.map((lk, i) => {
            const sel = isSelected(lk);
            const hi =
              highlightedTrajIds && setIntersects(lk.trajIds, highlightedTrajIds);
            // Hover-driven dimming: when the user hovers a link or a node,
            // dim every link NOT involved in the hover.
            const isHoverLink = hover?.kind === "link" && hover.lk === lk;
            const isHoverConnected =
              hover?.kind === "node" &&
              ((hover.n.col === lk.fromCol && hover.n.key === lk.from) ||
                (hover.n.col === lk.toCol && hover.n.key === lk.to));
            const dimmedByHover =
              hover != null && !isHoverLink && !isHoverConnected;
            const dimmedBySelection =
              (localSelection !== null && !sel) ||
              (highlightedTrajIds != null && !hi);
            const dimmed = dimmedByHover || dimmedBySelection;
            const accent = isHoverLink || isHoverConnected || sel || hi;
            return (
              <path
                key={`l-${i}`}
                d={ribbonPath(lk.x0, lk.y0, lk.t0, lk.x1, lk.y1, lk.t1)}
                fill={lk.color}
                opacity={accent ? 0.85 : dimmed ? dimOpacity : linkBase}
                style={{ cursor: "pointer", transition: "opacity .15s" }}
                onClick={() => handleClick(lk)}
                onMouseEnter={() => setHover({ kind: "link", lk })}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
          {layout.nodes.map((n, i) => {
            const wideEnough =
              (colSlot(n.col) >= 40 && columns.length <= 20) ||
              focusedCol === n.col ||
              n.col === lastCol;
            const showLabel = wideEnough && (n.h >= 11 || n.key === OTHER_KEY);
            const fit = showLabel
              ? fitNodeLabel(
                  n.label,
                  n.count.toLocaleString(),
                  labelAvail.get(n.col) ?? 0,
                )
              : null;
            const isHoverNode = hover?.kind === "node" && hover.n === n;
            const dimmedNode =
              hover != null &&
              !isHoverNode &&
              !(
                hover.kind === "link" &&
                ((hover.lk.fromCol === n.col && hover.lk.from === n.key) ||
                  (hover.lk.toCol === n.col && hover.lk.to === n.key))
              );
            return (
              <Group key={`n-${i}`}>
                <Bar
                  x={n.x}
                  y={n.y}
                  width={n.w}
                  height={Math.max(1, n.h)}
                  fill={n.color}
                  rx={2}
                  opacity={dimmedNode ? 0.25 : 0.95}
                  style={{ cursor: "pointer", transition: "opacity .15s" }}
                  onMouseEnter={() => setHover({ kind: "node", n })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => toggleFocus(n.col)}
                />
                {fit && (
                  <text
                    x={n.col === lastCol ? n.x - 6 : n.x + n.w + 6}
                    y={n.y + n.h / 2 + 4}
                    fill={chartFg(dark)}
                    textAnchor={n.col === lastCol ? "end" : "start"}
                    pointerEvents="none"
                    style={{ ...chartLabelStyle, ...chartTextHalo(dark) }}
                    opacity={dimmedNode ? 0.4 : 1}
                  >
                    {fit.text}
                    {n.h >= 14 && fit.showCount && (
                      <tspan dx="6" style={chartValueStyle}>
                        {n.count.toLocaleString()}
                      </tspan>
                    )}
                  </text>
                )}
              </Group>
            );
          })}
          {columns.map((c, i) => {
            const top = colTops.get(i);
            // Skip empty columns — e.g. a step column no trajectory reaches.
            if (top === undefined) return null;
            const isLast = i === lastCol;
            const focused = focusedCol === i;
            // First, last, and focused headers always show; the rest thin out
            // as columns crowd.
            const isAnchor = focused || isLast || i === 0;
            const headerStep =
              columns.length > 30 ? 5 : columns.length > 16 ? 2 : 1;
            if (!isAnchor && (i % headerStep !== 0 || colSlot(i) < 28))
              return null;
            const geom = layout.cols[i];
            return (
              <text
                key={`h-${i}`}
                x={isLast ? geom.x + geom.w : geom.x}
                y={Math.max(12, top - 16)}
                fill={focused ? chartFg(dark) : chartFgMuted(dark)}
                textAnchor={isLast ? "end" : "start"}
                style={{
                  ...chartColumnHeaderStyle,
                  ...chartTextHalo(dark),
                  fontWeight: focused ? 700 : undefined,
                  cursor: "pointer",
                }}
                onClick={() => toggleFocus(i)}
              >
                {c.label ?? c.name}
              </text>
            );
          })}
          {dropoffLabels &&
            columns.length <= 10 &&
            columns.map((_, i) => {
              const count = dropoffs.get(i);
              const top = colTops.get(i);
              if (!count || top === undefined) return null;
              return (
                <text
                  key={`d-${i}`}
                  x={layout.cols[i].x}
                  y={Math.max(24, top - 4)}
                  fill={chartFgMuted(dark)}
                  textAnchor="start"
                  pointerEvents="none"
                  style={{ ...chartValueStyle, ...chartTextHalo(dark) }}
                >
                  ↳ {count.toLocaleString()} end here
                </text>
              );
            })}
        </Group>
      </svg>
      {hover?.kind === "link" && (
        <div
          style={{
            ...tooltipContainerStyle(dark, 220),
            left: Math.min(
              (hover.lk.x0 + hover.lk.x1) / 2,
              Math.max(0, size.w - 240),
            ),
            top: Math.max(
              0,
              Math.min((hover.lk.y0 + hover.lk.y1) / 2 - 10, size.h - 80),
            ),
          }}
        >
          <div style={tooltipTitleStyle}>
            {hover.lk.from === OTHER_KEY ? "other" : hover.lk.from}
            {" → "}
            {hover.lk.to === OTHER_KEY ? "other" : hover.lk.to}
          </div>
          <div style={tooltipRowStyle(dark)}>
            <span>trajectories</span>
            <b style={{ color: "inherit", fontWeight: 500 }}>
              {hover.lk.count.toLocaleString()}
            </b>
          </div>
        </div>
      )}
      {hover?.kind === "node" && (
        <div
          style={{
            ...tooltipContainerStyle(dark, 220),
            left: Math.min(hover.n.x + hover.n.w + 10, Math.max(0, size.w - 240)),
            top: Math.max(0, Math.min(hover.n.y + hover.n.h / 2 - 10, size.h - 80)),
          }}
        >
          <div style={tooltipTitleStyle}>
            {hover.n.label}
            <span style={{ color: chartFgMuted(dark), marginLeft: 6, fontWeight: 400 }}>
              · {columns[hover.n.col]?.label ?? columns[hover.n.col]?.name ?? ""}
            </span>
          </div>
          <div style={tooltipRowStyle(dark)}>
            <span>trajectories</span>
            <b style={{ color: "inherit", fontWeight: 500 }}>
              {hover.n.count.toLocaleString()}
            </b>
          </div>
          <div style={tooltipRowStyle(dark)}>
            <span>share of column</span>
            <b style={{ color: "inherit", fontWeight: 500 }}>
              {(() => {
                const total = layout.nodes
                  .filter((n) => n.col === hover.n.col)
                  .reduce((a, n) => a + n.count, 0);
                return total > 0
                  ? `${((hover.n.count / total) * 100).toFixed(1)}%`
                  : "—";
              })()}
            </b>
          </div>
        </div>
      )}
    </div>
  );
}

// ----- helpers --------------------------------------------------------------

function col(name: string): string {
  // Quote the alias defensively — let DuckDB parse `"name"` cleanly.
  return `"${name.replace(/"/g, '""')}"`;
}

function combineWhere(a: string | null, b: string | null): string | null {
  if (a && b) return `(${a}) AND (${b})`;
  return a ?? b ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readPredicate(selection: VgSelection | null | undefined, ownSource: any): string | null {
  if (!selection) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clauses = (selection as any).clauses ?? [];
  const parts: string[] = [];
  for (const c of clauses) {
    if (c?.source === ownSource) continue; // self-exclusion
    const pred = c?.predicate?.toString?.();
    if (typeof pred === "string" && pred.trim()) parts.push(`(${pred})`);
  }
  return parts.length ? parts.join(" AND ") : null;
}

// Bars shrink only when columns can't fit; a focused column and its ribbon
// gaps take extra weight so it expands while the rest compress.
const COL_W = 14;
const COL_W_MIN = 4;
const GAP_MIN = 4;
const FOCUS_W = 32;
const FOCUS_GAP_W = 10;

interface ColLayout {
  x: number;
  w: number;
}

/** Per-column x-left + bar width, distributing `innerW` by weight so the
 * chart always fits and a focused layer expands. */
function columnGeometry(
  nCols: number,
  innerW: number,
  padLeft: number,
  focusedCol: number | null,
): ColLayout[] {
  if (nCols <= 0) return [];
  // Shrink bars below COL_W only when COL_W bars + min gaps overflow innerW.
  let baseW = COL_W;
  const needed = nCols * COL_W + Math.max(0, nCols - 1) * GAP_MIN;
  if (needed > innerW) {
    baseW = Math.max(COL_W_MIN, (innerW - Math.max(0, nCols - 1) * GAP_MIN) / nCols);
  }
  const barW = Array.from({ length: nCols }, (_, i) =>
    i === focusedCol ? Math.max(baseW, FOCUS_W) : baseW,
  );
  const totalBars = barW.reduce((a, b) => a + b, 0);
  const freeGap = Math.max(0, innerW - totalBars);
  const gapW = Array.from({ length: Math.max(0, nCols - 1) }, (_, i) =>
    focusedCol != null && (i === focusedCol - 1 || i === focusedCol)
      ? FOCUS_GAP_W
      : 1,
  );
  const gapSum = gapW.reduce((a, b) => a + b, 0) || 1;
  const gaps = gapW.map((w) => (freeGap * w) / gapSum);
  const cols: ColLayout[] = [];
  let x = padLeft;
  for (let i = 0; i < nCols; i++) {
    cols.push({ x, w: barW[i] });
    x += barW[i] + (i < nCols - 1 ? gaps[i] : 0);
  }
  return cols;
}

function layoutSankey(
  columns: SankeyColumnSpec[],
  nodeRows: NodeRow[],
  linkRows: LinkRow[],
  width: number,
  height: number,
  orderings: Record<string, string[]> | undefined,
  palette: (column: string, value: string) => string,
  align: "bottom" | "top",
  dropoffLabels = false,
  nodeOrder: "count" | "barycenter" = "count",
  focusedCol: number | null = null,
): { nodes: NodeLayout[]; links: LinkLayout[]; cols: ColLayout[] } {
  if (!nodeRows.length || !columns.length)
    return { nodes: [], links: [], cols: [] };
  // Outcome / last-column labels are anchored to the LEFT of their rect
  // (textAnchor='end' with x=n.x - 6) so we don't need extra right margin.
  const padLeft = 8;
  const padRight = 8;
  // Dropoff labels occupy a second header line below the column headers.
  const padTop = dropoffLabels ? 28 : 20;
  const padBottom = 8;
  const innerW = Math.max(0, width - padLeft - padRight);
  const innerH = Math.max(0, height - padTop - padBottom);
  const nCols = columns.length;
  const fc =
    focusedCol != null && focusedCol >= 0 && focusedCol < nCols
      ? focusedCol
      : null;
  const colGeom = columnGeometry(nCols, innerW, padLeft, fc);

  // Group nodes by column, apply ordering.
  const byCol: Record<number, NodeRow[]> = {};
  for (const n of nodeRows) {
    (byCol[n.col] ??= []).push(n);
  }
  const gapY = 8;

  // Sort each column.
  for (let ci = 0; ci < nCols; ci++) {
    const col = columns[ci];
    const list = byCol[ci] ?? [];
    const order = orderings?.[col.name];
    if (order && order.length) {
      list.sort((a, b) => {
        const ia = order.indexOf(a.key);
        const ib = order.indexOf(b.key);
        const da = ia < 0 ? 1e9 : ia;
        const db = ib < 0 ? 1e9 : ib;
        return da - db || b.count - a.count;
      });
    } else {
      list.sort((a, b) => b.count - a.count);
    }
  }

  // Crossing reduction: barycenter sweeps pull each node toward the
  // count-weighted mean position of its link neighbors. Columns with an
  // explicit ordering (e.g. the outcome column) are left untouched.
  if (nodeOrder === "barycenter") {
    // Normalized center (0..1) of each node within its column, weighted by
    // count so a large node's center reflects the span it occupies.
    const centers: Array<Map<string, number>> = [];
    const computeCenters = (ci: number) => {
      const m = new Map<string, number>();
      const list = byCol[ci] ?? [];
      const total = list.reduce((a, n) => a + n.count, 0) || 1;
      let acc = 0;
      for (const n of list) {
        m.set(n.key, (acc + n.count / 2) / total);
        acc += n.count;
      }
      centers[ci] = m;
    };
    for (let ci = 0; ci < nCols; ci++) computeCenters(ci);

    const sweep = (ci: number) => {
      if (orderings?.[columns[ci].name]?.length) return;
      const list = byCol[ci] ?? [];
      if (list.length < 2) return;
      const bary = new Map<string, number>();
      for (const n of list) {
        let sum = 0;
        let wsum = 0;
        for (const lk of linkRows) {
          let other: { col: number; key: string } | null = null;
          if (lk.fromCol === ci && lk.from === n.key) {
            other = { col: lk.toCol, key: lk.to };
          } else if (lk.toCol === ci && lk.to === n.key) {
            other = { col: lk.fromCol, key: lk.from };
          }
          if (!other) continue;
          const c = centers[other.col]?.get(other.key);
          if (c === undefined) continue;
          sum += c * lk.count;
          wsum += lk.count;
        }
        bary.set(n.key, wsum > 0 ? sum / wsum : centers[ci].get(n.key) ?? 0.5);
      }
      list.sort(
        (a, b) => bary.get(a.key)! - bary.get(b.key)! || b.count - a.count,
      );
      computeCenters(ci);
    };

    for (let round = 0; round < 3; round++) {
      for (let ci = 1; ci < nCols; ci++) sweep(ci);
      for (let ci = nCols - 2; ci >= 0; ci--) sweep(ci);
    }
  }

  // Per-trajectory height unit shared across columns. Each column's nodes
  // need `total * unit + gaps` to fit within `innerH`; the most-crowded
  // column pins `unit` so nothing overflows. Columns with fewer trajectories
  // become shorter, leaving whitespace for skip-edges to pass through.
  let unit = Infinity;
  for (let ci = 0; ci < nCols; ci++) {
    const list = byCol[ci] ?? [];
    if (!list.length) continue;
    const total = list.reduce((a, n) => a + n.count, 0);
    if (total <= 0) continue;
    const nGaps = Math.max(0, list.length - 1);
    const colUnit = Math.max(1, innerH - nGaps * gapY) / total;
    if (colUnit < unit) unit = colUnit;
  }
  if (!Number.isFinite(unit) || unit <= 0) unit = innerH;

  // Align each column. The largest column fills `innerH` either way; shorter
  // columns leave whitespace on the opposite side, which is exactly where
  // skip-edges from earlier columns to later ones flow without crossing
  // intermediate nodes: bottom-aligned columns route skips over the TOP,
  // top-aligned columns collect them in a bottom gutter.
  const orderedNodes: NodeLayout[] = [];
  const nodeIndex = new Map<string, NodeLayout>(); // key: "col|key"
  const bottomY = padTop + innerH;
  for (let ci = 0; ci < nCols; ci++) {
    const col = columns[ci];
    const list = byCol[ci] ?? [];
    if (!list.length) continue;
    const colTotal = list.reduce((a, n) => a + n.count, 0);
    const nGaps = Math.max(0, list.length - 1);
    const colHeight = colTotal * unit + nGaps * gapY;
    let y = align === "top" ? padTop : bottomY - colHeight;
    const geom = colGeom[ci];
    for (const n of list) {
      const h = Math.max(1, n.count * unit);
      const layout: NodeLayout = {
        ...n,
        x: geom.x,
        y,
        w: geom.w,
        h,
        label: n.key === OTHER_KEY ? "other" : n.key,
        color: n.key === OTHER_KEY ? "#9498A0" : palette(col.name, n.key),
      };
      orderedNodes.push(layout);
      nodeIndex.set(`${ci}|${n.key}`, layout);
      y += h + gapY;
    }
  }

  // Layout links — sub-bands proportional within source/target. Attachment
  // offsets are assigned per node: a source's outgoing ribbons attach
  // top-to-bottom in destination-position order, a destination's incoming
  // ribbons in source-position order — so ribbons never twist at a node
  // boundary (skip-edges used to braid here, attaching in column order).
  const valid = linkRows.filter(
    (lk) =>
      nodeIndex.has(`${lk.fromCol}|${lk.from}`) &&
      nodeIndex.has(`${lk.toCol}|${lk.to}`),
  );
  const srcNode = (lk: LinkRow) => nodeIndex.get(`${lk.fromCol}|${lk.from}`)!;
  const dstNode = (lk: LinkRow) => nodeIndex.get(`${lk.toCol}|${lk.to}`)!;

  // Group the links touching each node end, order them by the OPPOSITE
  // end's position, and stack proportional offsets down the node.
  const attachOffsets = (
    endNode: (lk: LinkRow) => NodeLayout,
    oppositeNode: (lk: LinkRow) => NodeLayout,
  ): Map<LinkRow, number> => {
    const groups = new Map<NodeLayout, LinkRow[]>();
    for (const lk of valid) {
      const n = endNode(lk);
      (groups.get(n) ?? groups.set(n, []).get(n)!).push(lk);
    }
    const offs = new Map<LinkRow, number>();
    for (const [n, group] of groups) {
      group.sort(
        (a, b) =>
          oppositeNode(a).y - oppositeNode(b).y ||
          oppositeNode(a).x - oppositeNode(b).x,
      );
      let off = 0;
      for (const lk of group) {
        offs.set(lk, off);
        off += (lk.count / (n.count || 1)) * n.h;
      }
    }
    return offs;
  };
  const srcOffs = attachOffsets(srcNode, dstNode);
  const dstOffs = attachOffsets(dstNode, srcNode);

  const linkLayouts: LinkLayout[] = valid.map((lk) => {
    const src = srcNode(lk);
    const dst = dstNode(lk);
    return {
      ...lk,
      x0: src.x + src.w,
      y0: src.y + (srcOffs.get(lk) ?? 0),
      x1: dst.x,
      y1: dst.y + (dstOffs.get(lk) ?? 0),
      t0: (lk.count / (src.count || 1)) * src.h,
      t1: (lk.count / (dst.count || 1)) * dst.h,
      // Color the ribbon by its DESTINATION node's colour. This makes the
      // sankey read as "where did this lead?" — outcomes (success/fail/partial)
      // get strong distinct colours flowing INTO them; intermediate columns
      // inherit the next-step's tool colour. Falls back to the destination's
      // resolved node colour when the dst was collapsed into "other".
      color: dst.color,
    };
  });

  // Paint big bands first so thin ribbons draw on top and stay traceable.
  linkLayouts.sort((a, b) => b.count - a.count);

  return { nodes: orderedNodes, links: linkLayouts, cols: colGeom };
}

// Approximate glyph widths for the 12px/11px label fonts. Fit strategy:
// full "name count" → drop the count → ellipsis-truncate the name.
const LABEL_CHAR_W = 6.5;
const VALUE_CHAR_W = 6.2;

function fitNodeLabel(
  name: string,
  countStr: string,
  avail: number,
): { text: string; showCount: boolean } {
  const nameW = name.length * LABEL_CHAR_W;
  if (nameW + 6 + countStr.length * VALUE_CHAR_W <= avail) {
    return { text: name, showCount: true };
  }
  if (nameW <= avail) return { text: name, showCount: false };
  const maxChars = Math.max(4, Math.floor(avail / LABEL_CHAR_W));
  if (maxChars >= name.length) return { text: name, showCount: false };
  return { text: `${name.slice(0, maxChars - 1)}…`, showCount: false };
}

function ribbonPath(x0: number, y0: number, t0: number, x1: number, y1: number, t1: number): string {
  const mx = (x0 + x1) / 2;
  return [
    `M${x0},${y0}`,
    `C${mx},${y0} ${mx},${y1} ${x1},${y1}`,
    `L${x1},${y1 + t1}`,
    `C${mx},${y1 + t1} ${mx},${y0 + t0} ${x0},${y0 + t0}`,
    "Z",
  ].join(" ");
}

const OTHER_KEY = "__other__";

/**
 * Per-column, keep the top (k-1) nodes and aggregate the long tail into a
 * single synthetic `__other__` node. Re-route any link whose endpoint was
 * collapsed to point at the synthetic node and merge duplicate links.
 */
function collapseTopK(
  nodes: NodeRow[],
  links: LinkRow[],
  columns: SankeyColumnSpec[],
  k: number,
): { nodes: NodeRow[]; links: LinkRow[] } {
  // Build the set of "kept" keys per column.
  const kept: Array<Set<string>> = columns.map(() => new Set());
  // Group nodes by column.
  const byCol: Record<number, NodeRow[]> = {};
  for (const n of nodes) (byCol[n.col] ??= []).push(n);

  const collapsedNodes: NodeRow[] = [];
  for (let ci = 0; ci < columns.length; ci++) {
    const list = (byCol[ci] ?? []).slice().sort((a, b) => b.count - a.count);
    if (list.length <= k) {
      list.forEach((n) => kept[ci].add(n.key));
      collapsedNodes.push(...list);
      continue;
    }
    const head = list.slice(0, k - 1);
    const tail = list.slice(k - 1);
    head.forEach((n) => kept[ci].add(n.key));
    const otherIds = new Set<string>();
    let otherCount = 0;
    for (const t of tail) {
      otherCount += t.count;
      t.trajIds.forEach((id) => otherIds.add(id));
    }
    collapsedNodes.push(...head, {
      col: ci,
      key: OTHER_KEY,
      count: otherCount,
      trajIds: otherIds,
    });
  }

  // Re-route links: replace any endpoint not in `kept` with OTHER_KEY, then
  // merge duplicates. Link span (fromCol, toCol) is preserved so skip edges
  // continue to skip after collapse.
  const linkMap = new Map<string, LinkRow>();
  for (const lk of links) {
    const fromKey = kept[lk.fromCol].has(lk.from) ? lk.from : OTHER_KEY;
    const toKey = kept[lk.toCol]?.has(lk.to) ? lk.to : OTHER_KEY;
    const key = `${lk.fromCol}|${fromKey}|${lk.toCol}|${toKey}`;
    const existing = linkMap.get(key);
    if (existing) {
      existing.count += lk.count;
      lk.trajIds.forEach((id) => existing.trajIds.add(id));
    } else {
      linkMap.set(key, {
        fromCol: lk.fromCol,
        toCol: lk.toCol,
        from: fromKey,
        to: toKey,
        count: lk.count,
        trajIds: new Set(lk.trajIds),
      });
    }
  }

  return { nodes: collapsedNodes, links: Array.from(linkMap.values()) };
}
