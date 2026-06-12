import { useState } from "react";
import Login from "./login";
import Register from "./Register";
import API from "./api";

function ForgotPassword({ setMode }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const handleReset = async () => {
    if (!email.trim()) {
      alert("Please enter your email.");
      return;
    }
    setLoading(true);
    setSuccessMsg("");
    try {
      const res = await API.post("/forgot-password", { email });
      setSuccessMsg(res.data.message || "Reset link sent!");
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.message || "Failed to send reset link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <h2>Reset Password</h2>
      <p className="auth-subtext">Enter your registered email to receive a password reset link.</p>
      
      {successMsg ? (
        <div style={{ color: "#22c55e", marginBottom: "18px", lineHeight: "1.5", textAlign: "left" }}>
          ✓ {successMsg}
          <p style={{ color: "#a1a1aa", fontSize: "0.85rem", marginTop: "10px" }}>
            If you are in a local testing environment, the reset link is also saved in the backend's <code>reset_links.txt</code> file.
          </p>
        </div>
      ) : (
        <input
          className="auth-input"
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleReset()}
        />
      )}

      <button className="auth-btn primary" onClick={handleReset} disabled={loading || !!successMsg} style={{ marginBottom: "12px" }}>
        {loading ? "Sending..." : successMsg ? "Sent" : "Send Reset Link"}
      </button>

      <button className="auth-btn" onClick={() => setMode("login")} style={{ background: "rgba(255,255,255,0.05)", color: "#fafafa" }}>
        Back to Login
      </button>
    </div>
  );
}

export default function Auth({ setLoggedIn }) {
  const [mode, setMode] = useState("login");

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <div className="auth-brand">
          <div className="brand-badge">✦</div>
          <h1>Chatly</h1>
          <p>
            Smart chat interface with authentication, memory-ready history,
            tool display, and modern AI-style UI.
          </p>

          <div className="auth-feature-list">
            <div className="auth-feature-card">🔐 Secure login system</div>
            <div className="auth-feature-card">🧠 Memory-ready chat flow</div>
            <div className="auth-feature-card">🛠 Tool-aware agent UI</div>
            <div className="auth-feature-card">⚡ Clean modern experience</div>
          </div>
        </div>

        <div className="auth-panel">
          {mode !== "forgot" && (
            <div className="auth-tabs">
              <button
                className={mode === "login" ? "tab active" : "tab"}
                onClick={() => setMode("login")}
              >
                Login
              </button>
              <button
                className={mode === "register" ? "tab active" : "tab"}
                onClick={() => setMode("register")}
              >
                Register
              </button>
            </div>
          )}

          {mode === "login" ? (
            <Login setLoggedIn={setLoggedIn} setMode={setMode} />
          ) : mode === "register" ? (
            <Register setMode={setMode} />
          ) : (
            <ForgotPassword setMode={setMode} />
          )}
        </div>
      </div>
    </div>
  );
}