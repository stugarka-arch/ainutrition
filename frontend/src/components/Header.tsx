import { NavLink, useNavigate } from "react-router-dom";

import { adminRoutes, clientRoutes, publicRoutes } from "../routes/routes";
import { useAuthStore } from "../store/useAuthStore";


import "./Header.scss";
import { useEffect, useState } from "react";

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
    const [routes, setRoutes] = useState<any>([]);

    useEffect(() => {
        if (user?.role === "ADMIN") {
            setRoutes([...publicRoutes, ...adminRoutes, ...clientRoutes]);
        } else if (user?.role === "USER") {
            setRoutes([...publicRoutes, ...clientRoutes]);
        } else {
            setRoutes(publicRoutes);
        }
    }, [user])

    return (
        <header className="header">
            <NavLink className="header__logo" to="/" aria-label="AI Nutrition — головна">
                AI Nutrition
            </NavLink>

            <nav className="header__navigation" aria-label="Основна навігація">
                {routes.filter(
                    (route: any) =>
                        !(
                            route.label.includes("Авторизація") ||
                            route.label.includes("Головна")
                        )
                ).map(({ path, label }) => (
                    <NavLink
                        key={path}
                        className={({ isActive }) =>
                            `header__navigation-link${isActive ? " header__navigation-link--active" : ""}`
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
                {isLoading ? "Завантаження..." : isAuth ? "Вийти" : "Увійти"}
            </button>
        </header>
    );
};

export default Header;
