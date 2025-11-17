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
  clearChat: () => void;
  clearUserData: () => Promise<void>;
  clearError: () => void;
  clearSession: () => void;
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
    const { sessionId, modelType, messages, limitReached } = get();

    console.log(limitReached, "Limit reached status");

    if (limitReached) {
      set({
        error: `Message limit reached. Try again later.`,
      });
      return;
    }

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

      if (data.rate_limited) {
        const expiresAt = data.expires_at
          ? new Date(data.expires_at).getTime()
          : null;
        set({
          error: data.error || "You have been rate limited.",
          limitReached: true,
          limitExpiresAt: expiresAt,
          conversationLength: data.conversation_length || 10,
          isLoading: false,
          messages: messages, // Revert to previous messages
        });
        return;
      }

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

      if (data.rate_limited && data.expires_at) {
        const expiresAt = new Date(data.expires_at).getTime();
        set({
          limitReached: true,
          limitExpiresAt: expiresAt,
        });
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to send message",
        isLoading: false,
        messages: messages, // Revert to previous messages
      });
      // Remove the optimistically added user message on error
      set({ messages: messages });
    }
  },

  clearChat: () => {
    set({
      messages: [],
    });
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
    set({
      messages: [],
      sessionId: null,
      modelType: "gpt",
      isLoading: false,
      error: null,
      conversationLength: 0,
    });
  },
}));
