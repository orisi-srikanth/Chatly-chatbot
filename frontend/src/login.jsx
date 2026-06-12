import { useState } from "react";
import API from "./api";

export default function Login({ setLoggedIn, setMode }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!username.trim() || !password.trim() || loading) return;

    setLoading(true);

    try {
      const res = await API.post("/login", {
        username,
        password,
      });

      const token = res.data.access_token || res.data.token;

      if (!token) {
        throw new Error("Login response did not include a token");
      }

      localStorage.setItem("chatly_token", token);
      localStorage.setItem("chatly_username", username);
      setLoggedIn(true);
    } catch (error) {
      console.error(error);
      alert("Login failed. Check username and password.");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      login();
    }
  };

  return (
    <div className="auth-card">
      <h2>Welcome back</h2>
      <p className="auth-subtext">Login to continue using Chatly.</p>

      <input
        className="auth-input"
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        onKeyDown={onKeyDown}
      />

      <input
        className="auth-input"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={onKeyDown}
      />

      <button className="auth-btn primary" onClick={login} disabled={loading}>
        {loading ? "Logging in..." : "Login"}
      </button>

      <button
        type="button"
        onClick={() => setMode("forgot")}
        style={{
          background: "none",
          border: "none",
          color: "var(--primary-red-hover)",
          cursor: "pointer",
          marginTop: "16px",
          display: "inline-block",
          textDecoration: "underline",
          font: "inherit"
        }}
      >
        Forgot Password?
      </button>
    </div>
  );
}