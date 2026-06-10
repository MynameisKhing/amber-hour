import { useEffect, useState } from "react";
import type { Order } from "../types";

interface Props {
  token: string;
  userRole: string;
}

const statusLabel: Record<string, string> = {
  pending: "🟡 Pending",
  served:  "✅ Served",
  cancelled: "❌ Cancelled",
};

export default function TabPanel({ token, userRole }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    const url = userRole === "staff" ? "/api/orders" : "/api/orders/me";
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => { setOrders(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (orderId: number, status: string) => {
    await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const grouped = userRole === "staff"
    ? orders.reduce<Record<string, Order[]>>((acc, o) => {
        (acc[o.customerNick] ??= []).push(o);
        return acc;
      }, {})
    : null;

  if (loading) return <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", padding: "0.5rem" }}>Loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
          🧾 {userRole === "staff" ? "All Tabs" : "My Tab"}
        </span>
        <button onClick={load} style={{ fontSize: "0.65rem", padding: "0.15rem 0.4rem", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
          ↺
        </button>
      </div>

      {orders.length === 0 && (
        <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>No orders yet</div>
      )}

      {/* Customer view */}
      {userRole !== "staff" && orders.map((o) => (
        <div key={o.id} style={{ background: "var(--surface2)", borderRadius: 8, padding: "0.5rem 0.6rem", border: "1px solid var(--border)", fontSize: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
            <span style={{ color: "var(--text-muted)" }}>#{o.id}</span>
            <span>{statusLabel[o.status] ?? o.status}</span>
          </div>
          {o.items.map((it, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", color: "var(--text)" }}>
              <span>{it.name} ×{it.qty}</span>
              <span style={{ color: "var(--text-muted)" }}>฿{(it.price * it.qty).toFixed(0)}</span>
            </div>
          ))}
        </div>
      ))}

      {/* Staff view — grouped by customer */}
      {userRole === "staff" && grouped && Object.entries(grouped).map(([nick, nickOrders]) => (
        <div key={nick}>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--staff)", marginBottom: "0.2rem", padding: "0 0.1rem" }}>
            {nick}
          </div>
          {nickOrders.map((o) => (
            <div key={o.id} style={{ background: "var(--surface2)", borderRadius: 8, padding: "0.45rem 0.6rem", border: "1px solid var(--border)", marginBottom: "0.3rem", fontSize: "0.73rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                <span style={{ color: "var(--text-muted)" }}>#{o.id}</span>
                <span>{statusLabel[o.status] ?? o.status}</span>
              </div>
              {o.items.map((it, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{it.name} ×{it.qty}</span>
                  <span style={{ color: "var(--text-muted)" }}>฿{(it.price * it.qty).toFixed(0)}</span>
                </div>
              ))}
              {o.status === "pending" && (
                <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.4rem" }}>
                  <button onClick={() => updateStatus(o.id, "served")} style={{ flex: 1, fontSize: "0.65rem", padding: "0.2rem 0.3rem", background: "#2a8c4a", borderColor: "#2a8c4a", color: "#fff" }}>
                    ✅ Served
                  </button>
                  <button onClick={() => updateStatus(o.id, "cancelled")} style={{ flex: 1, fontSize: "0.65rem", padding: "0.2rem 0.3rem", background: "transparent", borderColor: "var(--danger)", color: "var(--danger)" }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
