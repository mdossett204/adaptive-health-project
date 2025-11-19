"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";

const MAX_MESSAGES = 11;

export default function ChatPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout, checkAuth } = useAuthStore();
  const {
    messages,
    modelType,
    isLoading,
    error,
    conversationLength,
    limitReached,
    limitExpiresAt,
    setModelType,
    initializeSession,
    sendMessage,
    clearChat,
    clearUserData,
    clearError,
    clearSession,
    clearRateLimit,
  } = useChatStore();

  const [inputMessage, setInputMessage] = useState("");
  const [showModelSelector, setShowModelSelector] = useState(true);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check authentication
  useEffect(() => {
    const initAuth = async () => {
      await checkAuth();
      setIsCheckingAuth(false);
    };

    initAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isCheckingAuth && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isCheckingAuth, router]);

  useEffect(() => {
    if (isAuthenticated) {
      initializeSession();
    }
  }, [isAuthenticated, initializeSession]);

  // Countdown timer for limit
  useEffect(() => {
    if (limitReached && limitExpiresAt) {
      const interval = setInterval(() => {
        const now = Date.now();
        const diff = limitExpiresAt - now;

        if (diff <= 0) {
          setTimeRemaining("");
          clearRateLimit();
          clearInterval(interval);
        } else {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          setTimeRemaining(`${hours}h ${minutes}m`);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [limitReached, limitExpiresAt, clearRateLimit]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleModelSelect = (model: "gpt" | "claude") => {
    setModelType(model);
    setShowModelSelector(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputMessage.trim()) return;

    if (conversationLength + 2 >= MAX_MESSAGES || limitReached) {
      alert(
        `You have reached your message limit. ${
          timeRemaining ? `Try again in ${timeRemaining}.` : "Try again later."
        }`
      );
      return;
    }

    await sendMessage(inputMessage);
    setInputMessage("");
  };

  const handleClearChat = async () => {
    if (window.confirm("Are you sure you want to clear this chat?")) {
      await clearChat();
    }
  };

  const handleClearUserData = async () => {
    if (
      window.confirm(
        "Are you sure you want to clear all your stored data? This cannot be undone."
      )
    ) {
      await clearUserData();
    }
  };

  const handleLogout = () => {
    clearSession();
    logout();
    router.push("/login");
  };

  const handleChangeModel = () => {
    if (messages.length > 0) {
      if (window.confirm("Switch AI model? Your conversation will continue.")) {
        setShowModelSelector(true);
      }
    } else {
      setShowModelSelector(true);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-gray-900">AI Chat</h1>
              {!showModelSelector && (
                <>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                    {modelType === "gpt" ? "GPT" : "Claude"}
                  </span>
                  {conversationLength > 0 && (
                    <span className="text-sm text-gray-500">
                      {conversationLength}/{MAX_MESSAGES} messages
                    </span>
                  )}
                  {limitReached && timeRemaining && (
                    <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                      Cooldown: {timeRemaining}
                    </span>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 hidden sm:inline">
                {user?.email}
              </span>

              {!showModelSelector && (
                <>
                  <button
                    onClick={handleChangeModel}
                    className="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    Change Model
                  </button>

                  <button
                    onClick={handleClearChat}
                    className="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    Clear Chat
                  </button>

                  <button
                    onClick={handleClearUserData}
                    className="px-3 py-1 text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    Clear Data
                  </button>
                </>
              )}

              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Model Selection Screen */}
      {showModelSelector && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow p-8 max-w-2xl w-full">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2 text-center">
              Choose Your AI Model
            </h2>
            <p className="text-gray-600 text-center mb-8">
              Select which AI model you would like to chat with
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => handleModelSelect("gpt")}
                className="p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all group text-left"
              >
                <h3 className="text-xl font-semibold text-gray-900 group-hover:text-blue-600 mb-2">
                  GPT
                </h3>
                <p className="text-sm text-gray-600">OpenAI GPT model</p>
              </button>

              <button
                onClick={() => handleModelSelect("claude")}
                className="p-6 border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all group text-left"
              >
                <h3 className="text-xl font-semibold text-gray-900 group-hover:text-purple-600 mb-2">
                  Claude
                </h3>
                <p className="text-sm text-gray-600">Anthropic Claude model</p>
              </button>
            </div>
          </div>
        </main>
      )}

      {/* Chat Interface */}
      {!showModelSelector && (
        <>
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Error Display */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md flex justify-between items-center">
                <p className="text-sm text-red-800">{error}</p>
                <button
                  onClick={clearError}
                  className="text-red-600 hover:text-red-800 ml-4"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            )}

            {/* Messages Container */}
            <div className="bg-white rounded-lg shadow">
              <div className="h-[calc(100vh-320px)] overflow-y-auto p-6 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-gray-500">
                      <svg
                        className="w-16 h-16 mx-auto mb-4 text-gray-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                      <p className="text-lg font-medium">
                        Start a conversation
                      </p>
                      <p className="text-sm mt-1">
                        Send a message to begin chatting with{" "}
                        {modelType === "gpt" ? "GPT" : "Claude"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex ${
                          msg.role === "user" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-4 py-3 ${
                            msg.role === "user"
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 text-gray-900"
                          }`}
                        >
                          {msg.role === "assistant" ? (
                            <div className="flex items-start gap-2">
                              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium mt-0.5">
                                AI
                              </div>
                              <p className="whitespace-pre-wrap break-words flex-1">
                                {msg.content}
                              </p>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap break-words">
                              {msg.content}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Input Area */}
              <div className="border-t border-gray-200 p-4">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder={
                      limitReached || conversationLength >= MAX_MESSAGES
                        ? `Limit reached. ${
                            timeRemaining
                              ? `Wait ${timeRemaining}`
                              : "Wait 4 hours"
                          }`
                        : "Type your message..."
                    }
                    disabled={isLoading || conversationLength >= MAX_MESSAGES}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    maxLength={10000}
                  />
                  <button
                    type="submit"
                    disabled={
                      isLoading ||
                      !inputMessage.trim() ||
                      conversationLength >= MAX_MESSAGES
                    }
                    className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {isLoading ? (
                      <svg
                        className="animate-spin h-5 w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    ) : (
                      "Send"
                    )}
                  </button>
                </form>
                {(conversationLength >= MAX_MESSAGES || limitReached) && (
                  <p className="text-sm text-red-600 mt-2 text-center">
                    You have reached the maximum of {MAX_MESSAGES} messages.
                    {timeRemaining && ` Wait ${timeRemaining} to continue.`}
                  </p>
                )}
              </div>
            </div>
          </main>
        </>
      )}
    </div>
  );
}
