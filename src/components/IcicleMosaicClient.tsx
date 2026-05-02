/**
 * IcicleMosaicClient — generic Mosaic-backed icicle plot.
 *
 * Renders a hierarchical step-icicle from a long table where each row is one
 * step in one trajectory: (idCol, levelCol, categoryCol). The component is
 * fully data-driven — depth is whatever depth the data carries; the optional
 * `maxLevels` prop only narrows the tree if the caller wants to focus on the
 * head of trajectories.
 *
 * The component is a real `MosaicClient` (via `makeClient`): it binds to a
 * crossfilter `Selection`, re-queries DuckDB whenever upstream clauses change,
 * and writes its own clause when a cell is clicked.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { makeClient } from "@uwdata/mosaic-core";
import { clauseList } from "@uwdata/mosaic-core";
import { Query, sql, column } from "@uwdata/mosaic-sql";
import type { Coordinator, MosaicClient, Selection as VgSelection } from "@uwdata/mosaic-core";
import { Group } from "@visx/group";
import { Bar } from "@visx/shape";

export type IcicleColorRamp = (level: number, maxLevel: number, dark: boolean) => string;

export interface IcicleMosaicClientProps {
  coordinator: Coordinator;
  /** Source table; rows are individual steps. */
  table: string;
  /** Unique trajectory id column. Used to compute click-filter clauses. */
  idCol: string;
  /** Step-index column (numeric, 0-based). */
  levelCol: string;
  /** Category column (string label). */
  categoryCol: string;
  /** Optional crossfilter the icicle reads (and writes click clauses to). */
  selection?: VgSelection | null;
  /** Optional perf cap. Undefined renders every level present in the data. */
  maxLevels?: number;
  /** Color of each rect; defaults to a sequential blue ramp (light) / sand (dark). */
  colorRamp?: IcicleColorRamp;
  /** Label resolver for category names. Defaults to identity. */
  labelFor?: (category: string) => string;
  /** Whether to use the dark color ramp. The site's theme provider supplies this. */
  dark?: boolean;
  /** Trajectory ids to highlight (e.g. selected row). */
  highlightedTrajIds?: Set<string> | null;
  /** Optional fired-after-Selection-write callback. */
  onCellClick?: (level: number, category: string, trajIds: Set<string>) => void;
}

interface PathRow {
  level: number;
  category: string;
  path: string;
  n: number;
  trajIds: Set<string>;
}

interface TreeNode {
  level: number;
  category: string;
  path: string;
  n: number;
  trajIds: Set<string>;
  children: TreeNode[];
}

interface LayoutRect {
  node: TreeNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_RAMP: IcicleColorRamp = (level, maxLevel, dark) => {
  const t = Math.min(1, level / Math.max(1, maxLevel - 1));
  if (dark) {
    const l = 28 + t * 50;
    return `oklch(${l}% 0.04 75)`;
  }
  const l = 92 - t * 50;
  const c = 0.02 + t * 0.1;
  return `oklch(${l}% ${c} 245)`;
};

export function IcicleMosaicClient({
  coordinator,
  table,
  idCol,
  levelCol,
  categoryCol,
  selection,
  maxLevels,
  colorRamp = DEFAULT_RAMP,
  labelFor = (s) => s,
  dark = false,
  highlightedTrajIds,
  onCellClick,
}: IcicleMosaicClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [rows, setRows] = useState<PathRow[]>([]);
  const [hover, setHover] = useState<LayoutRect | null>(null);
  const [localSelection, setLocalSelection] = useState<{ level: number; category: string } | null>(
    null,
  );
  const clientRef = useRef<MosaicClient | null>(null);

  // ResizeObserver — drives the SVG layout responsively.
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Build the path-tree query. Group by (step_idx, running prefix) so each
  // (level, prefix) is one icicle node. The CTE concatenates the running
  // category path per trajectory.
  const buildQuery = useMemo(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function (predicate: any) {
        const id = column(idCol);
        const lvl = column(levelCol);
        const cat = column(categoryCol);
        const cap =
          typeof maxLevels === "number"
            ? sql`${lvl} < ${maxLevels}`
            : sql`true`;

        // For the inner ranked CTE, we need the predicate AND the level cap.
        const rankedQuery = Query.from(table)
          .select({
            traj_id: id,
            step_idx: lvl,
            category: cat,
            path: sql`STRING_AGG(${cat}, '>') OVER (PARTITION BY ${id} ORDER BY ${lvl} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`,
          })
          .where(cap);
        if (predicate) rankedQuery.where(predicate);

        return Query.with({ ranked: rankedQuery })
          .from("ranked")
          .select({
            step_idx: column("step_idx"),
            category: column("category"),
            path: column("path"),
            n: sql`COUNT(DISTINCT traj_id)`,
            traj_ids: sql`ARRAY_AGG(DISTINCT traj_id)`,
          })
          .groupby("step_idx", "category", "path")
          .orderby(column("step_idx"), sql`COUNT(DISTINCT traj_id) DESC`);
      },
    [table, idCol, levelCol, categoryCol, maxLevels],
  );

  // Mosaic client lifecycle.
  useEffect(() => {
    if (!coordinator) return;
    const client = makeClient({
      coordinator,
      selection: selection ?? undefined,
      query: buildQuery,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryResult: (data: any) => {
        const arr = typeof data?.toArray === "function" ? data.toArray() : data;
        const out: PathRow[] = [];
        for (const r of arr ?? []) {
          out.push({
            level: Number(r.step_idx ?? 0),
            category: String(r.category ?? ""),
            path: String(r.path ?? ""),
            n: Number(r.n ?? 0),
            trajIds: new Set(asArray(r.traj_ids).map(String)),
          });
        }
        setRows(out);
      },
      queryError: (err) => {
        console.error("[IcicleMosaicClient] query error:", err);
      },
    });
    clientRef.current = client;
    return () => {
      client.destroy();
      clientRef.current = null;
    };
  }, [coordinator, selection, buildQuery]);

  // Build hierarchy from path rows + lay out.
  const { rects, totalN, maxLevelInData } = useMemo(() => {
    const tree = buildTree(rows);
    const totalN = tree.children.reduce((a, c) => a + c.n, 0) || 1;
    const maxLevelInData =
      rows.reduce((m, r) => Math.max(m, r.level), -1) + 1; // +1 because levels are 0-based
    const levels = maxLevels ?? Math.max(1, maxLevelInData);
    return {
      rects: layoutTree(tree, size.w || 1, size.h || 1, levels),
      totalN,
      maxLevelInData: levels,
    };
  }, [rows, size.w, size.h, maxLevels]);

  function isSelected(rect: LayoutRect): boolean {
    return (
      localSelection !== null &&
      localSelection.level === rect.node.level &&
      localSelection.category === rect.node.category
    );
  }

  function handleClick(rect: LayoutRect) {
    const next = isSelected(rect)
      ? null
      : { level: rect.node.level, category: rect.node.category };
    setLocalSelection(next);

    if (selection && clientRef.current) {
      const client = clientRef.current;
      if (next === null) {
        selection.update(
          clauseList(idCol, null, { source: client, clients: new Set([client]) }),
        );
      } else {
        const ids = Array.from(rect.node.trajIds);
        selection.update(
          clauseList(idCol, ids, { source: client, clients: new Set([client]) }),
        );
      }
    }

    onCellClick?.(rect.node.level, rect.node.category, rect.node.trajIds);
  }

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg width={size.w} height={size.h} style={{ display: "block" }}>
        <Group>
          {rects.map((r, i) => {
            const sel = isSelected(r);
            const dimmed =
              localSelection !== null && !sel && !pathContainsSelection(r, localSelection);
            const hi = highlightedTrajIds && setIntersects(r.node.trajIds, highlightedTrajIds);
            return (
              <Group key={i}>
                <Bar
                  x={r.x + 1}
                  y={r.y + 1}
                  width={Math.max(0, r.w - 2)}
                  height={Math.max(0, r.h - 2)}
                  fill={colorRamp(r.node.level, maxLevelInData, dark)}
                  stroke={
                    sel
                      ? "var(--chakra-colors-accent)"
                      : hi
                      ? "var(--chakra-colors-accent)"
                      : "var(--chakra-colors-bg-panel)"
                  }
                  strokeWidth={sel ? 2 : hi ? 1.5 : 1}
                  opacity={dimmed ? 0.25 : 1}
                  rx={2}
                  style={{ cursor: "pointer", transition: "opacity .2s" }}
                  onClick={() => handleClick(r)}
                  onMouseEnter={() => setHover(r)}
                  onMouseLeave={() => setHover(null)}
                />
                {r.w > 60 && r.h > 16 && (
                  <text
                    x={r.x + 8}
                    y={r.y + r.h / 2 + 4}
                    fontSize="12"
                    fontWeight="500"
                    fontFamily="var(--font-mono, ui-monospace)"
                    fill={
                      r.node.level > maxLevelInData * 0.55
                        ? "var(--chakra-colors-bg-panel)"
                        : "var(--chakra-colors-fg)"
                    }
                    pointerEvents="none"
                    opacity={dimmed ? 0.35 : 0.95}
                  >
                    {labelFor(r.node.category)}
                    {r.w > 140 ? (
                      <tspan opacity="0.6" dx="6" fontFamily="inherit">
                        {((r.node.n / totalN) * 100).toFixed(1)}%
                      </tspan>
                    ) : null}
                  </text>
                )}
              </Group>
            );
          })}
        </Group>
      </svg>
      {hover && (
        <div
          className="ta-tooltip"
          style={{
            left: Math.min(hover.x + 8, size.w - 200),
            top: Math.max(0, hover.y - 6),
          }}
        >
          <div className="ta-t-title">
            Step {hover.node.level + 1} · {labelFor(hover.node.category)}
          </div>
          <div className="ta-t-row">
            <span>trajectories</span>
            <b>{hover.node.n.toLocaleString()}</b>
          </div>
          <div className="ta-t-row">
            <span>share of total</span>
            <b>{((hover.node.n / totalN) * 100).toFixed(1)}%</b>
          </div>
        </div>
      )}
    </div>
  );
}

// ----- helpers --------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asArray(x: any): unknown[] {
  if (Array.isArray(x)) return x;
  if (x && typeof x.toArray === "function") return x.toArray();
  if (x == null) return [];
  return [x];
}

function buildTree(rows: PathRow[]): TreeNode {
  const root: TreeNode = {
    level: -1,
    category: "_root",
    path: "",
    n: 0,
    trajIds: new Set(),
    children: [],
  };
  // Index by (level, path) for quick parent lookup.
  const byPath = new Map<string, TreeNode>();
  byPath.set("", root);

  // Sort rows by level so parents are inserted before children.
  const sorted = rows.slice().sort((a, b) => a.level - b.level);
  for (const r of sorted) {
    const node: TreeNode = {
      level: r.level,
      category: r.category,
      path: r.path,
      n: r.n,
      trajIds: r.trajIds,
      children: [],
    };
    byPath.set(r.path, node);
    const parentPath = parentOf(r.path);
    const parent = byPath.get(parentPath) ?? root;
    parent.children.push(node);
  }
  // Sort siblings by count desc (stable on category for tie-break).
  const sortChildren = (n: TreeNode) => {
    n.children.sort((a, b) => b.n - a.n || a.category.localeCompare(b.category));
    n.children.forEach(sortChildren);
  };
  sortChildren(root);
  return root;
}

function parentOf(path: string): string {
  const i = path.lastIndexOf(">");
  return i < 0 ? "" : path.slice(0, i);
}

function layoutTree(root: TreeNode, width: number, height: number, levels: number): LayoutRect[] {
  const rects: LayoutRect[] = [];
  const levelHeight = height / Math.max(1, levels);
  const total = root.children.reduce((a, c) => a + c.n, 0) || 1;

  function recurse(node: TreeNode, x: number, w: number, parentTotal: number) {
    if (node.level >= levels - 1 + 0) {
      // we already placed this node; recursion handles children.
    }
    let cursorX = x;
    for (const child of node.children) {
      const childW = (child.n / parentTotal) * w;
      rects.push({
        node: child,
        x: cursorX,
        y: child.level * levelHeight,
        w: childW,
        h: levelHeight,
      });
      if (child.level < levels - 1) {
        recurse(child, cursorX, childW, child.n);
      }
      cursorX += childW;
    }
  }
  recurse(root, 0, width, total);
  return rects;
}

function pathContainsSelection(
  rect: LayoutRect,
  sel: { level: number; category: string },
): boolean {
  // An ancestor or descendant of the selected node should stay highlighted.
  const tokens = rect.node.path.split(">");
  if (rect.node.level === sel.level && rect.node.category === sel.category) return true;
  // Descendant: the selection's category must be at index sel.level in this node's path.
  if (rect.node.level > sel.level && tokens[sel.level] === sel.category) return true;
  return false;
}

function setIntersects(a: Set<string>, b: Set<string>): boolean {
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  let found = false;
  s.forEach((x) => {
    if (!found && l.has(x)) found = true;
  });
  return found;
}
