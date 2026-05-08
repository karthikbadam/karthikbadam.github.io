import { useEffect } from "react";
import { Provider, useSetAtom } from "jotai";
import { Page } from "../../../components/Page";
import { Dashboard } from "./components/Dashboard";
import { cleanupSSEAtom } from "./atoms";

/** Closes the SSE EventSource when the Provider unmounts (route change). */
function SSECleanup() {
  const cleanup = useSetAtom(cleanupSSEAtom);
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);
  return null;
}

export function LatentInsights() {
  return (
    <Page>
      <Provider>
        <SSECleanup />
        <Dashboard />
      </Provider>
    </Page>
  );
}
