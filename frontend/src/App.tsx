import { useState } from "react";
import Login from "./pages/Login";
import Bar from "./pages/Bar";
import type { User } from "./types";

const STORAGE_KEY = "amber_user";

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(loadUser);

  const handleLogin = (u: User) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  if (!user) return <Login onLogin={handleLogin} />;
  return <Bar user={user} onLogout={handleLogout} />;
}
