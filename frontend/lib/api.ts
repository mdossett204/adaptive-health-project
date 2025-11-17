// lib/api.ts
const ENDPOINTS = {
  SIGNUP: process.env.NEXT_PUBLIC_MODAL_SIGNUP_URL!,
  LOGIN: process.env.NEXT_PUBLIC_MODAL_LOGIN_URL!,
  REFRESH_TOKEN: process.env.NEXT_PUBLIC_MODAL_REFRESH_TOKEN_URL!,
  CHAT: process.env.NEXT_PUBLIC_MODAL_CHAT_URL!,
  CLEAR_HISTORY: process.env.NEXT_PUBLIC_MODAL_CLEAR_HISTORY_URL!,
  CLEAR_USER_DATA: process.env.NEXT_PUBLIC_MODAL_CLEAR_USER_DATA_URL!,
};

interface ApiResponse<T = unknown> {
  success?: boolean;
  data?: T;
  message?: string;
  user?: {
    id: string;
    email: string;
  };
}

interface AuthResponse extends ApiResponse {
  access_token?: string;
  refresh_token?: string;
  requiresEmailConfirmation?: boolean;
}

interface ChatResponse extends ApiResponse {
  message?: string;
  session_id?: string;
  user_id?: string;
  model?: string;
  conversation_length?: number;
  context_items_found?: number;
  status?: string;
  rate_limited?: boolean;
  expires_at?: string;
}

interface ClearResponse extends ApiResponse {
  session_id?: string;
  user_id?: string;
  deleted_count?: number;
  status?: string;
  rate_limited?: boolean;
  expires_at?: string;
}

class ApiClient {
  public refreshPromise: Promise<AuthResponse> | null = null;

  private getHeaders(includeAuth: boolean = false): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (includeAuth) {
      let token: string | null = null;

      token = localStorage.getItem("access_token");

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  private async fetchWithAuthRetry(
    input: RequestInfo,
    init: RequestInit
  ): Promise<Response> {
    const response = await fetch(input, init);

    if (response.status === 401) {
      try {
        if (!this.refreshPromise) {
          this.refreshPromise = this.refreshToken();
        }

        await this.refreshPromise;
      } catch (error) {
        this.logout();

        throw error;
      } finally {
        this.refreshPromise = null;
      }
      const newInit = {
        ...init,
        headers: {
          ...init.headers,
          ...this.getHeaders(true),
        },
      };
      return await fetch(input, newInit);
    }

    return response;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const message = errJson?.detail || errJson?.error || errJson?.message;
      throw new Error(message || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async signup(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(ENDPOINTS.SIGNUP, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ email, password }),
    });
    return this.handleResponse<AuthResponse>(response);
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(ENDPOINTS.LOGIN, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const data = await this.handleResponse<AuthResponse>(response);

    // Store tokens

    if (data.access_token) {
      localStorage.setItem("access_token", data.access_token);
    }
    if (data.refresh_token) {
      localStorage.setItem("refresh_token", data.refresh_token);
    }
    if (data.user) {
      localStorage.setItem("user", JSON.stringify(data.user));
    }

    return data;
  }

  async refreshToken(): Promise<AuthResponse> {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await fetch(ENDPOINTS.REFRESH_TOKEN, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const data = await this.handleResponse<AuthResponse>(response);

    // Update tokens
    if (data.access_token) {
      localStorage.setItem("access_token", data.access_token);
    }
    if (data.refresh_token) {
      localStorage.setItem("refresh_token", data.refresh_token);
    }
    if (data.user) {
      localStorage.setItem("user", JSON.stringify(data.user));
    }

    return data;
  }

  async chat(
    message: string,
    userId: string,
    sessionId: string,
    model: "gpt" | "claude"
  ): Promise<ChatResponse> {
    const response = await this.fetchWithAuthRetry(ENDPOINTS.CHAT, {
      method: "POST",
      headers: this.getHeaders(true),
      body: JSON.stringify({
        message,
        user_id: userId,
        session_id: sessionId,
        model,
      }),
    });
    return this.handleResponse<ChatResponse>(response);
  }

  async clearHistory(sessionId: string): Promise<ClearResponse> {
    const response = await this.fetchWithAuthRetry(ENDPOINTS.CLEAR_HISTORY, {
      method: "DELETE",
      headers: this.getHeaders(true),
      body: JSON.stringify({ session_id: sessionId }),
    });
    return this.handleResponse<ClearResponse>(response);
  }

  async clearUserData(userId: string): Promise<ClearResponse> {
    const response = await this.fetchWithAuthRetry(ENDPOINTS.CLEAR_USER_DATA, {
      method: "DELETE",
      headers: this.getHeaders(true),
      body: JSON.stringify({ user_id: userId }),
    });
    return this.handleResponse<ClearResponse>(response);
  }

  logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
  }
}

export const apiClient = new ApiClient();
