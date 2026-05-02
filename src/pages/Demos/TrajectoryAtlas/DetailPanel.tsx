// Trajectory Atlas — DetailPanel: slide-in inspector for a single trajectory.

import { LuX, LuTriangleAlert } from "react-icons/lu";
import { CATEGORY_LABELS, CAT_COLOR } from "./taxonomy";
import type { Category, Trajectory } from "./types";

export function DetailPanel({ traj, onClose }: { traj: Trajectory; onClose: () => void }) {
  return (
    <div className="ta-detail" role="dialog" aria-label="Trajectory details">
      <div className="ta-detail-head">
        <div style={{ minWidth: 0 }}>
          <div className="ta-detail-id">{traj.id}</div>
          <div className="ta-detail-task">{traj.task}</div>
        </div>
        <button className="ta-icon-btn" onClick={onClose} aria-label="Close">
          <LuX size={13} />
        </button>
      </div>
      <div className="ta-detail-meta">
        <div>
          <span className="ta-meta-k">model</span>
          <span style={{ fontFamily: "var(--font-mono, ui-monospace)" }}>{traj.model}</span>
        </div>
        <div>
          <span className="ta-meta-k">dataset</span>
          <span>{traj.dataset}</span>
        </div>
        <div>
          <span className="ta-meta-k">outcome</span>
          <span className={`ta-outcome-badge ta-outcome-${traj.outcome}`}>{traj.outcome}</span>
        </div>
        <div>
          <span className="ta-meta-k">steps</span>
          <span style={{ fontFamily: "var(--font-mono, ui-monospace)" }}>{traj.step_count}</span>
        </div>
        <div>
          <span className="ta-meta-k">tokens</span>
          <span style={{ fontFamily: "var(--font-mono, ui-monospace)" }}>
            {traj.tokens.toLocaleString()}
          </span>
        </div>
        <div>
          <span className="ta-meta-k">duration (est.)</span>
          <span style={{ fontFamily: "var(--font-mono, ui-monospace)" }}>
            {(traj.duration / 1000).toFixed(2)}s
          </span>
        </div>
        <div>
          <span className="ta-meta-k">reward</span>
          <span style={{ fontFamily: "var(--font-mono, ui-monospace)" }}>
            {traj.reward.toFixed(2)}
          </span>
        </div>
        <div>
          <span className="ta-meta-k">cost</span>
          <span style={{ fontFamily: "var(--font-mono, ui-monospace)" }}>
            {traj.cost ? `$${traj.cost.toExponential(2)}` : "—"}
          </span>
        </div>
      </div>
      <div className="ta-detail-steps-title">Trajectory steps</div>
      <div className="ta-detail-steps">
        {traj.steps.map((s, i) => (
          <div key={i} className={`ta-step-row ${!s.ok ? "is-err" : ""}`}>
            <div className="ta-step-idx">{String(i + 1).padStart(2, "0")}</div>
            <div
              className="ta-step-bar"
              style={{ background: CAT_COLOR[s.category as Category] ?? "var(--ta-fg-subtle)" }}
            />
            <div className="ta-step-cat">{CATEGORY_LABELS[s.category as Category] ?? s.category}</div>
            <div className="ta-step-tool">{s.tool}</div>
            <div className="ta-step-meta">
              {s.tokens}t · {s.duration}ms
              {!s.ok && (
                <LuTriangleAlert
                  size={12}
                  style={{ color: "var(--chart-red)", marginLeft: 4, verticalAlign: "middle" }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
