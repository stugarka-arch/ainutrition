import { useErrorStore } from '../store/useErrorStore';
import { AxiosError } from "axios";
import { toast } from "react-toastify";

export function handleError(err: unknown, customMessage?: string) {
    const { setError } = useErrorStore.getState();

    let message = customMessage || "Невідома помилка";

    if (err instanceof AxiosError && err.response) {
        const contentType = err.response.headers["content-type"];

        if (contentType?.includes("application/json")) {
            const data = err.response.data;

            if (data?.email) {
                message = data.email[0];
            } else if (typeof data?.message === "string") {
                message = data.message;
            } else if (Array.isArray(data?.message)) {
                message = data.message.join(", ");
            } else if (data?.detail) {
                message = data.detail;
            } else {
                message = customMessage || "Помилка з сервера";
            }
        } else {
            const status = err.response.status;
            const statusText = err.response.statusText || "Помилка сервера";
            message =
                customMessage ||
                `Сервер повернув помилку ${status}: ${statusText}`;
        }
    } else if (err instanceof Error) {
        message = customMessage || err.message;
    }

    setError(message);
    toast.error(message);
}