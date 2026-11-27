import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Sonido first, so the theme bridge in index.css can retarget its tokens.
import "@juninmd/sonido/styles.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
