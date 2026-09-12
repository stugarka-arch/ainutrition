import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
    const [theme, setTheme] = useState<Theme>(() => {
        return (
            (localStorage.getItem("theme") as Theme) ||
            "light"
        );
    });

    useEffect(() => {
        document.documentElement.setAttribute(
            "data-theme",
            theme,
        );

        localStorage.setItem("theme", theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme((currentTheme) =>
            currentTheme === "light"
                ? "dark"
                : "light",
        );
    };

    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label="Змінити тему"
        >
            {theme === "light" ? "Темна тема" : "Світла тема"}
        </button>
    );
}