import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { authService } from "../services/AuthService";
import { useAuthStore } from "../store/useAuthStore";

type AuthMode = "login" | "register" | "forgot" | "reset";

export default function AuthPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const resetToken = searchParams.get("resetToken");
    const [mode, setMode] = useState<AuthMode>(resetToken ? "reset" : "login");
    const { login, register, isLoading, isAuth } = useAuthStore();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ✅ ПРАВИЛЬНО: useEffect для навігації
    useEffect(() => {
        if (isAuth) {
            navigate("/", { replace: true });
        }
    }, [isAuth, navigate]);

    const changeMode = (nextMode: AuthMode) => {
        setMode(nextMode);
        setError("");
        setSuccess("");
        setPassword("");
        if (nextMode !== "reset") setSearchParams({});
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        setSuccess("");

        try {
            if (mode === "forgot") {
                setIsSubmitting(true);
                setSuccess(await authService.forgotPassword(email));
                return;
            }

            if (mode === "reset") {
                if (!resetToken) throw new Error("Відсутній токен для відновлення пароля");
                setIsSubmitting(true);
                await authService.resetPassword(resetToken, password);
                setSuccess("Пароль успішно оновлено. Тепер ви можете увійти.");
                setSearchParams({});
                setMode("login");
                return;
            }

            if (mode === "login") await login({ email, password });
            else await register({ email, password });

            // ← Не потрібен navigate("/") тут, useEffect зробить
        } catch (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : "Щось пішло не так");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ✅ Показуємо форму поки юзер не авторизований
    const isPasswordMode = mode === "login" || mode === "register" || mode === "reset";
    const loading = isLoading || isSubmitting;
    const title = mode === "login" ? "Вхід" : mode === "register" ? "Реєстрація" : mode === "forgot" ? "Відновлення пароля" : "Новий пароль";

    return (
        <main>
            <h1>{title}</h1>
            {mode === "forgot" && <p>Вкажіть email — ми надішлемо посилання для відновлення пароля.</p>}

            <form onSubmit={handleSubmit}>
                {mode !== "reset" && (
                    <div>
                        <label htmlFor="email">Email</label>
                        <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
                    </div>
                )}

                {isPasswordMode && (
                    <div>
                        <label htmlFor="password">Пароль</label>
                        <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required />
                    </div>
                )}

                {error && <p role="alert">{error}</p>}
                {success && <p role="status">{success}</p>}

                <button type="submit" disabled={loading}>
                    {loading ? "Завантаження..." : mode === "login" ? "Увійти" : mode === "register" ? "Зареєструватися" : mode === "forgot" ? "Надіслати посилання" : "Зберегти пароль"}
                </button>
            </form>

            {mode === "login" && <>
                <button type="button" onClick={() => changeMode("forgot")} disabled={loading}>Забули пароль?</button>
                <button type="button" onClick={() => changeMode("register")} disabled={loading}>Створити акаунт</button>
            </>}
            {mode === "register" && <button type="button" onClick={() => changeMode("login")} disabled={loading}>Уже є акаунт? Увійти</button>}
            {(mode === "forgot" || mode === "reset") && <button type="button" onClick={() => changeMode("login")} disabled={loading}>Повернутися до входу</button>}
        </main>
    );
}