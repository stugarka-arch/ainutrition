import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import { adminRoutes, clientRoutes, publicRoutes } from "../routes/routes";

import "./Header.scss";

const Header = () => {
    const navigate = useNavigate();
    const { isAuth, isLoading, logout, user } = useAuthStore();

    const handleAuthAction = async () => {
        if (!isAuth) {
            navigate("/auth");
            return;
        }

        await logout();
        navigate("/");
    };

    const routes =
        user?.role === "ADMIN"
            ? [...publicRoutes, ...adminRoutes, ...clientRoutes]
            : user?.role === "USER"
                ? [...publicRoutes, ...clientRoutes]
                : publicRoutes;

    const navigationRoutes = routes.filter(
        ({ label }) =>
            !label.includes("Авторизація") &&
            !label.includes("Головна")
    );

    return (
        <header className="header">
            <NavLink
                className="header__logo"
                to="/"
                aria-label="AI Nutrition — головна"
            >
                AI Nutrition
            </NavLink>

            <nav
                className="header__navigation"
                aria-label="Основна навігація"
            >
                {navigationRoutes.map(({ path, label }) => (
                    <NavLink
                        key={path}
                        className={({ isActive }) =>
                            `header__navigation-link${isActive
                                ? " header__navigation-link--active"
                                : ""
                            }`
                        }
                        to={path}
                    >
                        {label}
                    </NavLink>
                ))}
            </nav>

            <button
                className="header__auth-button"
                type="button"
                onClick={handleAuthAction}
                disabled={isLoading}
            >
                {isLoading
                    ? "Завантаження..."
                    : isAuth
                        ? "Вийти"
                        : "Увійти"}
            </button>
        </header>
    );
};

export default Header;
