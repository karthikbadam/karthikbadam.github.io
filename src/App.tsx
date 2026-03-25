import { useEffect } from "react";
import { HashRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { BlogPost } from "./pages/BlogPost";
import { Provider } from "./components/ui/provider";
import { Home } from "./pages/Home";
import { About } from "./pages/About";
import { Posts } from "./pages/Posts";
import { Publications } from "./pages/Publications";
import { PackedRadialTreeDemo } from "./pages/Demos/PRT";
import { SWEBenchDashboard } from "./pages/Demos/SWEBenchDashboard";
import { GravitationalLensingDashboard } from "./pages/Demos/GravitationalLensing";
import { StarCatalogExplorer } from "./pages/Demos/StarCatalog";
import { TransformerViz } from "./pages/Demos/TransformerViz";
import { LatentInsights } from "./pages/Demos/LatentInsights";

function RouteTracker() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', {
        page_path: location.pathname + location.search,
        page_location: window.location.href,
      });
    }
  }, [location]);

  return null;
}

function App() {
  return (
    <Provider>
      <Router>
        <RouteTracker />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/publications" element={<Publications />} />
          <Route path="/posts" element={<Posts />} />
          <Route path="/about" element={<About />} />
          <Route path="/packed-radial-tree" element={<PackedRadialTreeDemo />} />
          <Route path="/swe-bench" element={<SWEBenchDashboard />} />
          <Route path="/gravitational-lensing" element={<GravitationalLensingDashboard />} />
          <Route path="/star-catalog" element={<StarCatalogExplorer />} />
          <Route path="/transformer" element={<TransformerViz />} />
          <Route path="/latent-insights" element={<LatentInsights />} />
          <Route path="/latent-insights/:sessionId" element={<LatentInsights />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
        </Routes>
      </Router>
    </Provider>
  );
}

export default App;
