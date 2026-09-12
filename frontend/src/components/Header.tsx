import { NavLink, useNavigate } from "react-router-dom";

import { adminRoutes, clientRoutes, publicRoutes } from "../routes/routes";
import { useAuthStore } from "../store/useAuthStore";

import "./Header.scss";

const Header = () => {
    const navigate = useNavigate();
    const { isAuth, isLoading, logout } = useAuthStore();

    const handleAuthAction = async () => {
        if (!isAuth) {
            navigate("/auth");
            return;
        }

        await logout();
        navigate("/");
    };

    return (
        <header className="header">
            <NavLink className="header__logo" to="/" aria-label="AI Nutrition — головна">
                AI Nutrition
            </NavLink>

            <nav className="header__navigation" aria-label="Основна навігація">
                {[...publicRoutes, ...clientRoutes, ...adminRoutes].map(({ path, label }) => (
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
