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
import { clauseList } from "@uwdata/mosaic-core";
import type { Coordinator, Selection as VgSelection } from "@uwdata/mosaic-core";
import { Group } from "@visx/group";
import { Bar } from "@visx/shape";

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
  from: string;
  to: string;
  count: number;
  trajIds: Set<string>;
}

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
  onLinkClick,
}: SankeyMosaicClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [hover, setHover] = useState<LinkLayout | null>(null);
  const [localSelection, setLocalSelection] = useState<{ col: number; from: string; to: string } | null>(null);

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
                  FROM traj_cols WHERE ${col(c.name)} IS NOT NULL
                  GROUP BY 1 ORDER BY n DESC
                `)
                .then((r) => ({ i, rows: arrowRows(r) })),
            ),
          ),
          Promise.all(
            columns.slice(0, -1).map((c, i) =>
              coordinator
                .query(`
                  ${trajCte}
                  SELECT ${col(c.name)} AS from_key, ${col(columns[i + 1].name)} AS to_key,
                         COUNT(*) AS n, ARRAY_AGG(traj_id) AS traj_ids
                  FROM traj_cols
                  WHERE ${col(c.name)} IS NOT NULL AND ${col(columns[i + 1].name)} IS NOT NULL
                  GROUP BY 1, 2 ORDER BY 1, 2
                `)
                .then((r) => ({ i, rows: arrowRows(r) })),
            ),
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
        for (const { i, rows } of linkRes) {
          for (const r of rows) {
            nextLinks.push({
              fromCol: i,
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
      localSelection.from === lk.from &&
      localSelection.to === lk.to
    );
  }

  function handleClick(lk: LinkLayout) {
    const next = isSelected(lk) ? null : { col: lk.fromCol, from: lk.from, to: lk.to };
    setLocalSelection(next);
    if (selection) {
      if (next === null) {
        selection.update(
          clauseList(idCol, null, { source: sourceRef.current, clients: new Set() }),
        );
      } else {
        const ids = Array.from(lk.trajIds);
        selection.update(
          clauseList(idCol, ids, { source: sourceRef.current, clients: new Set() }),
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
            const dimmed = localSelection !== null && !sel;
            return (
              <path
                key={`l-${i}`}
                d={ribbonPath(lk.x0, lk.y0, lk.t0, lk.x1, lk.y1, lk.t1)}
                fill={lk.color}
                opacity={sel ? 0.85 : dimmed ? 0.06 : 0.32}
                style={{ cursor: "pointer", transition: "opacity .2s" }}
                onClick={() => handleClick(lk)}
                onMouseEnter={() => setHover(lk)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
          {layout.nodes.map((n, i) => (
            <Group key={`n-${i}`}>
              <Bar
                x={n.x}
                y={n.y}
                width={n.w}
                height={Math.max(1, n.h)}
                fill={n.color}
                rx={2}
                opacity={0.95}
              />
              <text
                x={n.col === columns.length - 1 ? n.x - 6 : n.x + n.w + 6}
                y={n.y + n.h / 2 + 3}
                fontSize="11"
                fontWeight="500"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
                fill={dark ? "#f7fafc" : "#1a202c"}
                textAnchor={n.col === columns.length - 1 ? "end" : "start"}
                pointerEvents="none"
              >
                {n.label}
                {n.h > 14 && (
                  <tspan opacity="0.6" dx="6" fontSize="10" fontFamily="inherit">
                    {n.count.toLocaleString()}
                  </tspan>
                )}
              </text>
            </Group>
          ))}
          {columns.map((c, i) => {
            const labelText = c.label ?? c.name;
            const x =
              i === 0
                ? 0
                : i === columns.length - 1
                ? size.w
                : (size.w * i) / Math.max(1, columns.length - 1);
            const anchor = i === 0 ? "start" : i === columns.length - 1 ? "end" : "middle";
            return (
              <text
                key={`h-${i}`}
                x={x}
                y={10}
                fontSize="9"
                fontWeight="600"
                letterSpacing="0.06em"
                fill={dark ? "#a0aec0" : "#718096"}
                textAnchor={anchor}
                style={{ textTransform: "uppercase" }}
              >
                {labelText}
              </text>
            );
          })}
        </Group>
      </svg>
      {hover && (
        <div
          style={{
            position: "absolute",
            left: Math.min((hover.x0 + hover.x1) / 2, Math.max(0, size.w - 240)),
            top: Math.max(0, Math.min((hover.y0 + hover.y1) / 2 - 10, size.h - 80)),
            background: dark ? "#1a202c" : "#ffffff",
            color: dark ? "#f7fafc" : "#1a202c",
            border: `1px solid ${dark ? "#2d3748" : "#e2e8f0"}`,
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,.18)",
            padding: "6px 10px",
            fontSize: 11,
            pointerEvents: "none",
            width: 220,
            maxWidth: 220,
            zIndex: 5,
            lineHeight: 1.5,
            whiteSpace: "normal",
            wordBreak: "break-all",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {hover.from === OTHER_KEY ? "other" : hover.from}
            {" → "}
            {hover.to === OTHER_KEY ? "other" : hover.to}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: dark ? "#cbd5e0" : "#4a5568" }}>
            <span>trajectories</span>
            <b style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "inherit", fontWeight: 500 }}>
              {hover.count.toLocaleString()}
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function arrowRows(table: any): Record<string, unknown>[] {
  if (!table) return [];
  if (typeof table.toArray === "function") return table.toArray();
  if (Array.isArray(table)) return table;
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asArray(x: any): unknown[] {
  if (Array.isArray(x)) return x;
  if (x && typeof x.toArray === "function") return x.toArray();
  if (x == null) return [];
  return [x];
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
  const colW = 16;
  const padX = 4;
  const padY = 18; // leave room for the column header text
  const innerW = Math.max(0, width - 2 * padX);
  const innerH = Math.max(0, height - padY - 8);
  const nCols = columns.length;
  const gapX = nCols > 1 ? (innerW - nCols * colW) / (nCols - 1) : 0;

  // Group nodes by column, apply ordering.
  const byCol: Record<number, NodeRow[]> = {};
  for (const n of nodeRows) {
    (byCol[n.col] ??= []).push(n);
  }
  const orderedNodes: NodeLayout[] = [];
  const nodeIndex = new Map<string, NodeLayout>(); // key: "col|key"
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
    const nGaps = Math.max(0, list.length - 1);
    const gapY = 6;
    const totalCount = list.reduce((a, n) => a + n.count, 0) || 1;
    const usableH = Math.max(0, innerH - nGaps * gapY);
    let y = padY;
    for (const n of list) {
      const h = (n.count / totalCount) * usableH;
      const x = padX + ci * (colW + gapX);
      const layout: NodeLayout = {
        ...n,
        x,
        y,
        w: colW,
        h,
        label: n.key === OTHER_KEY ? "other" : n.key,
        color: n.key === OTHER_KEY
          ? "var(--chart-gray)"
          : palette(col.name, n.key),
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
    const dstA = nodeIndex.get(`${a.fromCol + 1}|${a.to}`);
    const dstB = nodeIndex.get(`${b.fromCol + 1}|${b.to}`);
    if (srcA && srcB && srcA.y !== srcB.y) return srcA.y - srcB.y;
    if (dstA && dstB) return dstA.y - dstB.y;
    return 0;
  });

  const linkLayouts: LinkLayout[] = [];
  for (const lk of sortedLinks) {
    const src = nodeIndex.get(`${lk.fromCol}|${lk.from}`);
    const dst = nodeIndex.get(`${lk.fromCol + 1}|${lk.to}`);
    if (!src || !dst) continue;
    const srcKey = `${lk.fromCol}|${lk.from}`;
    const dstKey = `${lk.fromCol + 1}|${lk.to}`;
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
      color: palette(columns[lk.fromCol].name, lk.from),
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
  // merge duplicates.
  const linkMap = new Map<string, LinkRow>();
  for (const lk of links) {
    const fromKey = kept[lk.fromCol].has(lk.from) ? lk.from : OTHER_KEY;
    const toKey = kept[lk.fromCol + 1]?.has(lk.to) ? lk.to : OTHER_KEY;
    const key = `${lk.fromCol}|${fromKey}|${toKey}`;
    const existing = linkMap.get(key);
    if (existing) {
      existing.count += lk.count;
      lk.trajIds.forEach((id) => existing.trajIds.add(id));
    } else {
      linkMap.set(key, {
        fromCol: lk.fromCol,
        from: fromKey,
        to: toKey,
        count: lk.count,
        trajIds: new Set(lk.trajIds),
      });
    }
  }

  return { nodes: collapsedNodes, links: Array.from(linkMap.values()) };
}
