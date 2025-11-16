// store/chatStore.ts
import { create } from "zustand";
import { apiClient } from "@/lib/api";

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

interface ChatState {
  messages: Message[];
  sessionId: string | null;
  modelType: "gpt" | "claude";
  isLoading: boolean;
  error: string | null;
  conversationLength: number;
  limitReached: boolean;
  limitExpiresAt: number | null;

  // Actions
  setModelType: (model: "gpt" | "claude") => void;
  initializeSession: () => void;
  sendMessage: (message: string) => Promise<void>;
  clearChat: () => Promise<void>;
  clearUserData: () => Promise<void>;
  clearError: () => void;
  clearSession: () => void;
  checkLimit: () => boolean;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sessionId: null,
  modelType: "gpt",
  isLoading: false,
  error: null,
  conversationLength: 0,
  limitReached: false,
  limitExpiresAt: null,

  setModelType: (model) => set({ modelType: model }),

  initializeSession: () => {
    const existingSessionId = localStorage.getItem("session_id");
    if (existingSessionId) {
      set({ sessionId: existingSessionId });
      return;
    }
    const userStr = localStorage.getItem("user");

    if (!userStr) {
      set({ error: "No user found" });
      return;
    }
    try {
      const user = JSON.parse(userStr);
      const sessionId = `${user.id.substring(0, 6)}-${crypto.randomUUID()}`;
      set({ sessionId });
      localStorage.setItem("session_id", sessionId);
    } catch {
      set({ error: "Failed to initialize session" });
    }
  },

  sendMessage: async (message: string) => {
    const { conversationLength, limitReached } = get();

    if (limitReached) {
      const expiresAt = get().limitExpiresAt;
      const hoursLeft = expiresAt
        ? Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60))
        : 4;
      set({
        error: `Message limit reached. Try again in ${hoursLeft} hour(s).`,
      });
      return;
    }

    if (conversationLength + 2 >= 10) {
      // Set 4-hour cooldown
      const expiresAt = Date.now() + 4 * 60 * 60 * 1000; // 4 hours in milliseconds
      localStorage.setItem("limit_expires_at", expiresAt.toString());
      set({
        limitReached: true,
        limitExpiresAt: expiresAt,
      });
    }

    const { sessionId, modelType, messages } = get();

    if (!sessionId) {
      set({ error: "No session ID" });
      return;
    }

    const userStr = localStorage.getItem("user");
    if (!userStr) {
      set({ error: "No user found" });
      return;
    }

    let userId: string;
    try {
      const user = JSON.parse(userStr);
      userId = user.id;
    } catch {
      set({ error: "Failed to parse user data" });
      return;
    }

    set({ isLoading: true, error: null });

    // Add user message immediately
    const userMessage: Message = {
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };
    set({ messages: [...messages, userMessage] });

    try {
      const response = await apiClient.chat(
        message,
        userId,
        sessionId,
        modelType
      );

      const data = Array.isArray(response) ? response[0] : response;

      console.log("API Response:", data);
      console.log("Message from API", data.message);

      const assistantMessage: Message = {
        role: "assistant",
        content: data.message || "",
        timestamp: new Date().toISOString(),
      };

      console.log("Assistant Message Object:", assistantMessage);

      set({
        messages: [...get().messages, assistantMessage],
        conversationLength:
          data.conversation_length || get().conversationLength + 2,
        isLoading: false,
      });

      console.log("All messages after update:", get().messages);
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to send message",
        isLoading: false,
      });
      // Remove the optimistically added user message on error
      set({ messages: messages });
    }
  },

  clearChat: async () => {
    const { sessionId } = get();

    if (!sessionId) return;

    set({ isLoading: true, error: null });

    try {
      await apiClient.clearHistory(sessionId);
      set({
        messages: [],
        conversationLength: 0,
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to clear chat",
        isLoading: false,
      });
    }
  },

  clearUserData: async () => {
    set({ isLoading: true, error: null });

    const userStr = localStorage.getItem("user");
    if (!userStr) {
      set({ error: "No user found", isLoading: false });
      return;
    }

    let userId: string;
    try {
      const user = JSON.parse(userStr);
      userId = user.id;
    } catch {
      set({ error: "Failed to parse user data", isLoading: false });
      return;
    }

    try {
      await apiClient.clearUserData(userId);
      set({
        messages: [],
        conversationLength: 0,
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to clear user data",
        isLoading: false,
      });
    }
  },

  clearError: () => set({ error: null }),

  clearSession: () => {
    localStorage.removeItem("session_id");
    localStorage.removeItem("limit_expires_at");
    set({
      messages: [],
      sessionId: null,
      modelType: "gpt",
      isLoading: false,
      error: null,
      conversationLength: 0,
      limitReached: false,
      limitExpiresAt: null,
    });
  },

  checkLimit: () => {
    const limitTimestamp = localStorage.getItem("limit_expires_at");

    if (limitTimestamp) {
      const expiresAt = parseInt(limitTimestamp);
      const now = Date.now();

      if (now < expiresAt) {
        set({
          limitReached: true,
          limitExpiresAt: expiresAt,
        });
        return true;
      } else {
        localStorage.removeItem("limit_expires_at");
        set({
          limitReached: false,
          limitExpiresAt: null,
        });
        return false;
      }
    }
    return false;
  },
}));
