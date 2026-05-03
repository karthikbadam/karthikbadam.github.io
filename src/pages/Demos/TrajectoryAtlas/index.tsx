import { Page } from "../../../components/Page";
import { TrajectoryAtlasProvider } from "../../../contexts/TrajectoryAtlasContext";
import { Dashboard } from "./Dashboard";

export function TrajectoryAtlas() {
  return (
    <Page>
      <TrajectoryAtlasProvider>
        <Dashboard />
      </TrajectoryAtlasProvider>
    </Page>
  );
}
