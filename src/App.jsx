import { useState, useEffect, useRef } from "react";

const CATEGORIES = {
  school: { label: "School", color: "#E63946", icon: "📚" },
  build: { label: "Build", color: "#457B9D", icon: "🔧" },
  body: { label: "Body", color: "#2A9D8F", icon: "💪" },
  home: { label: "Home", color: "#E9C46A", icon: "🏠" },
  write: { label: "Write", color: "#9B5DE5", icon: "✍️" },
};

const ENTROPY_LEVELS = {
  fresh: { label: "Fresh", color: "#2A9D8F", max: 1 },
  warming: { label: "Warming", color: "#E9C46A", max: 3 },
  decaying: { label: "Decaying", color: "#F4845F", max: 5 },
  critical: { label: "Critical", color: "#E63946", max: Infinity },
};

function getEntropyLevel(task) {
  if (task.completed) return null;
  const created = new Date(task.createdAt);
  const now = new Date();
  const daysOld = Math.floor((now - created) / (1000 * 60 * 60 * 24));
  const deadline = task.deadline ? new Date(task.deadline) : null;
  const daysToDeadline = deadline
    ? Math.floor((deadline - now) / (1000 * 60 * 60 * 24))
    : null;

  if (daysToDeadline !== null && daysToDeadline <= 1) return "critical";
  if (daysToDeadline !== null && daysToDeadline <= 3) return "decaying";
  if (daysOld >= 5) return "decaying";
  if (daysOld >= 2) return "warming";
  return "fresh";
}

function getEntropyScore(tasks) {
  let score = 0;
  tasks
    .filter((t) => !t.completed)
    .forEach((t) => {
      const level = getEntropyLevel(t);
      if (level === "critical") score += 4;
      else if (level === "decaying") score += 2;
      else if (level === "warming") score += 1;
    });
  return score;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function getWeekDates() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

function getDayLabel(date) {
  return date.toLocaleDateString("en-GB", { weekday: "short" });
}

function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

const STORAGE_KEY = "entropy-exec-v2";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}



const DEFAULT_STATE = {
  tasks: [],
  blackSwanActive: false,
  blackSwanDate: null,
  weekNotes: "",
  dailyCheckins: {},
};

// Time block templates
const TIME_BLOCKS = [
  { label: "6–7 AM", slot: "06" },
  { label: "7–8 AM", slot: "07" },
  { label: "8–9 AM", slot: "08" },
  { label: "9–10 AM", slot: "09" },
  { label: "10–11 AM", slot: "10" },
  { label: "11–12 PM", slot: "11" },
  { label: "12–1 PM", slot: "12" },
  { label: "1–2 PM", slot: "13" },
  { label: "2–3 PM", slot: "14" },
  { label: "3–4 PM", slot: "15" },
  { label: "4–5 PM", slot: "16" },
  { label: "5–6 PM", slot: "17" },
  { label: "6–7 PM", slot: "18" },
  { label: "7–8 PM", slot: "19" },
  { label: "8–9 PM", slot: "20" },
  { label: "9–10 PM", slot: "21" },
];

export default function EntropyTracker() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("dashboard"); // dashboard, capture, weekly, daily, blocks
  const [captureForm, setCaptureForm] = useState({
    title: "",
    category: "school",
    deadline: "",
    completionCriteria: "",
    activatesNext: "",
    timeEstimate: 30,
    scheduledDate: "",
    scheduledSlot: "",
  });
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [expandedTask, setExpandedTask] = useState(null);
  const [editingBlockTask, setEditingBlockTask] = useState(null);
  const inputRef = useRef(null);

  // Load from localStorage on mount
  useEffect(() => {
    const local = loadState();
    if (local) setState(local);
    setLoaded(true);
  }, []);

  // Save on every state change
  useEffect(() => {
    if (!loaded) return;
    saveState(state);
  }, [state, loaded]);

  // Auto-deactivate black swan after 24h
  useEffect(() => {
    if (state.blackSwanActive && state.blackSwanDate) {
      const activated = new Date(state.blackSwanDate);
      const now = new Date();
      if (now - activated > 24 * 60 * 60 * 1000) {
        setState((s) => ({ ...s, blackSwanActive: false, blackSwanDate: null }));
      }
    }
  }, [state.blackSwanActive, state.blackSwanDate]);

  const activeTasks = state.tasks.filter((t) => !t.completed);
  const completedTasks = state.tasks.filter((t) => t.completed);
  const entropyScore = getEntropyScore(state.tasks);
  const weekDates = getWeekDates();
  const today = new Date();

  function addTask() {
    if (!captureForm.title.trim()) return;
    const newTask = {
      id: Date.now().toString(),
      title: captureForm.title.trim(),
      category: captureForm.category,
      deadline: captureForm.deadline || null,
      completionCriteria: captureForm.completionCriteria.trim() || null,
      activatesNext: captureForm.activatesNext.trim() || null,
      timeEstimate: captureForm.timeEstimate,
      scheduledDate: captureForm.scheduledDate || null,
      scheduledSlot: captureForm.scheduledSlot || null,
      createdAt: new Date().toISOString(),
      completed: false,
      completedAt: null,
    };
    setState((s) => ({ ...s, tasks: [newTask, ...s.tasks] }));
    setCaptureForm({
      title: "",
      category: "school",
      deadline: "",
      completionCriteria: "",
      activatesNext: "",
      timeEstimate: 30,
      scheduledDate: "",
      scheduledSlot: "",
    });
    if (inputRef.current) inputRef.current.focus();
  }

  function toggleComplete(taskId) {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : null }
          : t
      ),
    }));
  }

  function deleteTask(taskId) {
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== taskId) }));
  }

  function toggleBlackSwan() {
    setState((s) => ({
      ...s,
      blackSwanActive: !s.blackSwanActive,
      blackSwanDate: !s.blackSwanActive ? new Date().toISOString() : null,
    }));
  }

  function assignToBlock(taskId, date, slot) {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, scheduledDate: date, scheduledSlot: slot }
          : t
      ),
    }));
    setEditingBlockTask(null);
  }

  function getTasksForDaySlot(dateStr, slot) {
    return state.tasks.filter(
      (t) => t.scheduledDate === dateStr && t.scheduledSlot === slot && !t.completed
    );
  }

  function getTasksForDay(dateStr) {
    return state.tasks.filter(
      (t) =>
        (t.scheduledDate === dateStr ||
          (t.deadline && t.deadline === dateStr)) &&
        !t.completed
    );
  }

  const entropyColor =
    entropyScore > 15
      ? "#E63946"
      : entropyScore > 8
      ? "#F4845F"
      : entropyScore > 3
      ? "#E9C46A"
      : "#2A9D8F";

  const styles = {
    app: {
      minHeight: "100vh",
      background: "#0a0a0b",
      color: "#e0e0e0",
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      fontSize: 13,
      maxWidth: 480,
      margin: "0 auto",
      position: "relative",
      overflow: "hidden",
    },
    header: {
      padding: "20px 16px 12px",
      borderBottom: "1px solid #1a1a1e",
    },
    title: {
      fontSize: 14,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "#fff",
      margin: 0,
    },
    subtitle: {
      fontSize: 10,
      color: "#666",
      marginTop: 4,
      letterSpacing: "0.15em",
      textTransform: "uppercase",
    },
    entropyBar: {
      marginTop: 12,
      padding: "10px 12px",
      background: "#111114",
      borderRadius: 6,
      border: `1px solid ${entropyColor}22`,
    },
    entropyLabel: {
      fontSize: 9,
      color: "#666",
      textTransform: "uppercase",
      letterSpacing: "0.15em",
    },
    entropyValue: {
      fontSize: 28,
      fontWeight: 800,
      color: entropyColor,
      lineHeight: 1,
      marginTop: 4,
    },
    entropyMeter: {
      marginTop: 8,
      height: 3,
      background: "#1a1a1e",
      borderRadius: 2,
      overflow: "hidden",
    },
    entropyFill: {
      height: "100%",
      width: `${Math.min(entropyScore * 4, 100)}%`,
      background: entropyColor,
      borderRadius: 2,
      transition: "width 0.5s ease, background 0.5s ease",
    },
    nav: {
      display: "flex",
      gap: 0,
      borderBottom: "1px solid #1a1a1e",
      background: "#0d0d0f",
    },
    navBtn: (active) => ({
      flex: 1,
      padding: "10px 4px",
      background: "none",
      border: "none",
      borderBottom: active ? "2px solid #fff" : "2px solid transparent",
      color: active ? "#fff" : "#555",
      fontSize: 10,
      fontFamily: "inherit",
      cursor: "pointer",
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      fontWeight: active ? 700 : 400,
      transition: "all 0.2s",
    }),
    blackSwanBtn: {
      position: "fixed",
      bottom: 16,
      right: 16,
      width: 52,
      height: 52,
      borderRadius: "50%",
      background: state.blackSwanActive ? "#E63946" : "#1a1a1e",
      border: state.blackSwanActive ? "2px solid #E63946" : "2px solid #333",
      color: "#fff",
      fontSize: 22,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 100,
      boxShadow: state.blackSwanActive
        ? "0 0 20px #E6394644"
        : "0 4px 12px #00000066",
      transition: "all 0.3s",
    },
    section: {
      padding: "16px",
    },
    card: {
      background: "#111114",
      borderRadius: 8,
      padding: "12px",
      marginBottom: 8,
      border: "1px solid #1a1a1e",
      transition: "border-color 0.2s",
    },
    input: {
      width: "100%",
      padding: "10px 12px",
      background: "#111114",
      border: "1px solid #222",
      borderRadius: 6,
      color: "#e0e0e0",
      fontSize: 13,
      fontFamily: "inherit",
      outline: "none",
      boxSizing: "border-box",
    },
    textarea: {
      width: "100%",
      padding: "10px 12px",
      background: "#111114",
      border: "1px solid #222",
      borderRadius: 6,
      color: "#e0e0e0",
      fontSize: 12,
      fontFamily: "inherit",
      outline: "none",
      resize: "vertical",
      minHeight: 60,
      boxSizing: "border-box",
    },
    label: {
      fontSize: 9,
      color: "#666",
      textTransform: "uppercase",
      letterSpacing: "0.15em",
      marginBottom: 4,
      display: "block",
    },
    primaryBtn: {
      width: "100%",
      padding: "12px",
      background: "#fff",
      color: "#000",
      border: "none",
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 700,
      fontFamily: "inherit",
      cursor: "pointer",
      textTransform: "uppercase",
      letterSpacing: "0.1em",
    },
    categoryPill: (cat, active) => ({
      padding: "6px 12px",
      borderRadius: 20,
      border: `1px solid ${active ? CATEGORIES[cat].color : "#333"}`,
      background: active ? CATEGORIES[cat].color + "22" : "transparent",
      color: active ? CATEGORIES[cat].color : "#555",
      fontSize: 10,
      fontFamily: "inherit",
      cursor: "pointer",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      fontWeight: active ? 600 : 400,
    }),
    tag: (color) => ({
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 3,
      background: color + "18",
      color: color,
      fontSize: 9,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
    }),
  };

  // === VIEWS ===

  function renderDashboard() {
    const criticalTasks = activeTasks.filter(
      (t) => getEntropyLevel(t) === "critical"
    );
    const decayingTasks = activeTasks.filter(
      (t) => getEntropyLevel(t) === "decaying"
    );
    const todayStr = today.toISOString().split("T")[0];
    const todayTasks = getTasksForDay(todayStr);

    const categoryBreakdown = Object.keys(CATEGORIES).map((cat) => ({
      cat,
      count: activeTasks.filter((t) => t.category === cat).length,
    }));

    return (
      <div style={styles.section}>
        {state.blackSwanActive && (
          <div
            style={{
              padding: "12px",
              background: "#E6394618",
              border: "1px solid #E6394644",
              borderRadius: 8,
              marginBottom: 12,
              fontSize: 11,
            }}
          >
            <div style={{ fontWeight: 700, color: "#E63946", marginBottom: 4 }}>
              ⚡ BLACK SWAN ACTIVE
            </div>
            <div style={{ color: "#999" }}>
              Only critical/deadline tasks visible. Everything else is paused.
              Breathe. Handle what's real.
            </div>
          </div>
        )}

        {/* Today's Focus */}
        <div style={{ marginBottom: 16 }}>
          <div style={styles.label}>Today's Focus</div>
          {todayTasks.length === 0 ? (
            <div
              style={{
                ...styles.card,
                color: "#555",
                fontSize: 11,
                textAlign: "center",
                padding: 20,
              }}
            >
              No tasks scheduled for today. Capture or assign tasks →
            </div>
          ) : (
            todayTasks
              .filter(
                (t) =>
                  !state.blackSwanActive ||
                  getEntropyLevel(t) === "critical" ||
                  getEntropyLevel(t) === "decaying"
              )
              .map((t) => renderTaskCard(t))
          )}
        </div>

        {/* Critical alerts */}
        {criticalTasks.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...styles.label, color: "#E63946" }}>
              🔥 Critical — Act Now
            </div>
            {criticalTasks.map((t) => renderTaskCard(t))}
          </div>
        )}

        {decayingTasks.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...styles.label, color: "#F4845F" }}>
              ⚠ Decaying — Entropy Rising
            </div>
            {decayingTasks.map((t) => renderTaskCard(t))}
          </div>
        )}

        {/* Category breakdown */}
        <div style={{ marginBottom: 16 }}>
          <div style={styles.label}>Open by Category</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {categoryBreakdown.map(({ cat, count }) => (
              <div
                key={cat}
                style={{
                  ...styles.card,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  marginBottom: 0,
                  minWidth: 80,
                }}
              >
                <span>{CATEGORIES[cat].icon}</span>
                <span style={{ color: CATEGORIES[cat].color, fontWeight: 700 }}>
                  {count}
                </span>
                <span style={{ color: "#555", fontSize: 10 }}>
                  {CATEGORIES[cat].label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Completed recently */}
        {completedTasks.length > 0 && (
          <div>
            <div style={styles.label}>
              ✓ Completed ({completedTasks.length})
            </div>
            {completedTasks.slice(0, 3).map((t) => (
              <div
                key={t.id}
                style={{
                  ...styles.card,
                  opacity: 0.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{ cursor: "pointer" }}
                  onClick={() => toggleComplete(t.id)}
                >
                  ✓
                </span>
                <span style={{ textDecoration: "line-through", flex: 1, fontSize: 12 }}>
                  {t.title}
                </span>
                {t.activatesNext && (
                  <span style={{ ...styles.tag("#9B5DE5"), fontSize: 8 }}>
                    → {t.activatesNext}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderTaskCard(t) {
    const level = getEntropyLevel(t);
    const levelInfo = level ? ENTROPY_LEVELS[level] : null;
    const isExpanded = expandedTask === t.id;

    return (
      <div
        key={t.id}
        style={{
          ...styles.card,
          borderColor: levelInfo ? levelInfo.color + "44" : "#1a1a1e",
          cursor: "pointer",
        }}
        onClick={() => setExpandedTask(isExpanded ? null : t.id)}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              border: `2px solid ${CATEGORIES[t.category]?.color || "#555"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              cursor: "pointer",
              flexShrink: 0,
              marginTop: 1,
              background: t.completed ? CATEGORIES[t.category]?.color + "44" : "transparent",
            }}
            onClick={(e) => {
              e.stopPropagation();
              toggleComplete(t.id);
            }}
          >
            {t.completed && "✓"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#e0e0e0",
                lineHeight: 1.4,
              }}
            >
              {t.title}
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                marginTop: 6,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span style={styles.tag(CATEGORIES[t.category]?.color || "#555")}>
                {CATEGORIES[t.category]?.label || t.category}
              </span>
              {levelInfo && (
                <span style={styles.tag(levelInfo.color)}>{levelInfo.label}</span>
              )}
              {t.deadline && (
                <span style={{ fontSize: 10, color: "#666" }}>
                  Due {formatDate(t.deadline)}
                </span>
              )}
              {t.timeEstimate && (
                <span style={{ fontSize: 10, color: "#444" }}>
                  {t.timeEstimate}m
                </span>
              )}
            </div>
          </div>
        </div>

        {isExpanded && (
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid #1a1a1e",
              fontSize: 11,
            }}
          >
            {t.completionCriteria && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: "#666" }}>Done when: </span>
                <span style={{ color: "#aaa" }}>{t.completionCriteria}</span>
              </div>
            )}
            {t.activatesNext && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: "#666" }}>Activates → </span>
                <span style={{ color: "#9B5DE5" }}>{t.activatesNext}</span>
              </div>
            )}
            {t.scheduledDate && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: "#666" }}>Scheduled: </span>
                <span style={{ color: "#aaa" }}>
                  {formatDate(t.scheduledDate)}
                  {t.scheduledSlot &&
                    ` @ ${TIME_BLOCKS.find((b) => b.slot === t.scheduledSlot)?.label || t.scheduledSlot}`}
                </span>
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button
                style={{
                  padding: "6px 12px",
                  background: "#1a1a1e",
                  border: "1px solid #333",
                  borderRadius: 4,
                  color: "#999",
                  fontSize: 10,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setView("blocks");
                  setEditingBlockTask(t.id);
                }}
              >
                Schedule
              </button>
              <button
                style={{
                  padding: "6px 12px",
                  background: "#E6394618",
                  border: "1px solid #E6394644",
                  borderRadius: 4,
                  color: "#E63946",
                  fontSize: 10,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteTask(t.id);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderCapture() {
    return (
      <div style={styles.section}>
        <div style={{ ...styles.label, marginBottom: 12 }}>
          Capture — Close the Loop
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={styles.label}>What needs doing?</div>
          <input
            ref={inputRef}
            style={styles.input}
            value={captureForm.title}
            onChange={(e) =>
              setCaptureForm((f) => ({ ...f, title: e.target.value }))
            }
            placeholder="Be specific. Not 'work on project' but 'write 3 user stories for onboarding'"
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={styles.label}>Category</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.keys(CATEGORIES).map((cat) => (
              <button
                key={cat}
                style={styles.categoryPill(cat, captureForm.category === cat)}
                onClick={() =>
                  setCaptureForm((f) => ({ ...f, category: cat }))
                }
              >
                {CATEGORIES[cat].icon} {CATEGORIES[cat].label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <div style={styles.label}>Deadline</div>
            <input
              type="date"
              style={{ ...styles.input, fontSize: 11 }}
              value={captureForm.deadline}
              onChange={(e) =>
                setCaptureForm((f) => ({ ...f, deadline: e.target.value }))
              }
            />
          </div>
          <div>
            <div style={styles.label}>Time Estimate (min)</div>
            <input
              type="number"
              style={styles.input}
              value={captureForm.timeEstimate}
              onChange={(e) =>
                setCaptureForm((f) => ({
                  ...f,
                  timeEstimate: parseInt(e.target.value) || 0,
                }))
              }
            />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={styles.label}>Done when? (completion criteria)</div>
          <textarea
            style={styles.textarea}
            value={captureForm.completionCriteria}
            onChange={(e) =>
              setCaptureForm((f) => ({
                ...f,
                completionCriteria: e.target.value,
              }))
            }
            placeholder="What does 'finished' look like? Be concrete."
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={styles.label}>Activates next →</div>
          <input
            style={styles.input}
            value={captureForm.activatesNext}
            onChange={(e) =>
              setCaptureForm((f) => ({ ...f, activatesNext: e.target.value }))
            }
            placeholder="What does completing this unlock?"
          />
        </div>

        <button style={styles.primaryBtn} onClick={addTask}>
          Capture Task
        </button>

        {/* Quick capture history */}
        {state.tasks.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={styles.label}>Recently Captured</div>
            {state.tasks.slice(0, 5).map((t) => (
              <div
                key={t.id}
                style={{
                  ...styles.card,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                }}
              >
                <span style={{ fontSize: 10 }}>
                  {CATEGORIES[t.category]?.icon}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 11,
                    color: t.completed ? "#555" : "#ccc",
                    textDecoration: t.completed ? "line-through" : "none",
                  }}
                >
                  {t.title}
                </span>
                <span style={styles.tag(getEntropyLevel(t) ? ENTROPY_LEVELS[getEntropyLevel(t)].color : "#555")}>
                  {getEntropyLevel(t) ? ENTROPY_LEVELS[getEntropyLevel(t)].label : "Done"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderBlocks() {
    const dayStr = selectedDay.toISOString().split("T")[0];
    const isToday = isSameDay(selectedDay, today);
    const unscheduledTasks = activeTasks.filter((t) => !t.scheduledDate);

    return (
      <div style={styles.section}>
        {/* Day selector */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, overflowX: "auto" }}>
          {weekDates.map((d) => {
            const isSelected = isSameDay(d, selectedDay);
            const isTodayDate = isSameDay(d, today);
            const dayTasks = getTasksForDay(d.toISOString().split("T")[0]);
            return (
              <button
                key={d.toISOString()}
                style={{
                  flex: "0 0 auto",
                  padding: "8px 10px",
                  background: isSelected ? "#fff" : "#111114",
                  color: isSelected ? "#000" : isTodayDate ? "#fff" : "#666",
                  border: isTodayDate && !isSelected ? "1px solid #333" : "1px solid transparent",
                  borderRadius: 6,
                  fontFamily: "inherit",
                  fontSize: 10,
                  cursor: "pointer",
                  textAlign: "center",
                  minWidth: 44,
                }}
                onClick={() => setSelectedDay(d)}
              >
                <div style={{ fontWeight: 600 }}>{getDayLabel(d)}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                  {d.getDate()}
                </div>
                {dayTasks.length > 0 && (
                  <div
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: isSelected ? "#000" : "#2A9D8F",
                      margin: "4px auto 0",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div style={{ ...styles.label, marginBottom: 8 }}>
          {isToday ? "Today's" : getDayLabel(selectedDay) + "'s"} Time Blocks
        </div>

        {/* Time blocks */}
        <div style={{ marginBottom: 16 }}>
          {TIME_BLOCKS.map((block) => {
            const tasksInSlot = getTasksForDaySlot(dayStr, block.slot);
            return (
              <div
                key={block.slot}
                style={{
                  display: "flex",
                  gap: 8,
                  padding: "6px 0",
                  borderBottom: "1px solid #111114",
                  minHeight: 32,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 64,
                    fontSize: 10,
                    color: "#444",
                    flexShrink: 0,
                    textAlign: "right",
                    paddingRight: 8,
                  }}
                >
                  {block.label}
                </div>
                <div style={{ flex: 1 }}>
                  {tasksInSlot.length > 0 ? (
                    tasksInSlot.map((t) => (
                      <div
                        key={t.id}
                        style={{
                          padding: "4px 8px",
                          background: CATEGORIES[t.category]?.color + "18",
                          borderLeft: `3px solid ${CATEGORIES[t.category]?.color}`,
                          borderRadius: "0 4px 4px 0",
                          fontSize: 11,
                          color: "#ccc",
                          marginBottom: 2,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{ cursor: "pointer", fontSize: 10 }}
                          onClick={() => toggleComplete(t.id)}
                        >
                          ☐
                        </span>
                        {t.title}
                      </div>
                    ))
                  ) : editingBlockTask ? (
                    <div
                      style={{
                        padding: "4px 8px",
                        border: "1px dashed #333",
                        borderRadius: 4,
                        fontSize: 10,
                        color: "#444",
                        cursor: "pointer",
                      }}
                      onClick={() => assignToBlock(editingBlockTask, dayStr, block.slot)}
                    >
                      + Assign here
                    </div>
                  ) : (
                    <div style={{ height: 20 }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Unscheduled tasks to drag */}
        {unscheduledTasks.length > 0 && (
          <div>
            <div style={styles.label}>Unscheduled — Tap to assign</div>
            {unscheduledTasks.map((t) => (
              <div
                key={t.id}
                style={{
                  ...styles.card,
                  padding: "8px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  border:
                    editingBlockTask === t.id
                      ? "1px solid #fff"
                      : "1px solid #1a1a1e",
                }}
                onClick={() =>
                  setEditingBlockTask(editingBlockTask === t.id ? null : t.id)
                }
              >
                <span>{CATEGORIES[t.category]?.icon}</span>
                <span style={{ flex: 1, fontSize: 11 }}>{t.title}</span>
                <span style={{ fontSize: 10, color: "#555" }}>
                  {t.timeEstimate}m
                </span>
              </div>
            ))}
            {editingBlockTask && (
              <div
                style={{
                  fontSize: 10,
                  color: "#666",
                  textAlign: "center",
                  marginTop: 8,
                }}
              >
                ↑ Tap a time slot above to assign the selected task
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderWeekly() {
    const thisWeekCompleted = completedTasks.filter((t) => {
      if (!t.completedAt) return false;
      const completed = new Date(t.completedAt);
      return completed >= weekDates[0] && completed <= weekDates[6];
    });

    const categoryStats = Object.keys(CATEGORIES).map((cat) => {
      const active = activeTasks.filter((t) => t.category === cat).length;
      const done = thisWeekCompleted.filter((t) => t.category === cat).length;
      return { cat, active, done };
    });

    return (
      <div style={styles.section}>
        <div style={{ ...styles.label, marginBottom: 12 }}>
          Weekly Review — Entropy Audit
        </div>

        {/* Week score */}
        <div style={{ ...styles.card, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={styles.entropyLabel}>Tasks Completed This Week</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#2A9D8F", lineHeight: 1, marginTop: 4 }}>
                {thisWeekCompleted.length}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={styles.entropyLabel}>Still Open</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: entropyColor, lineHeight: 1, marginTop: 4 }}>
                {activeTasks.length}
              </div>
            </div>
          </div>
        </div>

        {/* Category breakdown */}
        <div style={{ marginBottom: 16 }}>
          <div style={styles.label}>By Category</div>
          {categoryStats.map(({ cat, active, done }) => (
            <div
              key={cat}
              style={{
                ...styles.card,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
              }}
            >
              <span>{CATEGORIES[cat].icon}</span>
              <span style={{ flex: 1, fontSize: 11, color: CATEGORIES[cat].color }}>
                {CATEGORIES[cat].label}
              </span>
              <span style={{ fontSize: 11, color: "#2A9D8F" }}>✓ {done}</span>
              <span style={{ fontSize: 11, color: "#666" }}>| {active} open</span>
            </div>
          ))}
        </div>

        {/* Activation chain - what got unlocked */}
        {thisWeekCompleted.filter((t) => t.activatesNext).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={styles.label}>Chains Activated This Week</div>
            {thisWeekCompleted
              .filter((t) => t.activatesNext)
              .map((t) => (
                <div key={t.id} style={{ ...styles.card, padding: "8px 12px", fontSize: 11 }}>
                  <span style={{ color: "#555", textDecoration: "line-through" }}>
                    {t.title}
                  </span>
                  <span style={{ color: "#666" }}> → </span>
                  <span style={{ color: "#9B5DE5", fontWeight: 600 }}>
                    {t.activatesNext}
                  </span>
                </div>
              ))}
          </div>
        )}

        {/* Week notes */}
        <div>
          <div style={styles.label}>Week Notes / Reflections</div>
          <textarea
            style={{ ...styles.textarea, minHeight: 80 }}
            value={state.weekNotes}
            onChange={(e) =>
              setState((s) => ({ ...s, weekNotes: e.target.value }))
            }
            placeholder="What worked? What didn't? Where did entropy win?"
          />
        </div>
      </div>
    );
  }

  function renderAllTasks() {
    const grouped = {};
    Object.keys(CATEGORIES).forEach((cat) => {
      grouped[cat] = activeTasks.filter((t) => t.category === cat);
    });

    return (
      <div style={styles.section}>
        <div style={{ ...styles.label, marginBottom: 12 }}>
          All Open Tasks ({activeTasks.length})
        </div>
        {Object.keys(CATEGORIES).map((cat) =>
          grouped[cat].length > 0 ? (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div
                style={{
                  ...styles.label,
                  color: CATEGORIES[cat].color,
                  marginBottom: 6,
                }}
              >
                {CATEGORIES[cat].icon} {CATEGORIES[cat].label} ({grouped[cat].length})
              </div>
              {grouped[cat].map((t) => renderTaskCard(t))}
            </div>
          ) : null
        )}
        {activeTasks.length === 0 && (
          <div
            style={{
              ...styles.card,
              textAlign: "center",
              padding: 30,
              color: "#444",
              fontSize: 12,
            }}
          >
            Zero entropy. Capture something →
          </div>
        )}
      </div>
    );
  }

  if (!loaded) {
    return (
      <div style={{ ...styles.app, display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ color: "#555", fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase" }}>
          Loading system...
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={styles.title}>Entropy Engine</h1>
            <div style={styles.subtitle}>Disorder is the default. Act accordingly.</div>
          </div>
        </div>
        <div style={styles.entropyBar}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={styles.entropyLabel}>System Entropy</div>
              <div style={styles.entropyValue}>{entropyScore}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={styles.entropyLabel}>Open Loops</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#e0e0e0" }}>
                {activeTasks.length}
              </div>
            </div>
          </div>
          <div style={styles.entropyMeter}>
            <div style={styles.entropyFill} />
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={styles.nav}>
        {[
          { key: "dashboard", label: "Hub" },
          { key: "capture", label: "Capture" },
          { key: "blocks", label: "Blocks" },
          { key: "tasks", label: "Tasks" },
          { key: "weekly", label: "Review" },
        ].map((tab) => (
          <button
            key={tab.key}
            style={styles.navBtn(view === tab.key)}
            onClick={() => setView(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {view === "dashboard" && renderDashboard()}
      {view === "capture" && renderCapture()}
      {view === "blocks" && renderBlocks()}
      {view === "tasks" && renderAllTasks()}
      {view === "weekly" && renderWeekly()}

      {/* Black Swan button */}
      <button style={styles.blackSwanBtn} onClick={toggleBlackSwan} title="Toggle Black Swan mode">
        🦢
      </button>

      {/* Spacer for fixed button */}
      <div style={{ height: 80 }} />
    </div>
  );
}
