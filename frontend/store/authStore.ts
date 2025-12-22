import { create } from "zustand";
import { apiClient } from "@/lib/api";

interface User {
  id: string;
  email: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  signup: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  setUser: (user: User | null) => void;
  checkAuth: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  signup: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      await apiClient.signup(email, password);

      // Signup with Supabase requires email confirmation
      // Tokens are not returned until user confirms email and logs in
      set({
        isLoading: false,
        error: null,
      });

      // Don't set user/tokens here - they need to confirm email first
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Signup failed",
        isLoading: false,
      });
      throw error;
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.login(email, password);

      // apiClient.login already stores tokens in localStorage
      if (response.user) {
        set({
          user: response.user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        throw new Error("No user data returned from login");
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Login failed",
        isLoading: false,
        isAuthenticated: false,
        user: null,
      });
      throw error;
    }
  },

  logout: () => {
    apiClient.logout();
    set({
      user: null,
      isAuthenticated: false,
      error: null,
    });
  },

  clearError: () => {
    set({ error: null });
  },

  setUser: (user: User | null) => {
    set({
      user,
      isAuthenticated: !!user,
    });
  },

  checkAuth: async () => {
    set({ isLoading: true });

    const accessToken = localStorage.getItem("access_token");
    const refreshToken = localStorage.getItem("refresh_token");
    const userJson = localStorage.getItem("user");

    if (!refreshToken || !userJson) {
      set({ isAuthenticated: false, user: null, isLoading: false });
      return;
    }

    try {
      const user: User = JSON.parse(userJson);

      if (!accessToken) {
        let refreshed;
        try {
          if (!apiClient.refreshPromise) {
            apiClient.refreshPromise = apiClient.refreshToken();
          }
          refreshed = await apiClient.refreshPromise;
        } finally {
          apiClient.refreshPromise = null;
        }

        if (!refreshed || !refreshed.user) {
          throw new Error("Failed to refresh token");
        }
        localStorage.setItem("user", JSON.stringify(refreshed.user));
        set({ isAuthenticated: true, user: refreshed.user, isLoading: false });
        return;
      }
      set({ user: user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      console.error("Failed to parse user data:", error);
      apiClient.logout();
      set({ isAuthenticated: false, user: null, isLoading: false });
    }
  },
  initialize: async () => {
    await useAuthStore.getState().checkAuth();
  },
}));
