require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ─── GOALS ───

app.get("/api/goals", async (req, res) => {
  try {
    const goalsRes = await pool.query("SELECT * FROM goals ORDER BY created_at DESC");
    const goals = [];
    for (const g of goalsRes.rows) {
      const tasksRes = await pool.query("SELECT * FROM tasks WHERE goal_id = $1 ORDER BY sort_order, created_at", [g.id]);
      const tasks = [];
      for (const t of tasksRes.rows) {
        const microsRes = await pool.query("SELECT * FROM microtasks WHERE task_id = $1 ORDER BY sort_order, created_at", [t.id]);
        tasks.push({
          id: t.id, title: t.title, done: t.done, prio: t.priority,
          children: microsRes.rows.map((m) => ({ id: m.id, title: m.title, done: m.done })),
        });
      }
      goals.push({
        id: g.id, title: g.title, desc: g.description, cat: g.category,
        prio: g.priority, deadline: g.deadline, reward: g.reward, done: g.done,
        notif: { enabled: g.notif_enabled, freq: g.notif_freq, time: g.notif_time, day: g.notif_day },
        tasks,
      });
    }
    res.json(goals);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load goals" });
  }
});

app.post("/api/goals", async (req, res) => {
  try {
    const { id, title, desc, cat, prio, deadline, reward, notif } = req.body;
    const gid = id || uuidv4();
    await pool.query(
      `INSERT INTO goals (id, title, description, category, priority, deadline, reward, notif_enabled, notif_freq, notif_time, notif_day)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [gid, title, desc || "", cat || "work", prio || "medium", deadline || "", reward || "",
       notif?.enabled || false, notif?.freq || "daily", notif?.time || "09:00", notif?.day || "mon"]
    );
    res.json({ id: gid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create goal" });
  }
});

app.put("/api/goals/:id", async (req, res) => {
  try {
    const { title, desc, cat, prio, deadline, reward, done, notif } = req.body;
    await pool.query(
      `UPDATE goals SET title=$2, description=$3, category=$4, priority=$5, deadline=$6,
       reward=$7, done=$8, notif_enabled=$9, notif_freq=$10, notif_time=$11, notif_day=$12, updated_at=NOW()
       WHERE id=$1`,
      [req.params.id, title, desc || "", cat || "work", prio || "medium", deadline || "",
       reward || "", done || false, notif?.enabled || false, notif?.freq || "daily",
       notif?.time || "09:00", notif?.day || "mon"]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update goal" });
  }
});

app.delete("/api/goals/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM goals WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete goal" });
  }
});

// ─── TASKS ───

app.post("/api/tasks", async (req, res) => {
  try {
    const { id, goal_id, title, prio } = req.body;
    const tid = id || uuidv4();
    await pool.query(
      "INSERT INTO tasks (id, goal_id, title, priority) VALUES ($1,$2,$3,$4)",
      [tid, goal_id, title, prio || "medium"]
    );
    res.json({ id: tid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create task" });
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  try {
    const { title, done, prio } = req.body;
    const sets = [];
    const vals = [req.params.id];
    let i = 2;
    if (title !== undefined) { sets.push(`title=$${i++}`); vals.push(title); }
    if (done !== undefined) { sets.push(`done=$${i++}`); vals.push(done); }
    if (prio !== undefined) { sets.push(`priority=$${i++}`); vals.push(prio); }
    if (sets.length > 0) {
      await pool.query(`UPDATE tasks SET ${sets.join(",")} WHERE id=$1`, vals);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update task" });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM tasks WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// ─── MICROTASKS ───

app.post("/api/microtasks", async (req, res) => {
  try {
    const { id, task_id, title } = req.body;
    const mid = id || uuidv4();
    await pool.query(
      "INSERT INTO microtasks (id, task_id, title) VALUES ($1,$2,$3)",
      [mid, task_id, title]
    );
    res.json({ id: mid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create microtask" });
  }
});

app.put("/api/microtasks/:id", async (req, res) => {
  try {
    const { title, done } = req.body;
    const sets = [];
    const vals = [req.params.id];
    let i = 2;
    if (title !== undefined) { sets.push(`title=$${i++}`); vals.push(title); }
    if (done !== undefined) { sets.push(`done=$${i++}`); vals.push(done); }
    if (sets.length > 0) {
      await pool.query(`UPDATE microtasks SET ${sets.join(",")} WHERE id=$1`, vals);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update microtask" });
  }
});

app.delete("/api/microtasks/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM microtasks WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete microtask" });
  }
});

// ─── HABITS ───

app.get("/api/habits", async (req, res) => {
  try {
    const habitsRes = await pool.query("SELECT * FROM habits ORDER BY created_at DESC");
    const habits = [];
    for (const h of habitsRes.rows) {
      const logsRes = await pool.query("SELECT log_date FROM habit_logs WHERE habit_id = $1", [h.id]);
      const logs = {};
      logsRes.rows.forEach((r) => { logs[r.log_date] = true; });
      habits.push({ id: h.id, title: h.title, emoji: h.emoji, color: h.color, streak: h.streak, logs });
    }
    res.json(habits);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load habits" });
  }
});

app.post("/api/habits", async (req, res) => {
  try {
    const { id, title, emoji, color } = req.body;
    const hid = id || uuidv4();
    await pool.query(
      "INSERT INTO habits (id, title, emoji, color) VALUES ($1,$2,$3,$4)",
      [hid, title, emoji || "", color || "#6366F1"]
    );
    res.json({ id: hid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create habit" });
  }
});

app.put("/api/habits/:id", async (req, res) => {
  try {
    const { title, emoji, color, streak } = req.body;
    await pool.query(
      "UPDATE habits SET title=$2, emoji=$3, color=$4, streak=$5 WHERE id=$1",
      [req.params.id, title, emoji || "", color || "#6366F1", streak || 0]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update habit" });
  }
});

app.delete("/api/habits/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM habits WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete habit" });
  }
});

app.post("/api/habits/:id/toggle", async (req, res) => {
  try {
    const { date } = req.body;
    const existing = await pool.query(
      "SELECT id FROM habit_logs WHERE habit_id=$1 AND log_date=$2",
      [req.params.id, date]
    );
    if (existing.rows.length > 0) {
      await pool.query("DELETE FROM habit_logs WHERE habit_id=$1 AND log_date=$2", [req.params.id, date]);
    } else {
      await pool.query("INSERT INTO habit_logs (habit_id, log_date) VALUES ($1,$2)", [req.params.id, date]);
    }
    // Calculate streak
    const logsRes = await pool.query("SELECT log_date FROM habit_logs WHERE habit_id=$1 ORDER BY log_date DESC", [req.params.id]);
    const logSet = new Set(logsRes.rows.map((r) => r.log_date));
    let streak = 0;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    while (true) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (logSet.has(key)) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    await pool.query("UPDATE habits SET streak=$2 WHERE id=$1", [req.params.id, streak]);
    res.json({ streak, toggled: existing.rows.length === 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to toggle habit" });
  }
});

// ─── WISHES ───

app.get("/api/wishes", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM wishes ORDER BY created_at DESC");
    res.json(result.rows.map((w) => ({
      id: w.id, title: w.title, note: w.note, emoji: w.emoji, done: w.done,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load wishes" });
  }
});

app.post("/api/wishes", async (req, res) => {
  try {
    const { id, title, note, emoji } = req.body;
    const wid = id || uuidv4();
    await pool.query(
      "INSERT INTO wishes (id, title, note, emoji) VALUES ($1,$2,$3,$4)",
      [wid, title, note || "", emoji || ""]
    );
    res.json({ id: wid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create wish" });
  }
});

app.put("/api/wishes/:id", async (req, res) => {
  try {
    const { title, note, emoji, done } = req.body;
    await pool.query(
      "UPDATE wishes SET title=$2, note=$3, emoji=$4, done=$5 WHERE id=$1",
      [req.params.id, title, note || "", emoji || "", done || false]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update wish" });
  }
});

app.delete("/api/wishes/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM wishes WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete wish" });
  }
});

// ─── Health check ───
app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 GoalFlow API running on port ${PORT}`));
