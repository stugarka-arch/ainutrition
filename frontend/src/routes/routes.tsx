// src/routes/routes.tsx

import AdminPage from "../pages/AdminPage ";
import AuthPage from "../pages/AuthPage";
import ClientPage from "../pages/ClientPage";
import FoodAnalysisPage from "../pages/FoodAnalysisPage";
import HomePage from "../pages/HomePage";
import NotFoundPage from "../pages/NotFoundPage";
import NutritionSummary from "../components/NutritionSummary";



// Публічні маршрути
export const publicRoutes = [
    { path: "/", label: "Головна", element: <HomePage /> },
    { path: "/auth", label: "Авторизація", element: <AuthPage /> },
    { path: "/food-analysis", label: "Аналіз їжі", element: <FoodAnalysisPage /> },

];

// Клієнтські маршрути
export const clientRoutes = [
    { path: "/dashboard-client", label: "Кабінет", element: <ClientPage /> },
    { path: "/nutrition-summary", label: "Підсумок харчування", element: <NutritionSummary /> },
];



// Адмін
export const adminRoutes = [
    { path: "/admin", label: "Адмінпанель", element: <AdminPage /> },
];

// 404
export const notFoundRoute = { path: "*", element: <NotFoundPage /> };
