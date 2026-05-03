// Trajectory Atlas — DetailPanel: slide-in inspector. Keeps things simple
// with plain divs. Only the main TrajectoryTable uses AnyTable in this demo.

import { LuTriangleAlert, LuX } from "react-icons/lu";
import { CAT_COLOR } from "./taxonomy";
import type { Category, Trajectory } from "./types";

export function DetailPanel({ traj, onClose }: { traj: Trajectory; onClose: () => void }) {
  return (
    <div className="ta-detail" role="dialog" aria-label="Trajectory details">
      <div className="ta-detail-head">
        <div className="ta-detail-head-text">
          <div className="ta-detail-id">{traj.id}</div>
          <div className="ta-detail-task">{traj.task}</div>
        </div>
        <button className="ta-detail-close" onClick={onClose} aria-label="Close">
          <LuX size={14} />
        </button>
      </div>

      <div className="ta-detail-meta">
        <Meta label="model" value={traj.model} mono />
        <Meta label="dataset" value={traj.dataset} />
        <Meta
          label="outcome"
          value={
            <span className={`ta-outcome-badge ta-outcome-${traj.outcome}`}>{traj.outcome}</span>
          }
        />
        <Meta label="steps" value={traj.step_count} mono />
        <Meta label="tokens" value={traj.tokens.toLocaleString()} mono />
        <Meta label="reward" value={traj.reward.toFixed(2)} mono />
      </div>

      <div className="ta-detail-section-title">Trajectory steps</div>
      <div className="ta-detail-steps">
        {traj.steps.map((s, i) => (
          <div key={i} className={`ta-step-row ${!s.ok ? "is-err" : ""}`}>
            <div className="ta-step-num">{String(i + 1).padStart(2, "0")}</div>
            <div
              className="ta-step-bar"
              style={{ background: CAT_COLOR[s.category as Category] ?? "#9498A0" }}
            />
            <div className="ta-step-name">{s.name || s.tool}</div>
            <div className="ta-step-role">{s.role}</div>
            <div className="ta-step-meta">
              {s.tokens}t
              {!s.ok && (
                <LuTriangleAlert size={11} color="var(--chart-red, #FF725C)" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="ta-meta-row">
      <span className="ta-meta-label">{label}</span>
      <span className={`ta-meta-value ${mono ? "is-mono" : ""}`}>{value}</span>
    </div>
  );
}
