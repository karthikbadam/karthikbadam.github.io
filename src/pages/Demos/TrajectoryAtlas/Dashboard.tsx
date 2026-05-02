import { Box, Spinner, Text } from "@chakra-ui/react";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { Topbar } from "./Topbar";
import { StepIcicle } from "./StepIcicle";
import { OutcomeSankey } from "./OutcomeSankey";
import { TrajectoryTable } from "./TrajectoryTable";
import { DetailPanel } from "./DetailPanel";
import "./trajectory-atlas.css";

export function Dashboard() {
  const { state, selectedTrajectory, setRowSelection } = useTrajectoryAtlas();

  if (state.status === "error") {
    return (
      <Box p={6} color="red.500">
        <Text>Failed to load trajectories: {state.message}</Text>
      </Box>
    );
  }

  const ready = state.status === "ready";

  return (
    <div className="trajectory-atlas">
      <Topbar />

      <div className="ta-viz-grid">
        <Panel
          title="Step Icicle"
          subtitle="→ Step depth (rows) · width = share of trajectories taking this path"
        >
          {ready ? <StepIcicle /> : <Loading state={state} />}
        </Panel>
        <Panel
          title="Outcome Sankey"
          sub="3 columns · click a ribbon"
          subtitle="→ Entry action → dominant action → outcome"
        >
          {ready ? <OutcomeSankey /> : <Loading state={state} />}
        </Panel>
      </div>

      <div className="ta-table-section">
        <div className="ta-table-section-head">
          <p className="ta-table-section-title">
            Trajectories
            <span className="ta-panel-sub"> • sort any column, click to inspect</span>
          </p>
        </div>
        <div className="ta-table-host">{ready ? <TrajectoryTable /> : <Loading state={state} />}</div>
      </div>

      {selectedTrajectory && (
        <DetailPanel traj={selectedTrajectory} onClose={() => setRowSelection(null)} />
      )}
    </div>
  );
}

function Loading({ state }: { state: ReturnType<typeof useTrajectoryAtlas>["state"] }) {
  return (
    <Box
      position="absolute"
      inset="0"
      display="flex"
      alignItems="center"
      justifyContent="center"
      gap={3}
    >
      <Spinner size="sm" />
      <Text fontSize="xs" color="fg.muted">
        {state.status === "initializing" && "Initializing DuckDB…"}
        {state.status === "loading-parquet" && "Loading trajectories…"}
        {state.status === "creating-tables" && "Building tables…"}
        {state.status === "updating-tables" && "Updating tables…"}
        {state.status === "idle" && "Starting…"}
      </Text>
    </Box>
  );
}

function Panel({
  title,
  sub,
  subtitle,
  children,
}: {
  title: string;
  sub?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ta-panel">
      <div className="ta-panel-head">
        <div>
          <p className="ta-panel-title">
            {title}
            {sub && <span className="ta-panel-sub"> • {sub}</span>}
          </p>
          {subtitle && <p className="ta-panel-subtitle">{subtitle}</p>}
        </div>
      </div>
      <div className="ta-panel-body">{children}</div>
    </div>
  );
}
