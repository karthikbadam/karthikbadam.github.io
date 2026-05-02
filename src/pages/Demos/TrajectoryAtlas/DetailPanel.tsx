// Trajectory Atlas — DetailPanel (populated in commit 8).
import type { Trajectory } from "./types";

export function DetailPanel({ traj, onClose }: { traj: Trajectory; onClose: () => void }) {
  return (
    <div className="ta-detail">
      <div className="ta-detail-head">
        <div>
          <div className="ta-detail-id">{traj.id}</div>
          <div className="ta-detail-task">{traj.task}</div>
        </div>
        <button className="ta-icon-btn" onClick={onClose}>
          ×
        </button>
      </div>
    </div>
  );
}
