import { Routes, Route } from "react-router-dom";
import { useAuthStore } from "./store/useAuthStore";
import "./App.css";
import { ToastContainer } from "react-toastify";

import { useEffect } from "react";
import ClientLayout from "./layouts/ClientLayout";
import RoleGuard from "./guards/RoleGuard";
import PublicLayout from "./layouts/PublicLayout";
import {
  publicRoutes,
  clientRoutes,
  adminRoutes,
  notFoundRoute,
} from "./routes/routes";import { Role } from "./interfaces/user/Role";
import AdminLayout from "./layouts/AdminLayout";
;

export default function App() {
  const {  user, me } = useAuthStore();
  const savedTheme = localStorage.getItem("theme") || "dark";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, [savedTheme]);

  useEffect(() => {
    me();
  }, [me]);

  // ← Ось тут
  if (!user) {
    return <div>Loading...</div>; // або свій спінер
  }

  return (
    <div className="flex-center">
      <ToastContainer
        theme={savedTheme}
        position="top-right"
        autoClose={3000}
      />

      <Routes>
        {/* PUBLIC */}
        <Route element={<PublicLayout />}>
          {publicRoutes.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
        </Route>

        {/* CLIENT */}
        <Route
          element={
            <RoleGuard
              userRole={user?.role || null}
              allowedRoles={[Role.USER]}
            />
          }
        >
          <Route element={<ClientLayout />}>
            {clientRoutes.map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
          </Route>
        </Route>

        {/* ADMIN */}
        <Route
          element={
            <RoleGuard
              userRole={user?.role || null}
              allowedRoles={[Role.ADMIN]}
            />
          }
        >
          <Route element={<AdminLayout />}>
            {adminRoutes.map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
          </Route>
        </Route>

        {/* 404 */}
        <Route path={notFoundRoute.path} element={notFoundRoute.element} />
      </Routes>
    </div>
  );
}
