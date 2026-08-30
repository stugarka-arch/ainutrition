import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthStore } from "../store/useAuthStore";

export default function AuthPage() {
    const navigate = useNavigate();

    const {
        login,
        register,
        isLoading,
        isAuth,
    } = useAuthStore();

    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (
        event: React.FormEvent<HTMLFormElement>,
    ) => {
        event.preventDefault();
        setError("");

        try {
            if (isLogin) {
                await login({
                    email,
                    password,
                });
            } else {
                await register({
                    email,
                    password,
                });
            }

            navigate("/");
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Щось пішло не так",
            );
        }
    };

    const toggleMode = () => {
        setIsLogin((value) => !value);
        setError("");
        setEmail("");
        setPassword("");
    };

    if (isAuth) {
        navigate("/");
        return null;
    }

    return (
        <main>
            <h1>
                {isLogin ? "Вхід" : "Реєстрація"}
            </h1>

            <form onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="email">
                        Email
                    </label>

                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(event) =>
                            setEmail(event.target.value)
                        }
                        autoComplete="email"
                        required
                    />
                </div>

                <div>
                    <label htmlFor="password">
                        Пароль
                    </label>

                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(event) =>
                            setPassword(event.target.value)
                        }
                        autoComplete={
                            isLogin
                                ? "current-password"
                                : "new-password"
                        }
                        minLength={8}
                        required
                    />
                </div>

                {error && (
                    <p role="alert">
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={isLoading}
                >
                    {isLoading
                        ? "Завантаження..."
                        : isLogin
                            ? "Увійти"
                            : "Зареєструватися"}
                </button>
            </form>

            <button
                type="button"
                onClick={toggleMode}
                disabled={isLoading}
            >
                {isLogin
                    ? "Створити акаунт"
                    : "Уже є акаунт? Увійти"}
            </button>
        </main>
    );
}