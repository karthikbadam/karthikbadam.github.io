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
  /** Trajectory ids to highlight (e.g. clicked-row in the trajectory table).
   * Ribbons whose trajectory set intersects this are emphasised; the rest
   * dim. */
  highlightedTrajIds?: Set<string> | null;
  /** Optional fired-after-Selection-write callback. */
  onLinkClick?: (col: number, from: string, to: string, ids: string[]) => void;
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
  highlightedTrajIds,
  onLinkClick,
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
    const linkPairs: Array<{ i: number; j: number }> = [];
    for (let i = 0; i < columns.length - 1; i++) {
      for (let j = i + 1; j < columns.length; j++) linkPairs.push({ i, j });
    }
    const noneStr = `'${NONE_VALUE.replace(/'/g, "''")}'`;
    const realCheck = (k: number) =>
      `${col(columns[k].name)} IS NOT NULL AND ${col(columns[k].name)} <> ${noneStr}`;
    const noneCheck = (k: number) =>
      `${col(columns[k].name)} = ${noneStr}`;

    (async () => {
      try {
        const [nodeRes, linkRes] = await Promise.all([
          Promise.all(
            columns.map((c, i) =>
              coordinator
                .query(`
                  ${trajCte}
                  SELECT ${col(c.name)} AS key, COUNT(*) AS n,
                         ARRAY_AGG(traj_id) AS traj_ids
                  FROM traj_cols
                  WHERE ${col(c.name)} IS NOT NULL AND ${col(c.name)} <> ${noneStr}
                  GROUP BY 1 ORDER BY n DESC
                `)
                .then((r) => ({ i, rows: arrowRows(r) })),
            ),
          ),
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
        for (const { i, rows } of nodeRes) {
          for (const r of rows) {
            nextNodes.push({
              col: i,
              key: String(r.key ?? ""),
              count: Number(r.n ?? 0),
              trajIds: new Set(asArray(r.traj_ids).map(String)),
            });
          }
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
    return layoutSankey(columns, nodes, links, size.w, size.h, orderings, palette);
  }, [columns, nodes, links, size.w, size.h, orderings, palette]);

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

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg width={size.w} height={size.h} style={{ display: "block" }}>
        <Group>
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
                opacity={accent ? 0.85 : dimmed ? 0.04 : 0.32}
                style={{ cursor: "pointer", transition: "opacity .15s" }}
                onClick={() => handleClick(lk)}
                onMouseEnter={() => setHover({ kind: "link", lk })}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
          {layout.nodes.map((n, i) => {
            // Drop labels on rectangles too short to fit the text — they
            // collide otherwise. The "other" node is small but always shown.
            const showLabel = n.h >= 11 || n.key === OTHER_KEY;
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
                />
                {showLabel && (
                  <text
                    x={n.col === columns.length - 1 ? n.x - 6 : n.x + n.w + 6}
                    y={n.y + n.h / 2 + 4}
                    fill={chartFg(dark)}
                    textAnchor={n.col === columns.length - 1 ? "end" : "start"}
                    pointerEvents="none"
                    style={chartLabelStyle}
                    opacity={dimmedNode ? 0.4 : 1}
                  >
                    {n.label}
                    {n.h >= 14 && (
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
            const labelText = c.label ?? c.name;
            // Anchor each header above its column by reading the first node
            // we placed in that column. Falls back to size endpoints if a
            // column is empty.
            const firstNode = layout.nodes.find((n) => n.col === i);
            const lastCol = i === columns.length - 1;
            const x = firstNode
              ? lastCol
                ? firstNode.x + firstNode.w
                : firstNode.x
              : lastCol
              ? size.w - 8
              : 8;
            const anchor = lastCol ? "end" : "start";
            return (
              <text
                key={`h-${i}`}
                x={x}
                y={12}
                fill={chartFgMuted(dark)}
                textAnchor={anchor}
                style={chartColumnHeaderStyle}
              >
                {labelText}
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

function layoutSankey(
  columns: SankeyColumnSpec[],
  nodeRows: NodeRow[],
  linkRows: LinkRow[],
  width: number,
  height: number,
  orderings: Record<string, string[]> | undefined,
  palette: (column: string, value: string) => string,
): { nodes: NodeLayout[]; links: LinkLayout[] } {
  if (!nodeRows.length || !columns.length) return { nodes: [], links: [] };
  const colW = 14;
  // Outcome / last-column labels are anchored to the LEFT of their rect
  // (textAnchor='end' with x=n.x - 6) so we don't need extra right margin.
  const padLeft = 8;
  const padRight = 8;
  const padTop = 22;
  const padBottom = 8;
  const innerW = Math.max(0, width - padLeft - padRight);
  const innerH = Math.max(0, height - padTop - padBottom);
  const nCols = columns.length;
  const gapX = nCols > 1 ? (innerW - nCols * colW) / (nCols - 1) : 0;

  // Group nodes by column, apply ordering.
  const byCol: Record<number, NodeRow[]> = {};
  for (const n of nodeRows) {
    (byCol[n.col] ??= []).push(n);
  }
  const gapY = 6;

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

  // Bottom-align each column. Largest column reaches the top because its
  // total fills `innerH`; shorter columns leave whitespace at the TOP of the
  // chart, which is exactly where skip-edges from earlier columns to later
  // ones need to flow without crossing intermediate nodes.
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
    let y = bottomY - colHeight;
    for (const n of list) {
      const h = Math.max(1, n.count * unit);
      const x = padLeft + ci * (colW + gapX);
      const layout: NodeLayout = {
        ...n,
        x,
        y,
        w: colW,
        h,
        label: n.key === OTHER_KEY ? "other" : n.key,
        color: n.key === OTHER_KEY ? "#9498A0" : palette(col.name, n.key),
      };
      orderedNodes.push(layout);
      nodeIndex.set(`${ci}|${n.key}`, layout);
      y += h + gapY;
    }
  }

  // Layout links — sub-bands proportional within source/target.
  const fromOff = new Map<string, number>();
  const toOff = new Map<string, number>();
  // Sort links in column-major order so layout is deterministic.
  const sortedLinks = linkRows.slice().sort((a, b) => {
    if (a.fromCol !== b.fromCol) return a.fromCol - b.fromCol;
    const srcA = nodeIndex.get(`${a.fromCol}|${a.from}`);
    const srcB = nodeIndex.get(`${b.fromCol}|${b.from}`);
    const dstA = nodeIndex.get(`${a.toCol}|${a.to}`);
    const dstB = nodeIndex.get(`${b.toCol}|${b.to}`);
    if (srcA && srcB && srcA.y !== srcB.y) return srcA.y - srcB.y;
    if (dstA && dstB) return dstA.y - dstB.y;
    return 0;
  });

  const linkLayouts: LinkLayout[] = [];
  for (const lk of sortedLinks) {
    const src = nodeIndex.get(`${lk.fromCol}|${lk.from}`);
    const dst = nodeIndex.get(`${lk.toCol}|${lk.to}`);
    if (!src || !dst) continue;
    const srcKey = `${lk.fromCol}|${lk.from}`;
    const dstKey = `${lk.toCol}|${lk.to}`;
    const srcSum = src.count || 1;
    const dstSum = dst.count || 1;
    const srcThickness = (lk.count / srcSum) * src.h;
    const dstThickness = (lk.count / dstSum) * dst.h;
    const srcOff = fromOff.get(srcKey) ?? 0;
    const dstOff = toOff.get(dstKey) ?? 0;
    linkLayouts.push({
      ...lk,
      x0: src.x + src.w,
      y0: src.y + srcOff,
      x1: dst.x,
      y1: dst.y + dstOff,
      t0: srcThickness,
      t1: dstThickness,
      // Color the ribbon by its DESTINATION node's colour. This makes the
      // sankey read as "where did this lead?" — outcomes (success/fail/partial)
      // get strong distinct colours flowing INTO them; intermediate columns
      // inherit the next-step's tool colour. Falls back to the destination's
      // resolved node colour when the dst was collapsed into "other".
      color: dst.color,
    });
    fromOff.set(srcKey, srcOff + srcThickness);
    toOff.set(dstKey, dstOff + dstThickness);
  }

  return { nodes: orderedNodes, links: linkLayouts };
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
