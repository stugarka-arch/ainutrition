import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import './styles/themes.scss'
import App from "./App.tsx";
import { BrowserRouter } from "react-router-dom";

const savedTheme = localStorage.getItem("theme");

document.documentElement.setAttribute(
  "data-theme",
  savedTheme || "light",
);


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/">
      <App />
    </BrowserRouter>
  </StrictMode>,
);
