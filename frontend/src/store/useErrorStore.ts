import { create } from "zustand";

interface IErrorState {
    loading: boolean;
    error: string | null;
    success: string | null;
    setLoading: (value: boolean) => void;
    setError: (value: string | null) => void;
    setSuccess: (value: string | null) => void;
    reset: () => void;
}

export const useErrorStore = create<IErrorState>((set) => ({
    loading: false,
    error: null,
    success: null,
    setLoading: (value) => set({ loading: value }),
    setError: (value) => set({ error: value }),
    setSuccess: (value) => set({ success: value }),
    reset: () => set({ loading: false, error: null, success: null }),
}));