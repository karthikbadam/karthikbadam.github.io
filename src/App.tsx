import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { BlogPost } from "./pages/BlogPost";
import { Provider } from "./components/ui/provider";
import { Page } from "./components/Page";
import { Home } from "./pages/Home";
import { About } from "./pages/About";
import { Posts } from "./pages/Posts";
import { Publications } from "./pages/Publications";
import { PackedRadialTreeDemo } from "./pages/Demos/PRT";

function App() {
  return (
    <Provider>
      <Router>
        <Page>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/publications" element={<Publications />} />
            <Route path="/posts" element={<Posts />} />
            <Route path="/about" element={<About />} />
            <Route path="/packed-radial-tree" element={<PackedRadialTreeDemo />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
          </Routes>
        </Page>
      </Router>
    </Provider>
  );
}

export default App;
