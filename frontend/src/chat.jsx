import { useEffect, useMemo, useRef, useState } from "react";
import API from "./api";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

const getStorageKey = (username) => `chatly_sidebar_chats_${username || "default"}`;

function safeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createChat() {
  return {
    id: Date.now().toString(),
    title: "New Chat",
    messages: [],
    createdAt: new Date().toISOString(),
  };
}

function normalizeChats(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((chat) => chat && typeof chat === "object")
    .map((chat) => ({
      id: String(chat.id || Date.now()),
      title: typeof chat.title === "string" ? chat.title : "New Chat",
      messages: Array.isArray(chat.messages) ? chat.messages : [],
      createdAt:
        typeof chat.createdAt === "string"
          ? chat.createdAt
          : new Date().toISOString(),
    }));
}

export default function Chat({ setLoggedIn }) {
  const username = localStorage.getItem("chatly_username") || "User";
  const [message, setMessage] = useState("");
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const bottomRef = useRef(null);

  useEffect(() => {
    const key = getStorageKey(username);
    const savedChats = localStorage.getItem(key);

    if (savedChats) {
      try {
        const parsed = JSON.parse(savedChats);
        const normalized = normalizeChats(parsed);

        if (normalized.length > 0) {
          setChats(normalized);
          setCurrentChatId(normalized[0].id);
          return;
        }
      } catch (error) {
        console.error("Invalid local chat cache, resetting:", error);
      }
    }

    const firstChat = createChat();
    setChats([firstChat]);
    setCurrentChatId(firstChat.id);
  }, [username]);

  useEffect(() => {
    if (chats.length > 0) {
      const key = getStorageKey(username);
      localStorage.setItem(key, JSON.stringify(chats));
    }
  }, [chats, username]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats, thinking, loading, currentChatId]);

  const currentChat = useMemo(
    () => chats.find((chat) => chat.id === currentChatId),
    [chats, currentChatId]
  );

  const updateChat = (chatId, updater) => {
    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? updater(chat) : chat))
    );
  };

  const createNewChat = () => {
    const newChat = createChat();
    setChats((prev) => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    setMessage("");
  };

  const deleteChat = (chatId) => {
    const filtered = chats.filter((chat) => chat.id !== chatId);

    if (filtered.length === 0) {
      const fresh = createChat();
      setChats([fresh]);
      setCurrentChatId(fresh.id);
      return;
    }

    setChats(filtered);

    if (currentChatId === chatId) {
      setCurrentChatId(filtered[0].id);
    }
  };

  const clearAllChats = () => {
    const fresh = createChat();
    setChats([fresh]);
    setCurrentChatId(fresh.id);
    localStorage.removeItem(getStorageKey(username));
    setMessage("");
  };

  const logout = () => {
    localStorage.removeItem("chatly_token");
    localStorage.removeItem("chatly_username");
    setLoggedIn(false);
  };

  const streamText = async (fullText, callback) => {
    let current = "";
    for (let i = 0; i < fullText.length; i++) {
      current += fullText[i];
      callback(current);
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
  };

  const sendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed || loading || !currentChatId) return;

    const userMsg = {
      id: safeId(),
      role: "user",
      text: trimmed,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const existingMessages = currentChat?.messages || [];
    const updatedHistory = [...existingMessages, userMsg];

    updateChat(currentChatId, (chat) => ({
      ...chat,
      title:
        chat.messages.length === 0
          ? trimmed.slice(0, 26) + (trimmed.length > 26 ? "..." : "")
          : chat.title,
      messages: updatedHistory,
    }));

    setMessage("");
    setLoading(true);
    setThinking("🤖 Thinking...");

    try {
      const res = await API.post("/chat", {
        message: trimmed,
        history: updatedHistory,
      });

      setThinking("");

      const responseData = res.data;
      const replyText =
        typeof responseData === "string"
          ? responseData
          : responseData.reply || "No response from server.";

      if (responseData && typeof responseData === "object" && responseData.tool) {
        updateChat(currentChatId, (chat) => ({
          ...chat,
          messages: [
            ...chat.messages,
            {
              id: safeId(),
              role: "tool",
              text: `🔧 Used Tool: ${responseData.tool}`,
              time: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          ],
        }));
      }

      if (
        responseData &&
        typeof responseData === "object" &&
        responseData.reasoning
      ) {
        updateChat(currentChatId, (chat) => ({
          ...chat,
          messages: [
            ...chat.messages,
            {
              id: safeId(),
              role: "system",
              text: `🧠 Reasoning: ${responseData.reasoning}`,
              time: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          ],
        }));
      }

      updateChat(currentChatId, (chat) => ({
        ...chat,
        messages: [
          ...chat.messages,
          {
            id: safeId(),
            role: "assistant",
            text: "",
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ],
      }));

      await streamText(replyText, (chunk) => {
        updateChat(currentChatId, (chat) => {
          const copy = [...chat.messages];
          copy[copy.length - 1] = {
            ...copy[copy.length - 1],
            text: chunk,
          };
          return { ...chat, messages: copy };
        });
      });
    } catch (error) {
      console.error(error);
      setThinking("");

      updateChat(currentChatId, (chat) => ({
        ...chat,
        messages: [
          ...chat.messages,
          {
            id: safeId(),
            role: "assistant",
            text: "⚠️ Error occurred while contacting backend.",
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ],
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };



  return (
    <div className="chat-app">
      <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-top">
          <div className="brand-mini">
            <div className="brand-mini-badge">✦</div>
            {sidebarOpen && <span>Chatly</span>}
          </div>

          <button className="new-chat-btn" onClick={createNewChat}>
            {sidebarOpen ? "+ New Chat" : "+"}
          </button>
        </div>

        {sidebarOpen && (
          <>
            <div className="sidebar-user-card">
              <div className="sidebar-user-name">{username}</div>
              <div className="sidebar-user-sub">Authenticated session</div>
            </div>

            <div className="chat-list">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`chat-list-item ${
                    chat.id === currentChatId ? "active" : ""
                  }`}
                >
                  <button
                    className="chat-list-main"
                    onClick={() => setCurrentChatId(chat.id)}
                    title={chat.title}
                  >
                    {chat.title}
                  </button>

                  <button
                    className="chat-delete-btn"
                    onClick={() => deleteChat(chat.id)}
                    title="Delete chat"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="sidebar-bottom">
              <button className="side-btn muted" onClick={clearAllChats}>
                Clear Chats
              </button>
              <button className="side-btn" onClick={logout}>
                Logout
              </button>
            </div>
          </>
        )}
      </aside>

      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen((prev) => !prev)}
      >
        {sidebarOpen ? "‹" : "›"}
      </button>

      <main className="main-panel">
        <header className="main-topbar">
          <div>
            <h2>Chatly</h2>
            <p>Tool-aware assistant with memory-ready chat history</p>
          </div>
          <div className="status-pill">● Online</div>
        </header>

        <section className="messages-panel">
          {!currentChat || currentChat.messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-badge">✦</div>
              <h3>Start a new intelligent conversation</h3>
              <p>
                Ask questions, test your agent flow, send memory-aware prompts,
                or connect this UI with your upgraded backend tools.
              </p>

              <div className="empty-suggestions">
                {[
                  "Explain AI agent architecture simply",
                  "Give me a placement roadmap",
                  "Create a project idea with features",
                  "How does tool calling work?",
                ].map((item) => (
                  <button
                    key={item}
                    className="suggestion-btn"
                    onClick={() => setMessage(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {currentChat.messages.map((msg) => (
                <div key={msg.id} className={`msg ${msg.role}`}>
                  <div className="msg-card">
                    <div className="msg-meta">
                      <span>
                        {msg.role === "user"
                          ? "You"
                          : msg.role === "assistant"
                          ? "Chatly"
                          : msg.role === "tool"
                          ? "Tool"
                          : "System"}
                      </span>
                      <span>{msg.time}</span>
                    </div>

                    <ReactMarkdown
                      components={{
                        code({ inline, children, className, ...props }) {
                          const codeText = String(children).replace(/\n$/, "");

                          if (!inline) {
                            return (
                              <div className="codeBlock">
                                <button onClick={() => copyText(codeText)}>
                                  Copy
                                </button>
                                <SyntaxHighlighter
                                  style={vscDarkPlus}
                                  language="javascript"
                                  PreTag="div"
                                  {...props}
                                >
                                  {codeText}
                                </SyntaxHighlighter>
                              </div>
                            );
                          }

                          return (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          );
                        },
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}

              {thinking && <div className="thinking">{thinking}</div>}
              {loading && !thinking && (
                <div className="typing">Chatly is replying...</div>
              )}

              <div ref={bottomRef}></div>
            </div>
          )}
        </section>

        <footer className="composer">
          <div className="composer-box">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Chatly..."
              rows={1}
            />
            <button onClick={sendMessage} disabled={loading}>
              {loading ? "..." : "Send"}
            </button>
          </div>
          <p className="composer-note">
            Memory-ready history is being sent to backend with each request.
          </p>
        </footer>
      </main>
    </div>
  );
}