// store/authStore.ts - First draft structure
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: string;
  email: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;

  // Actions
  setTokens: (accessToken: string, refreshToken: string, user: User) => void;
  clearAuth: () => void;
  isTokenExpired: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      setTokens: (accessToken, refreshToken, user) =>
        set({ accessToken, refreshToken, user }),

      clearAuth: () =>
        set({ accessToken: null, refreshToken: null, user: null }),

      isTokenExpired: () => {
        const token = get().accessToken;
        if (!token) return true;

        try {
          const payload = JSON.parse(atob(token.split(".")[1]));
          // Add 60 second buffer before actual expiry
          return payload.exp * 1000 < Date.now() + 60000;
        } catch {
          return true;
        }
      },
    }),
    {
      name: "auth-storage",
    }
  )
);
