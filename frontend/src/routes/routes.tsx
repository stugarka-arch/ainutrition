// src/routes/routes.tsx

import AdminPage from "../pages/AdminPage ";
import AuthPage from "../pages/AuthPage";
import ClientPage from "../pages/ClientPage";
import HomePage from "../pages/HomePage";
import NotFoundPage from "../pages/NotFoundPage";



// Публічні маршрути
export const publicRoutes = [
    { path: "/", element: <HomePage /> },
    { path: "/auth", element: <AuthPage /> },
];

// Клієнтські маршрути
export const clientRoutes = [
    { path: "/dashboard-client", element: <ClientPage /> },
];



// Адмін
export const adminRoutes = [
    { path: "/admin", element: <AdminPage /> },
];

// 404
export const notFoundRoute = { path: "*", element: <NotFoundPage /> };