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
 *
 * Selection is **path-based**: clicking a node highlights only nodes that
 * share the clicked path's prefix or extension (i.e. ancestors and
 * descendants in the SAME branch). Sibling nodes that happen to carry the
 * same label at the same level are dimmed, not highlighted.
 *
 * The optional `filterStepNames` prop drops the listed step values from the
 * tree entirely (used for hiding meta-steps like "task"/"thought"/"observation"
 * so each level represents the i-th tool call rather than the i-th message).
 *
 * The optional `maxNodesPerLevel` prop caps each tree level at K-1 children
 * plus a synthetic `other (M)` node aggregating the long tail.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { makeClient, clausePoints } from "@uwdata/mosaic-core";
import { Query, sql, column, verbatim } from "@uwdata/mosaic-sql";
import type { Coordinator, MosaicClient, Selection as VgSelection } from "@uwdata/mosaic-core";
import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import {
  chartFg,
  chartFgInverse,
  chartLabelStyle,
  chartValueStyle,
  tooltipContainerStyle,
  tooltipMetaStyle,
  tooltipRowStyle,
  tooltipTitleStyle,
} from "./chartStyles";
import { asArray, setIntersects } from "./chartUtils";

export type IcicleColorRamp = (level: number, maxLevel: number, dark: boolean) => string;

export interface IcicleMosaicClientProps {
  coordinator: Coordinator;
  table: string;
  idCol: string;
  levelCol: string;
  categoryCol: string;
  selection?: VgSelection | null;
  maxLevels?: number;
  /** Step values to exclude from the tree (e.g. ["task","thought","observation"]). */
  filterStepNames?: string[];
  /** Optional WHERE-body (without WHERE) applied alongside the upstream
   * selection's predicate. Used by the wrapper to push the user's UI
   * filters (search / outcome chip) into the query. */
  whereExpr?: string | null;
  /** Cap on children per tree level. Excess collapsed into "other (N)". */
  maxNodesPerLevel?: number;
  /** Minimum row height in CSS pixels. The container scrolls vertically if
   * `levels * minRowHeight` exceeds available height, so deep trajectories
   * stay readable. */
  minRowHeight?: number;
  colorRamp?: IcicleColorRamp;
  labelFor?: (category: string) => string;
  dark?: boolean;
  highlightedTrajIds?: Set<string> | null;
  onCellClick?: (level: number, category: string, trajIds: Set<string>) => void;
  /** Increment to clear the icicle's local node selection and write a null
   * clause to the bound crossfilter. Used by an external "Clear all" button. */
  resetSignal?: number;
  /** Reports whether the icicle currently has a node-path selection. The
   * topbar uses this to keep its "Clear filters" button visible. */
  onSelectionStateChange?: (active: boolean) => void;
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
  isOther?: boolean;
  otherCount?: number;
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
  filterStepNames,
  whereExpr,
  maxNodesPerLevel,
  minRowHeight = 0,
  colorRamp = DEFAULT_RAMP,
  labelFor = (s) => s,
  dark = false,
  highlightedTrajIds,
  onCellClick,
  resetSignal,
  onSelectionStateChange,
}: IcicleMosaicClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [rows, setRows] = useState<PathRow[]>([]);
  const [hover, setHover] = useState<LayoutRect | null>(null);
  // Selection is path-based: we remember the unique path of the clicked node.
  const [localSelection, setLocalSelection] = useState<string | null>(null);
  const clientRef = useRef<MosaicClient | null>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Build the path-tree query. We layer two CTEs:
  //   filtered  — drops blacklisted step names and re-indexes step_idx via
  //               ROW_NUMBER so each visible step is contiguous.
  //   ranked    — adds the running STRING_AGG path per trajectory.
  //
  // The outer SELECT groups by (step_idx, category, path) to produce one row
  // per icicle node and writes the matching trajectory ids back so a click
  // can write a `traj_id IN (...)` clause to the upstream selection.
  const buildQuery = useMemo(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function (predicate: any) {
        const id = column(idCol);
        const lvl = column(levelCol);
        const cat = column(categoryCol);

        // Keep the id column under its original name (`id`) through the CTE
        // chain — cross-filter clauses written by the icicle/sankey reference
        // `id`, so renaming it here would break the upstream `id IN (...)`
        // predicate the coordinator tacks on.
        const filtered = Query.from(table).select({
          id,
          step_idx: sql`ROW_NUMBER() OVER (PARTITION BY ${id} ORDER BY ${lvl}) - 1`,
          category: cat,
        });
        if (filterStepNames && filterStepNames.length) {
          const list = filterStepNames
            .map((n) => `'${n.replace(/'/g, "''")}'`)
            .join(",");
          filtered.where(sql`${cat} NOT IN (${verbatim(list)})`);
        }
        if (whereExpr) {
          filtered.where(sql`${verbatim(`(${whereExpr})`)}`);
        }

        const ranked = Query.with({ filtered }).from("filtered").select({
          id: column("id"),
          step_idx: column("step_idx"),
          category: column("category"),
          path: sql`STRING_AGG(category, '>') OVER (PARTITION BY id ORDER BY step_idx ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`,
        });

        if (typeof maxLevels === "number") {
          ranked.where(sql`step_idx < ${maxLevels}`);
        }
        if (predicate) ranked.where(predicate);

        return Query.with({ ranked }).from("ranked").select({
          step_idx: column("step_idx"),
          category: column("category"),
          path: column("path"),
          n: sql`COUNT(DISTINCT id)`,
          traj_ids: sql`ARRAY_AGG(DISTINCT id)`,
        }).groupby("step_idx", "category", "path")
          .orderby(column("step_idx"), sql`COUNT(DISTINCT id) DESC`);
      },
    [table, idCol, levelCol, categoryCol, maxLevels, filterStepNames, whereExpr],
  );

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

  // External "Clear all" — flush local selection and the matching clause on
  // the crossfilter so the icicle no longer narrows the other charts.
  useEffect(() => {
    if (resetSignal === undefined) return;
    setLocalSelection(null);
    onSelectionStateChange?.(false);
    if (selection && clientRef.current) {
      const client = clientRef.current;
      selection.update(
        clausePoints([idCol], undefined, { source: client, clients: new Set([client]) }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const { rects, totalN, maxLevelInData, svgHeight } = useMemo(() => {
    const tree = buildTree(rows);
    const totalN = tree.children.reduce((a, c) => a + c.n, 0) || 1;
    // Prune nodes representing less than 0.1% of trajectories. With deep
    // trajectories (e.g. DeepSWE at 80+ steps) the tail produces tens of
    // thousands of sub-pixel rects that lock up the browser.
    pruneByShare(tree, totalN, 0.001);
    if (maxNodesPerLevel && maxNodesPerLevel > 1) {
      collapseTail(tree, maxNodesPerLevel);
    }
    const maxLevelInData = rows.reduce((m, r) => Math.max(m, r.level), -1) + 1;
    const levels = maxLevels ?? Math.max(1, maxLevelInData);
    const containerH = size.h || 1;
    const naturalRowH = containerH / Math.max(1, levels);
    const rowH = Math.max(naturalRowH, minRowHeight);
    const svgH = Math.max(containerH, rowH * levels);
    return {
      rects: layoutTree(tree, size.w || 1, svgH, levels),
      totalN,
      maxLevelInData: levels,
      svgHeight: svgH,
    };
  }, [rows, size.w, size.h, maxLevels, maxNodesPerLevel, minRowHeight]);

  function isSelected(rect: LayoutRect): boolean {
    return localSelection !== null && rect.node.path === localSelection;
  }

  function pathRelatedToSelection(rect: LayoutRect): boolean {
    if (localSelection === null) return true;
    const a = rect.node.path;
    const b = localSelection;
    if (!a || !b) return false;
    if (a === b) return true;
    // Prefix match means rect is an ancestor (b is longer) or descendant (a is longer).
    if (a.length < b.length) return b.startsWith(a + ">");
    return a.startsWith(b + ">");
  }

  function handleClick(rect: LayoutRect) {
    const next = isSelected(rect) ? null : rect.node.path;
    setLocalSelection(next);
    onSelectionStateChange?.(next !== null);

    if (selection && clientRef.current) {
      const client = clientRef.current;
      if (next === null) {
        // undefined value yields a null predicate → Mosaic clears this source's clause.
        selection.update(
          clausePoints([idCol], undefined, { source: client, clients: new Set([client]) }),
        );
      } else {
        const ids = Array.from(rect.node.trajIds).map((id) => [id]);
        selection.update(
          clausePoints([idCol], ids, { source: client, clients: new Set([client]) }),
        );
      }
    }

    onCellClick?.(rect.node.level, rect.node.category, rect.node.trajIds);
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <svg width={size.w} height={svgHeight} style={{ display: "block" }}>
        <Group>
          {rects.map((r, i) => {
            const sel = isSelected(r);
            const hi = highlightedTrajIds && setIntersects(r.node.trajIds, highlightedTrajIds);
            // Dim a rect when:
            //   - the user clicked another node and this rect isn't on its path, OR
            //   - a row is highlighted and this rect's trajectories don't include it.
            const dimmed =
              (localSelection !== null && !pathRelatedToSelection(r)) ||
              (highlightedTrajIds != null && !hi);
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
                  strokeWidth={sel ? 2 : hi ? 2 : 1}
                  opacity={dimmed ? 0.2 : 1}
                  rx={2}
                  style={{ cursor: "pointer", transition: "opacity .2s" }}
                  onClick={() => handleClick(r)}
                  onMouseEnter={() => setHover(r)}
                  onMouseLeave={() => setHover(null)}
                />
                {r.w > 50 && r.h > 16 && (
                  <text
                    x={r.x + 8}
                    y={r.y + r.h / 2 + 4}
                    fill={
                      r.node.level > maxLevelInData * 0.55
                        ? chartFgInverse(dark)
                        : chartFg(dark)
                    }
                    pointerEvents="none"
                    opacity={dimmed ? 0.4 : 0.95}
                    style={chartLabelStyle}
                  >
                    {r.node.isOther
                      ? `other (${r.node.otherCount})`
                      : labelFor(r.node.category)}
                    {r.w > 120 && !r.node.isOther ? (
                      <tspan dx="8" style={chartValueStyle}>
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
          style={{
            ...tooltipContainerStyle(dark, 260),
            left: Math.min(hover.x + 8, Math.max(0, size.w - 280)),
            top: Math.max(0, hover.y - 6),
          }}
        >
          <div style={tooltipTitleStyle}>
            Step {hover.node.level + 1} ·{" "}
            {hover.node.isOther
              ? `other (${hover.node.otherCount})`
              : labelFor(hover.node.category)}
          </div>
          <div style={tooltipRowStyle(dark)}>
            <span>trajectories</span>
            <b style={{ color: "inherit", fontWeight: 500 }}>
              {hover.node.n.toLocaleString()}
            </b>
          </div>
          <div style={tooltipRowStyle(dark)}>
            <span>share of total</span>
            <b style={{ color: "inherit", fontWeight: 500 }}>
              {((hover.node.n / totalN) * 100).toFixed(1)}%
            </b>
          </div>
          {!hover.node.isOther && hover.node.path && (
            <div style={tooltipMetaStyle(dark)}>{hover.node.path}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ----- helpers --------------------------------------------------------------

function buildTree(rows: PathRow[]): TreeNode {
  const root: TreeNode = {
    level: -1,
    category: "_root",
    path: "",
    n: 0,
    trajIds: new Set(),
    children: [],
  };
  const byPath = new Map<string, TreeNode>();
  byPath.set("", root);

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

/**
 * Cap each tree level at `maxNodesPerLevel` children. The (K-1) heaviest are
 * kept; the rest collapse into a synthetic `other (M)` node that takes their
 * combined `n` and `trajIds`. Recursion is pruned at the synthetic node.
 */
/**
 * Drop subtrees whose share of the global total falls below `threshold`.
 * Important for deep trajectories where the tail produces thousands of
 * sub-pixel rects that lock up the browser. Pruned trees still report their
 * remaining children's counts truthfully — we just stop rendering the noise.
 */
function pruneByShare(node: TreeNode, total: number, threshold: number) {
  const minN = total * threshold;
  function recur(n: TreeNode) {
    if (!n.children.length) return;
    n.children = n.children.filter((c) => c.n >= minN);
    n.children.forEach(recur);
  }
  recur(node);
}

function collapseTail(node: TreeNode, k: number) {
  if (!node.children.length) return;
  if (node.children.length > k) {
    const keep = node.children.slice(0, k - 1);
    const tail = node.children.slice(k - 1);
    const tailN = tail.reduce((a, c) => a + c.n, 0);
    const tailIds = new Set<string>();
    for (const t of tail) t.trajIds.forEach((id) => tailIds.add(id));
    const otherNode: TreeNode = {
      level: tail[0].level,
      category: "_other",
      path: `${node.path ? node.path + ">" : ""}_other`,
      n: tailN,
      trajIds: tailIds,
      children: [],
      isOther: true,
      otherCount: tail.length,
    };
    node.children = [...keep, otherNode];
  }
  for (const c of node.children) {
    if (!c.isOther) collapseTail(c, k);
  }
}

function layoutTree(root: TreeNode, width: number, height: number, levels: number): LayoutRect[] {
  const rects: LayoutRect[] = [];
  const levelHeight = height / Math.max(1, levels);
  const total = root.children.reduce((a, c) => a + c.n, 0) || 1;

  function recurse(node: TreeNode, x: number, w: number, parentTotal: number) {
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
      if (child.level < levels - 1 && !child.isOther) {
        recurse(child, cursorX, childW, child.n);
      }
      cursorX += childW;
    }
  }
  recurse(root, 0, width, total);
  return rects;
}

