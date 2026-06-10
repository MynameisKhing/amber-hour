import { useCallback, useEffect, useRef, useState } from "react";
import type { MenuItem, Role } from "../types";

interface Props {
  token: string;
  userRole: Role;
  onBalanceChange: (balance: number) => void;
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: "cocktail",    label: "🍸 Cocktail" },
  { key: "light",       label: "🧃 Light" },
  { key: "snack",       label: "🍟 Snack" },
];

function normCategory(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes("light") || c.includes("เบา")) return "light";
  if (c.includes("snack") || c.includes("ของ")) return "snack";
  return "cocktail";
}

export default function MenuPanel({ token, userRole, onBalanceChange }: Props) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [tab, setTab] = useState("cocktail");
  const [mood, setMood] = useState("");
  const [moodLoading, setMoodLoading] = useState(false);
  const [moodResponse, setMoodResponse] = useState("");
  const [orderToast, setOrderToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Staff add-item form
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ category: "cocktail", name: "", description: "", price: "" });

  const loadMenu = useCallback(() => {
    fetch("/api/menu", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setItems)
      .catch(() => {});
  }, [token]);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const showToast = (msg: string) => {
    setOrderToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setOrderToast(""), 2200);
  };

  const order = async (item: MenuItem) => {
    const r = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: [{ menuItemId: item.id, qty: 1 }] }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      if (typeof data.balance === "number") onBalanceChange(data.balance);
      showToast(`Ordered ${item.name}! 🍸`);
    } else {
      showToast(data.error ?? "Order failed");
    }
  };

  const addItem = async () => {
    if (!form.name.trim()) return;
    setAdding(true);
    try {
      const r = await fetch("/api/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          category: form.category,
          name: form.name.trim(),
          description: form.description.trim(),
          price: parseFloat(form.price) || 0,
        }),
      });
      if (r.ok) {
        setForm({ category: form.category, name: "", description: "", price: "" });
        setShowAdd(false);
        setTab(form.category);
        loadMenu();
        showToast("Menu item added ✓");
      } else {
        const d = await r.json().catch(() => ({}));
        showToast(d.error ?? "Add failed");
      }
    } finally {
      setAdding(false);
    }
  };

  const recommend = async () => {
    if (!mood.trim()) return;
    setMoodLoading(true);
    setMoodResponse("");
    try {
      const r = await fetch("/api/ai/bartender", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "recommend", mood: mood.trim() }),
      });
      const data = await r.json();
      setMoodResponse(data.response ?? data.error);
    } finally {
      setMoodLoading(false);
    }
  };

  const filtered = items.filter((it) => normCategory(it.category) === tab);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "0.4rem", position: "relative" }}>
      {/* Toast */}
      {orderToast && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
          background: "var(--amber)", color: "#fff",
          fontSize: "0.75rem", fontWeight: 700, padding: "0.35rem 0.6rem",
          borderRadius: 6, textAlign: "center",
        }}>
          {orderToast}
        </div>
      )}

      {/* Category tabs */}
      <div style={{ display: "flex", gap: "0.25rem", flexShrink: 0 }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setTab(c.key)}
            style={{
              flex: 1, fontSize: "0.62rem", padding: "0.25rem 0.1rem",
              background: tab === c.key ? "var(--amber)" : "transparent",
              color: tab === c.key ? "#fff" : "var(--text-muted)",
              border: `1px solid ${tab === c.key ? "var(--amber)" : "var(--border)"}`,
              borderRadius: 6, fontWeight: tab === c.key ? 700 : 400,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Staff: add menu item */}
      {userRole === "staff" && (
        <div style={{ flexShrink: 0 }}>
          {!showAdd ? (
            <button
              onClick={() => setShowAdd(true)}
              style={{ width: "100%", fontSize: "0.68rem", padding: "0.3rem", background: "transparent", color: "var(--amber-lt)", border: "1px dashed var(--border)" }}
            >
              ➕ Add menu item
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", padding: "0.5rem", background: "var(--surface2)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                style={{ fontSize: "0.72rem", padding: "0.3rem" }}
              >
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Name"
                style={{ fontSize: "0.72rem", padding: "0.3rem 0.5rem" }}
              />
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Description"
                style={{ fontSize: "0.72rem", padding: "0.3rem 0.5rem" }}
              />
              <input
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value.replace(/[^0-9.]/g, "") }))}
                placeholder="Price (฿)"
                inputMode="decimal"
                style={{ fontSize: "0.72rem", padding: "0.3rem 0.5rem" }}
              />
              <div style={{ display: "flex", gap: "0.3rem" }}>
                <button
                  onClick={addItem}
                  disabled={adding || !form.name.trim()}
                  style={{ flex: 1, fontSize: "0.7rem", padding: "0.3rem" }}
                >
                  {adding ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  className="ghost"
                  style={{ fontSize: "0.7rem", padding: "0.3rem 0.6rem" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Items */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
        {filtered.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>No items</div>
        )}
        {filtered.map((item) => (
          <div key={item.id} style={{
            background: "var(--surface2)", borderRadius: 8,
            padding: "0.5rem 0.6rem",
            border: "1px solid var(--border)",
            opacity: item.isAvailable ? 1 : 0.5,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.15rem" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text)" }}>{item.name}</span>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--amber-lt)" }}>฿{item.price}</span>
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.4rem", lineHeight: 1.4 }}>
              {item.description}
            </div>
            {!item.isAvailable && (
              <div style={{ fontSize: "0.65rem", color: "var(--danger)", marginBottom: "0.3rem" }}>Sold out</div>
            )}
            {item.isAvailable && (
              <button
                onClick={() => order(item)}
                style={{ width: "100%", fontSize: "0.62rem", padding: "0.2rem 0.25rem" }}
              >
                🛒 Order
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Mood input */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.5rem", flexShrink: 0 }}>
        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
          🎯 Tell your mood, let the bartender recommend
        </div>
        <div style={{ display: "flex", gap: "0.3rem" }}>
          <input
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            placeholder="Tired, happy, stressed..."
            style={{ flex: 1, fontSize: "0.72rem", padding: "0.3rem 0.5rem" }}
            onKeyDown={(e) => { if (e.key === "Enter") recommend(); }}
          />
          <button
            onClick={recommend}
            disabled={moodLoading || !mood.trim()}
            style={{ fontSize: "0.7rem", padding: "0.3rem 0.5rem", flexShrink: 0 }}
          >
            {moodLoading ? "..." : "🎯"}
          </button>
        </div>
        {moodResponse && (
          <div style={{
            marginTop: "0.4rem", fontSize: "0.72rem", lineHeight: 1.5,
            color: "var(--amber-lt)",
            background: "color-mix(in srgb, var(--amber) 8%, var(--surface))",
            borderRadius: 6, padding: "0.5rem 0.6rem",
            borderLeft: "2px solid var(--amber)",
          }}>
            {moodResponse}
          </div>
        )}
      </div>
    </div>
  );
}
