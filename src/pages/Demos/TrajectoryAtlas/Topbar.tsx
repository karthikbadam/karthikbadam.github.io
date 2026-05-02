// Trajectory Atlas — Topbar with brand row, search, dataset pill, outcome
// chips, and KPI strip. The site's global navbar already exposes a theme
// toggle, so this component intentionally omits one.

import { LuSearch, LuX, LuDatabase, LuExternalLink } from "react-icons/lu";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import type { Outcome, SourceKey } from "./types";

const OUTCOMES: Array<Outcome | "all"> = ["all", "success", "partial", "fail"];
const OUTCOME_LABEL: Record<Outcome | "all", string> = {
  all: "All",
  success: "pass",
  partial: "partial",
  fail: "fail",
};

export function Topbar() {
  const {
    sources,
    source,
    setSource,
    search,
    setSearch,
    outcomeFilter,
    setOutcomeFilter,
    stats,
  } = useTrajectoryAtlas();

  const dsLabel = sources[source].label;
  const hfUrl = sources[source].hfUrl;

  return (
    <div className="ta-topbar">
      <div className="ta-brand">
        <span className="ta-brand-mark">kb</span>
        <span className="ta-brand-name">Trajectory Atlas</span>
        <span className="ta-brand-divider" />
        <span className="ta-brand-route">datasets / explore</span>
      </div>

      <div className="ta-topbar-tools">
        <div className="ta-search">
          <LuSearch size={14} style={{ color: "var(--ta-fg-subtle)", flexShrink: 0 }} />
          <input
            placeholder="Search id, task, model…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--ta-fg-subtle)",
                cursor: "pointer",
                padding: 2,
                display: "grid",
                placeItems: "center",
              }}
              aria-label="Clear search"
            >
              <LuX size={12} />
            </button>
          )}
        </div>

        <div className="ta-pill">
          <LuDatabase size={13} style={{ color: "var(--ta-accent)" }} />
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as SourceKey)}
            style={{
              border: "none",
              outline: "none",
              background: "transparent",
              font: "inherit",
              fontSize: 12,
              color: "var(--ta-fg)",
              cursor: "pointer",
            }}
            aria-label="Trajectory source"
          >
            {Object.values(sources).map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          {hfUrl && (
            <a
              href={hfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ta-pill-link"
              style={{ display: "grid", placeItems: "center" }}
              aria-label="Open source on Hugging Face"
            >
              <LuExternalLink size={12} />
            </a>
          )}
        </div>

        <div className="ta-chips" role="tablist" aria-label="Outcome filter">
          {OUTCOMES.map((o) => (
            <button
              key={o}
              role="tab"
              aria-selected={outcomeFilter === o}
              className={`ta-chip ta-chip-${o} ${outcomeFilter === o ? "is-active" : ""}`}
              onClick={() => setOutcomeFilter(o)}
            >
              {OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>
      </div>

      <div className="ta-stats">
        <Stat label="trajectories" value={stats.n.toLocaleString()} />
        <Stat
          label="pass rate"
          value={stats.n ? `${((stats.pass / stats.n) * 100).toFixed(1)}%` : "—"}
          accent
        />
        <Stat label="avg steps" value={stats.avgSteps ? stats.avgSteps.toFixed(1) : "—"} />
        <Stat label={`avg cost (${dsLabel.split(" ")[0]})`} value={formatCost(stats.avgCost)} />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="ta-stat">
      <div className={`ta-stat-value ${accent ? "is-accent" : ""}`}>{value}</div>
      <div className="ta-stat-label">{label}</div>
    </div>
  );
}

function formatCost(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(3)}`;
  if (v >= 0.0001) return `$${v.toFixed(4)}`;
  return `$${v.toExponential(2)}`;
}
