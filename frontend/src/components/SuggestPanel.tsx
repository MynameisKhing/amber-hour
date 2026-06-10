import { useRef, useState } from "react";

interface Pick {
  id: number;
  name: string;
  price: number;
  reason: string;
}

interface Props {
  token: string;
  onBalanceChange: (balance: number) => void;
}

export default function SuggestPanel({ token, onBalanceChange }: Props) {
  const [request, setRequest] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ response: string; picks: Pick[] } | null>(null);
  const [orderToast, setOrderToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const showToast = (msg: string) => {
    setOrderToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setOrderToast(""), 2200);
  };

  const ask = async () => {
    if (!request.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch("/api/ai/bartender", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "pick_for_me", mood: request.trim() }),
      });
      const data = await r.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  const order = async (itemId: number, itemName: string) => {
    const r = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: [{ menuItemId: itemId, qty: 1 }] }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      if (typeof data.balance === "number") onBalanceChange(data.balance);
      showToast(`Ordered ${itemName}! 🍸`);
    } else {
      showToast(data.error ?? "Order failed");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "0.5rem", position: "relative" }}>
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

      <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", padding: "0.25rem 0.25rem 0" }}>
        ✨ Read My Mind
      </div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.45 }}>
        Can't decide? Tell the bartender how you're feeling and get a personal recommendation.
      </div>

      <textarea
        ref={textareaRef}
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        placeholder={"e.g. Something strong after a rough day…\nor I want to try something new and fruity."}
        rows={3}
        style={{ fontSize: "0.78rem", resize: "none", padding: "0.4rem 0.5rem", borderRadius: 8 }}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
      />
      <button
        onClick={ask}
        disabled={loading || !request.trim()}
        style={{ fontSize: "0.78rem", padding: "0.35rem 0.5rem" }}
      >
        {loading ? "Thinking…" : "✨ Suggest something"}
      </button>

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", overflowY: "auto", flex: 1 }}>
          {result.response && (
            <div style={{
              fontSize: "0.78rem", color: "var(--amber-lt)", lineHeight: 1.5,
              fontStyle: "italic", padding: "0.25rem 0.4rem",
              borderLeft: "2px solid var(--amber)",
              background: "color-mix(in srgb, var(--amber) 6%, var(--surface))",
              borderRadius: "0 6px 6px 0",
            }}>
              {result.response}
            </div>
          )}
          {(result.picks ?? []).map((pick) => (
            <div key={pick.id} style={{
              background: "var(--surface2)", borderRadius: 8,
              padding: "0.5rem 0.6rem",
              border: "1px solid color-mix(in srgb, var(--amber) 28%, transparent)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text)" }}>{pick.name}</span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--amber-lt)" }}>฿{pick.price}</span>
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1.4, marginBottom: "0.35rem" }}>
                {pick.reason}
              </div>
              <button
                onClick={() => order(pick.id, pick.name)}
                style={{ width: "100%", fontSize: "0.68rem", padding: "0.25rem 0.4rem" }}
              >
                🛒 Order this
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
