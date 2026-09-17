import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { login, saveSession } from "../api/client";
import Message from "../components/Message";

const ROLES = [
  { key: "EXAM_BOARD", label: "Exam Board", color: "#534AB7", email: "board@exam.com" },
  { key: "PRESS", label: "Press", color: "#E65100", email: "press@exam.com" },
  { key: "DISTRIBUTION_CENTER", label: "Distribution Center", color: "#0F6E56", email: "center@exam.com" },
  { key: "INVIGILATOR", label: "Invigilator", color: "#185FA5", email: "invigilator@exam.com" },
] as const;

const DEFAULT_ROLE_COLOR = "#888780";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<(typeof ROLES)[number]["key"] | null>(null);
  const navigate = useNavigate();

  const selectedRole = ROLES.find((r) => r.key === role) ?? null;
  const roleColor = selectedRole?.color ?? DEFAULT_ROLE_COLOR;

  function handleRoleClick(r: (typeof ROLES)[number]) {
    setRole(r.key);
    setEmail(r.email);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token, user } = await login(email, password);
      saveSession(token, user);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="role-topbar" style={{ backgroundColor: roleColor }} />

        <h1>SecureExam</h1>
        <p className="muted">Sign in to continue</p>

        <div className="role-grid">
          {ROLES.map((r) => {
            const active = role === r.key;
            return (
              <button
                key={r.key}
                type="button"
                className={`role-btn${active ? " role-btn-active" : ""}`}
                style={
                  {
                    "--role-color": r.color,
                    backgroundColor: active ? r.color : "transparent",
                    color: active ? "#fff" : r.color,
                  } as CSSProperties
                }
                onClick={() => handleRoleClick(r)}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        {selectedRole && (
          <span className="role-badge" style={{ color: selectedRole.color }}>
            Logging in as: {selectedRole.label}
          </span>
        )}

        <label className="field">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="field">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            required
          />
        </label>

        <Message type="error" text={error} />

        <button
          type="submit"
          className="btn-primary"
          disabled={loading}
          style={selectedRole ? { backgroundColor: selectedRole.color, borderColor: selectedRole.color } : undefined}
        >
          {loading ? "Signing in…" : "Log In"}
        </button>
      </form>
    </div>
  );
}
