import { useState } from "react";
import API from "./api";

export default function Register({ setMode }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const register = async () => {
    if (!username.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      alert("Please fill all fields.");
      return;
    }

    if (password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await API.post("/register", {
        username,
        email,
        password,
      });

      alert(res.data.message || "Registration successful. Please login.");
      setMode("login");
    } catch (error) {
      console.error(error);
      const errMsg = error.response?.data?.message || "Registration failed. Please try again.";
      alert(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      register();
    }
  };

  return (
    <div className="auth-card">
      <h2>Create account</h2>
      <p className="auth-subtext">Register to start using Chatly.</p>

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
        type="email"
        placeholder="Email Address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
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

      <input
        className="auth-input"
        type="password"
        placeholder="Confirm Password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        onKeyDown={onKeyDown}
      />

      <button
        className="auth-btn primary"
        onClick={register}
        disabled={loading}
      >
        {loading ? "Creating account..." : "Register"}
      </button>
    </div>
  );
}