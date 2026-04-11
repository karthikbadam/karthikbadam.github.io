import { Page } from "../../../components/Page";
import { LatentInsightsProvider } from "../../../contexts/LatentInsightsContext";
import { Dashboard } from "./components/Dashboard";

export function LatentInsights() {
  return (
    <Page>
      <LatentInsightsProvider>
        <Dashboard />
      </LatentInsightsProvider>
    </Page>
  );
}
