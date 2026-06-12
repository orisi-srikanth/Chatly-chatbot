import { useState } from "react";
import API from "./api";

export default function ResetPassword({ token }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleReset = async () => {
    if (!password.trim() || !confirmPassword.trim()) {
      alert("Please fill all fields.");
      return;
    }

    if (password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await API.post("/reset-password", {
        token,
        password,
      });

      alert(res.data.message || "Password reset successfully. Please login.");
      setSuccess(true);
      // Redirect back to home without parameters
      window.location.href = window.location.origin + window.location.pathname;
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.message || "Failed to reset password. Token may be invalid or expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell" style={{ gridTemplateColumns: "1fr", maxWidth: "500px" }}>
        <div className="auth-panel" style={{ padding: "32px", borderRadius: "28px" }}>
          <div className="auth-card">
            <h2 style={{ fontSize: "1.8rem", fontWeight: "800", marginBottom: "8px" }}>
              New Password
            </h2>
            <p className="auth-subtext" style={{ marginBottom: "24px" }}>
              Please enter and confirm your new password below.
            </p>

            <input
              className="auth-input"
              type="password"
              placeholder="New Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleReset()}
            />

            <input
              className="auth-input"
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleReset()}
            />

            <button
              className="auth-btn primary"
              onClick={handleReset}
              disabled={loading || success}
              style={{ marginTop: "12px" }}
            >
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
