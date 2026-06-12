import axios from "axios";

const API = axios.create({
  baseURL: "https://chatly-chatbot-2.onrender.com/",
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("chatly_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default API;
