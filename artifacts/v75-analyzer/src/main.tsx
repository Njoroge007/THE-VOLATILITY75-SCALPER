import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

console.log("[BOOT] FULL URL ON LOAD:", window.location.href);
console.log("[BOOT] pathname:", window.location.pathname);
console.log("[BOOT] search:", window.location.search);
console.log("[BOOT] hash:", window.location.hash);

createRoot(document.getElementById("root")!).render(<App />);
