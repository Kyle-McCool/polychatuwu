import { Terminal } from "./Terminal";
import { Overlay } from "./components/Overlay";
import { Viewer } from "./components/Viewer";

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "/overlay") return <Overlay />; // OBS browser source
  if (path === "/watch") return <Viewer />; // read-only viewer page
  // default ("/") and "/app" both open the streamer dashboard
  return <Terminal />;
}
