import { useState } from "react";
import type { Role, User } from "../types";

interface Props {
  onLogin: (user: User) => void;
}

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
  marginBottom: "0.5rem",
};

const fieldInput: React.CSSProperties = {
  width: "100%",
  padding: "0.625rem 0.875rem",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 4,
};

const fieldSelect: React.CSSProperties = {
  width: "100%",
  height: "2.625rem",
  padding: "0 2.5rem 0 0.875rem",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  cursor: "pointer",
  lineHeight: "2.625rem",
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23705542' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.875rem center",
};

type Mode = "login" | "signup";

export default function Login({ onLogin }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("customer");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setPassword("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = isSignup ? "/api/signup" : "/api/login";
      const payload = isSignup
        ? { username: nickname, password, role }
        : { username: nickname, password, code };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Something went wrong");
      }
      const data = await res.json();
      onLogin({ nickname: data.nickname, role: data.role, token: data.token });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>

      {/* ── Left branding panel ── */}
      <div className="login-brand" style={{
        width: 440,
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(150deg, #eddcbf 0%, #f2e6ce 45%, #e8d9bc 100%)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        padding: "3rem 2.5rem",
      }}>
        {/* warm ambient wash */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse 60% 50% at 50% 46%, rgba(160,88,12,0.1) 0%, transparent 68%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", textAlign: "center" }}>
          <div style={{
            fontSize: "4.5rem",
            lineHeight: 1,
            marginBottom: "1.75rem",
          }}>🍸</div>

          <div style={{
            fontSize: "1.875rem",
            fontWeight: 800,
            color: "var(--amber-lt)",
            letterSpacing: "-0.025em",
            marginBottom: "0.625rem",
            fontFamily: "'Pixelify Sans', sans-serif",
          }}>
            The Amber Hour
          </div>
          <p style={{
            color: "var(--text-muted)",
            fontSize: "0.9rem",
            lineHeight: 1.7,
            maxWidth: 240,
            margin: "0 auto",
          }}>
            A bar worth staying late for.
          </p>
        </div>

        <div style={{
          position: "absolute",
          bottom: "2rem",
          display: "flex",
          gap: "0.4rem",
        }}>
          {[true, false, false].map((active, i) => (
            <div key={i} style={{
              width: 5, height: 5, borderRadius: "50%",
              background: active ? "var(--amber)" : "var(--border)",
              opacity: active ? 1 : 0.5,
            }} />
          ))}
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        overflowY: "auto",
        justifyContent: "center",
        background: "var(--bg)",
        padding: "2rem",
      }}>
        <div style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--surface)",
          borderRadius: 6,
          padding: "2.5rem 2rem",
          boxShadow: "0 4px 28px rgba(80,40,10,0.13)",
          border: "1px solid var(--border)",
        }}>
          {/* mode tabs */}
          <div style={{
            display: "flex",
            gap: "0.25rem",
            padding: "0.25rem",
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderRadius: 5,
            marginBottom: "1.75rem",
          }}>
            {(["login", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  fontSize: "0.85rem",
                  borderRadius: 4,
                  border: "none",
                  cursor: "pointer",
                  background: mode === m ? "var(--amber)" : "transparent",
                  color: mode === m ? "#fff" : "var(--text-muted)",
                  fontWeight: mode === m ? 700 : 500,
                }}
              >
                {m === "login" ? "Log In" : "Sign Up"}
              </button>
            ))}
          </div>

          {/* heading */}
          <div style={{ textAlign: "center", marginBottom: "1.875rem" }}>
            <h1 style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "-0.01em",
              marginBottom: "0.375rem",
            }}>
              {isSignup ? "Join the bar." : "Welcome back."}
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              {isSignup ? "First round's on us." : "We're so glad you're here."}
            </p>
          </div>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1.125rem" }}>
            <div>
              <label style={fieldLabel}>Nickname</label>
              <input
                placeholder={isSignup ? "How should we call you?" : "Your nickname"}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                style={fieldInput}
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label style={fieldLabel}>Password</label>
              <input
                type="password"
                placeholder={isSignup ? "At least 6 characters" : "••••••••"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={fieldInput}
                autoComplete={isSignup ? "new-password" : "current-password"}
                required
              />
            </div>

            {!isSignup && (
              <div>
                <label style={fieldLabel}>Access Code</label>
                <input
                  placeholder="Tonight's session code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  style={fieldInput}
                  required
                />
              </div>
            )}

            {isSignup && (
              <div>
                <label style={fieldLabel}>You are</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  style={fieldSelect}
                >
                  <option value="customer">🪑 Guest</option>
                  <option value="staff">🍸 Staff</option>
                </select>
              </div>
            )}

            {error && (
              <div style={{
                color: "var(--danger)",
                fontSize: "0.8125rem",
                padding: "0.625rem 0.875rem",
                background: "color-mix(in srgb, var(--danger) 8%, var(--surface))",
                borderRadius: 4,
                border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "0.6875rem",
                fontSize: "0.9375rem",
                borderRadius: 4,
                marginTop: "0.25rem",
              }}
            >
              {loading
                ? "Opening the door…"
                : isSignup ? "Create Account" : "Enter the Bar"}
            </button>
          </form>

          <p style={{
            marginTop: "1.125rem",
            textAlign: "center",
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
          }}>
            {isSignup ? (
              <>
                Already a regular?{" "}
                <span
                  onClick={() => switchMode("login")}
                  style={{ color: "var(--amber-lt)", fontWeight: 500, cursor: "pointer" }}
                >
                  Log in.
                </span>
              </>
            ) : (
              <>
                New here?{" "}
                <span
                  onClick={() => switchMode("signup")}
                  style={{ color: "var(--amber-lt)", fontWeight: 500, cursor: "pointer" }}
                >
                  Create an account.
                </span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
