import { useState, useEffect } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const API = import.meta.env.VITE_API_URL || "http://20.118.151.120:8000";

const LOAD_COLOR = (atl) => {
  if (atl < 30) return "#22d3ee";
  if (atl < 60) return "#a3e635";
  if (atl < 90) return "#fb923c";
  return "#f43f5e";
};

const REPLICA_COLORS = ["#22d3ee", "#a3e635", "#fb923c", "#f43f5e"];

export default function App() {
  const [status, setStatus] = useState(null);
  const [weekly, setWeekly] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [form, setForm] = useState({ date: "", type: "run", duration_min: 45, intensity: 7, notes: "" });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  const fetchAll = async () => {
    try {
      const [s, w, wo] = await Promise.all([
        fetch(`${API}/metrics/platform-status`).then(r => r.json()),
        fetch(`${API}/metrics/weekly-summary`).then(r => r.json()),
        fetch(`${API}/workouts`).then(r => r.json()),
      ]);
      setStatus(s);
      setWeekly(w.weeks);
      setWorkouts(wo.workouts.slice(-14).reverse());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const submitWorkout = async () => {
    await fetch(`${API}/workouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        duration_min: Number(form.duration_min),
        intensity: Number(form.intensity)
      }),
    });
    fetchAll();
    setForm({ date: "", type: "run", duration_min: 45, intensity: 7, notes: "" });
  };

  if (loading) return (
    <div style={s.loader}>
      <div style={{ fontSize: 48, color: "#22d3ee", animation: "pulse 1.5s infinite" }}>⬡</div>
      <p style={{ color: "#64748b", fontFamily: "monospace", marginTop: 16 }}>initializing fitops platform...</p>
    </div>
  );

  const atl = status?.training_load ?? 0;
  const color = LOAD_COLOR(atl);

  return (
    <div style={s.root}>
      {/* Header */}
      <header style={s.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 36, color }}>⬡</span>
          <div>
            <h1 style={{ ...s.title, fontFamily: "DM Mono, monospace" }}>FitOps</h1>
            <p style={s.subtitle}>Azure Enterprise Platform · Self-Scaling Infrastructure</p>
          </div>
        </div>
        <div style={s.badge(status?.status === "warning")}>
          <span style={s.dot(status?.status === "warning")} />
          {status?.status === "warning" ? "OVERREACH ALERT" : "PLATFORM HEALTHY"}
        </div>
      </header>

      {/* Nav */}
      <nav style={s.nav}>
        {["dashboard", "workouts", "log"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={s.navBtn(activeTab === tab, color)}>
            {tab.toUpperCase()}
          </button>
        ))}
      </nav>

      {/* Dashboard */}
      {activeTab === "dashboard" && (
        <main style={s.main}>
          <div style={s.kpiRow}>
            <KPI label="Training Load (ATL)" value={atl.toFixed(1)} color={color} unit="pts" />
            <KPI label="AKS Replicas" value={status?.current_replicas} color={color} unit="pods" />
            <KPI label="Total Workouts" value={status?.total_workouts} color={color} unit="sessions" />
            <KPI label="Scale Decision"
              value={status?.current_replicas === 1 ? "DOWN" : status?.current_replicas >= 3 ? "UP" : "HOLD"}
              color={color} unit="" />
          </div>

          <div style={s.banner(color)}>
            <span style={{ opacity: 0.5, marginRight: 12 }}>›</span>
            {status?.scale_reason}
          </div>

          <div style={s.chartGrid}>
            <ChartCard title="Training Load by Week">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={weekly}>
                  <XAxis dataKey="week" stroke="#334155" tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "monospace" }} />
                  <YAxis stroke="#334155" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip contentStyle={s.tooltip} />
                  <Line type="monotone" dataKey="training_load" stroke={color} strokeWidth={2} dot={{ fill: color, r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Recommended Replicas by Week">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weekly}>
                  <XAxis dataKey="week" stroke="#334155" tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "monospace" }} />
                  <YAxis domain={[0, 4]} ticks={[1,2,3,4]} stroke="#334155" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip contentStyle={s.tooltip} />
                  <Bar dataKey="recommended_replicas" radius={[4,4,0,0]}>
                    {weekly.map((entry, i) => (
                      <Cell key={i} fill={REPLICA_COLORS[Math.min(entry.recommended_replicas - 1, 3)]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Weekly Volume (minutes)">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weekly}>
                  <XAxis dataKey="week" stroke="#334155" tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "monospace" }} />
                  <YAxis stroke="#334155" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip contentStyle={s.tooltip} />
                  <Bar dataKey="total_minutes" fill={color} radius={[4,4,0,0]} opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Avg Intensity by Week">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={weekly}>
                  <XAxis dataKey="week" stroke="#334155" tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "monospace" }} />
                  <YAxis domain={[0,10]} stroke="#334155" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip contentStyle={s.tooltip} />
                  <Line type="monotone" dataKey="avg_intensity" stroke="#818cf8" strokeWidth={2} dot={{ fill: "#818cf8", r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Scale Logic Table */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>Scale Logic</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { range: "ATL < 30",  label: "Rest week",     replicas: 1, threshold: 0  },
                { range: "ATL 30–60", label: "Base training", replicas: 2, threshold: 30 },
                { range: "ATL 60–90", label: "Peak week",     replicas: 3, threshold: 60 },
                { range: "ATL > 90",  label: "Overreach",     replicas: 4, threshold: 90 },
              ].map(row => {
                const rowColor = LOAD_COLOR(row.threshold + 1);
                const active = status?.current_replicas === row.replicas;
                return (
                  <div key={row.range} style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                    padding: "10px 16px", borderRadius: 6,
                    border: `1px solid ${active ? rowColor + "44" : "#0f172a"}`,
                    background: active ? `${rowColor}08` : "transparent",
                  }}>
                    <span style={{ color: rowColor, fontFamily: "monospace", fontSize: 13 }}>{row.range}</span>
                    <span style={{ color: "#94a3b8", fontSize: 13 }}>{row.label}</span>
                    <span style={{ color: rowColor, fontFamily: "monospace" }}>{row.replicas} pod{row.replicas > 1 ? "s" : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      )}

      {/* Workouts Tab */}
      {activeTab === "workouts" && (
        <main style={s.main}>
          <div style={s.card}>
            <h3 style={s.cardTitle}>Recent Sessions</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {workouts.map(w => (
                <div key={w.id} style={{
                  display: "grid", gridTemplateColumns: "70px 120px 80px 1fr 70px",
                  alignItems: "center", gap: 16,
                  padding: "10px 16px", borderRadius: 6,
                  border: "1px solid #0f172a", background: "#060912"
                }}>
                  <span style={{
                    fontSize: 11, fontFamily: "monospace", letterSpacing: "0.05em",
                    color: w.type === "rest" ? "#475569" : w.type === "run" ? "#a3e635" : w.type === "lift" ? "#818cf8" : "#fb923c"
                  }}>{w.type.toUpperCase()}</span>
                  <span style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: 13 }}>{w.date}</span>
                  <span style={{ color: "#e2e8f0", fontSize: 13 }}>{w.duration_min} min</span>
                  <div style={{ height: 4, background: "#0f172a", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, width: `${w.intensity * 10}%`, background: LOAD_COLOR(w.intensity * 10) }} />
                  </div>
                  <span style={{ color: "#64748b", fontFamily: "monospace", fontSize: 12 }}>RPE {w.intensity}</span>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* Log Tab */}
      {activeTab === "log" && (
        <main style={s.main}>
          <div style={s.card}>
            <h3 style={s.cardTitle}>Log Workout</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              {[
                { label: "Date", key: "date", type: "date" },
                { label: "Type", key: "type", type: "select", options: ["run","lift","cycle","rest"] },
                { label: "Duration (min)", key: "duration_min", type: "number" },
                { label: "Intensity (RPE 1–10)", key: "intensity", type: "number" },
              ].map(field => (
                <label key={field.key} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#475569", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {field.label}
                  {field.type === "select"
                    ? <select style={s.input} value={form[field.key]} onChange={e => setForm({ ...form, [field.key]: e.target.value })}>
                        {field.options.map(o => <option key={o}>{o}</option>)}
                      </select>
                    : <input style={s.input} type={field.type} value={form[field.key]}
                        onChange={e => setForm({ ...form, [field.key]: e.target.value })} />
                  }
                </label>
              ))}
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#475569", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", gridColumn: "1 / -1" }}>
                Notes
                <input style={s.input} type="text" placeholder="Optional..."
                  value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </label>
            </div>
            <button onClick={submitWorkout} style={{
              background: `${color}18`, border: `1px solid ${color}`, color,
              padding: "12px 32px", borderRadius: 4, cursor: "pointer",
              fontFamily: "monospace", fontSize: 12, letterSpacing: "0.1em", width: "100%"
            }}>
              LOG SESSION →
            </button>
          </div>
        </main>
      )}
    </div>
  );
}

function KPI({ label, value, color, unit }) {
  return (
    <div style={s.card}>
      <p style={{ margin: "0 0 8px", fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "monospace" }}>{label}</p>
      <p style={{ margin: 0, fontSize: 32, fontWeight: 700, fontFamily: "monospace", color, lineHeight: 1 }}>
        {value}<span style={{ fontSize: 13, marginLeft: 6, opacity: 0.6 }}>{unit}</span>
      </p>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div style={s.card}>
      <h3 style={s.cardTitle}>{title}</h3>
      {children}
    </div>
  );
}

const s = {
  root: { minHeight: "100vh", background: "#060912", color: "#e2e8f0", fontFamily: "DM Sans, sans-serif" },
  loader: { minHeight: "100vh", background: "#060912", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 32px", borderBottom: "1px solid #0f172a" },
  title: { margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" },
  subtitle: { margin: "2px 0 0", fontSize: 12, color: "#475569", letterSpacing: "0.05em" },
  badge: (warn) => ({ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 4, border: `1px solid ${warn ? "#f43f5e44" : "#22d3ee44"}`, background: warn ? "#f43f5e0a" : "#22d3ee0a", fontSize: 11, fontFamily: "monospace", color: warn ? "#f43f5e" : "#22d3ee", letterSpacing: "0.1em" }),
  dot: (warn) => ({ width: 6, height: 6, borderRadius: "50%", background: warn ? "#f43f5e" : "#22d3ee", boxShadow: `0 0 8px ${warn ? "#f43f5e" : "#22d3ee"}` }),
  nav: { display: "flex", gap: 4, padding: "12px 32px", borderBottom: "1px solid #0f172a" },
  navBtn: (active, color) => ({ background: active ? `${color}18` : "transparent", border: `1px solid ${active ? color : "#1e293b"}`, color: active ? color : "#475569", padding: "6px 20px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "monospace", letterSpacing: "0.1em" }),
  main: { padding: "32px", maxWidth: 1200, margin: "0 auto" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 },
  banner: (color) => ({ padding: "12px 20px", borderRadius: 6, border: `1px solid ${color}22`, background: `${color}08`, color: "#94a3b8", fontSize: 13, marginBottom: 24, fontFamily: "monospace" }),
  chartGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 },
  card: { background: "#0a0f1e", border: "1px solid #0f172a", borderRadius: 8, padding: "24px" },
  cardTitle: { margin: "0 0 20px", fontSize: 12, color: "#475569", textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "monospace" },
  tooltip: { background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 4, fontFamily: "monospace", fontSize: 12 },
  input: { background: "#060912", border: "1px solid #1e293b", borderRadius: 4, padding: "8px 12px", color: "#e2e8f0", fontFamily: "monospace", fontSize: 14, outline: "none" },
};