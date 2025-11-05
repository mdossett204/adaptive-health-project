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
    if (typeof window === "undefined") return;

    const accessToken = localStorage.getItem("access_token");
    const refreshToken = localStorage.getItem("refresh_token");

    if (!accessToken || !refreshToken) {
      set({ isAuthenticated: false, user: null });
      return;
    }

    try {
      const response = await apiClient.getItems();

      if (response.user) {
        set({
          user: response.user,
          isAuthenticated: true,
        });
      } else {
        throw new Error("No user data returned");
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      apiClient.logout();
      set({
        user: null,
        isAuthenticated: false,
      });
    }
  },
  initialize: async function () {
    await this.checkAuth();
  },
}));
