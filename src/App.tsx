import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { BlogPost } from "./pages/BlogPost";
import { Provider } from "./components/ui/provider";
import { Home } from "./pages/Home";
import { About } from "./pages/About";
import { Posts } from "./pages/Posts";
import { Publications } from "./pages/Publications";
import { PackedRadialTreeDemo } from "./pages/Demos/PRT";
import { AstroDemo } from "./pages/Demos/AstroRedshift";

function App() {
  return (
    <Provider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/publications" element={<Publications />} />
          <Route path="/posts" element={<Posts />} />
          <Route path="/about" element={<About />} />
          <Route path="/packed-radial-tree" element={<PackedRadialTreeDemo />} />
          <Route path="/astro-redshift" element={<AstroDemo />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
        </Routes>
      </Router>
    </Provider>
  );
}

export default App;
