const ENDPOINTS = {
  SIGNUP: process.env.NEXT_PUBLIC_MODAL_SIGNUP_URL!,
  LOGIN: process.env.NEXT_PUBLIC_MODAL_LOGIN_URL!,
  REFRESH_TOKEN: process.env.NEXT_PUBLIC_MODAL_REFRESH_TOKEN_URL!,
  CREATE_ITEM: process.env.NEXT_PUBLIC_MODAL_CREATE_ITEM_URL!,
  GET_ITEMS: process.env.NEXT_PUBLIC_MODAL_GET_ITEM_URL!,
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

class ApiClient {
  private refreshPromise: Promise<AuthResponse> | null = null;

  private getHeaders(includeAuth: boolean = false): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (includeAuth) {
      let token: string | null = null;

      if (typeof window !== "undefined") {
        token = localStorage.getItem("access_token");
      }

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
        this.refreshPromise = null;

        // Retry with new token - rebuild headers
        const newInit = {
          ...init,
          headers: this.getHeaders(true),
        };

        return await fetch(input, newInit);
      } catch (error) {
        this.logout();

        // Redirect to login or throw error for UI to handle
        // if (typeof window !== "undefined") {
        //   window.location.href = "/login";
        // }

        throw error;
      }
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
    if (typeof window !== "undefined") {
      if (data.access_token) {
        localStorage.setItem("access_token", data.access_token);
      }
      if (data.refresh_token) {
        localStorage.setItem("refresh_token", data.refresh_token);
      }
    }

    return data;
  }

  async refreshToken(): Promise<AuthResponse> {
    if (typeof window === "undefined") {
      throw new Error("Cannot refresh token on server side");
    }

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

    return data;
  }

  async createItem(item: Record<string, unknown>): Promise<ApiResponse> {
    const response = await this.fetchWithAuthRetry(ENDPOINTS.CREATE_ITEM, {
      method: "POST",
      headers: this.getHeaders(true),
      body: JSON.stringify(item),
    });
    return this.handleResponse<ApiResponse>(response);
  }

  async getItems(): Promise<ApiResponse> {
    const response = await this.fetchWithAuthRetry(ENDPOINTS.GET_ITEMS, {
      method: "GET",
      headers: this.getHeaders(true),
    });
    return this.handleResponse<ApiResponse>(response);
  }

  logout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
    }
  }
}

export const apiClient = new ApiClient();
