
import axios, {
    type AxiosInstance,
    type InternalAxiosRequestConfig,
} from "axios";

const baseURL = import.meta.env.VITE_API_BASE || 'http://localhost:3001';


const apiService: AxiosInstance = axios.create({
    baseURL,
    withCredentials: true,
});

/* ---------- REQUEST ---------- */

apiService.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        if (!(config.data instanceof FormData)) {
            config.headers["Content-Type"] = "application/json";
        }

        config.headers["Accept-Language"] =
            navigator.language.split("-")[0] || "uk";

        return config;
    },
);

/* ---------- RESPONSE ---------- */

apiService.interceptors.response.use(
    (response) => response,
    (error) => Promise.reject(error),
);

export { apiService, baseURL };

