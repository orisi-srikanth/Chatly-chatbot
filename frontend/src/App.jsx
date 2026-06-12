import { useState, useEffect } from "react";
import Auth from "./Auth";
import Chat from "./chat";
import ResetPassword from "./ResetPassword";
import "./App.css";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(
    !!localStorage.getItem("chatly_token")
  );
  const [resetToken, setResetToken] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      setResetToken(token);
    }
  }, []);

  if (resetToken) {
    return <ResetPassword token={resetToken} />;
  }

  return loggedIn ? (
    <Chat setLoggedIn={setLoggedIn} />
  ) : (
    <Auth setLoggedIn={setLoggedIn} />
  );
}