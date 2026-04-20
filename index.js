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
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Keep connection warm (prevents Render cold starts)
setInterval(async () => {
  try { await pool.query("SELECT 1"); } catch {}
}, 4 * 60 * 1000); // every 4 min

// ─── GOALS (single query with JOINs) ───

app.get("/api/goals", async (req, res) => {
  try {
    const [goalsRes, tasksRes, microsRes] = await Promise.all([
      pool.query("SELECT * FROM goals ORDER BY created_at DESC"),
      pool.query("SELECT * FROM tasks ORDER BY sort_order, created_at"),
      pool.query("SELECT * FROM microtasks ORDER BY sort_order, created_at"),
    ]);

    // Index microtasks by task_id
    const microsByTask = {};
    for (const m of microsRes.rows) {
      if (!microsByTask[m.task_id]) microsByTask[m.task_id] = [];
      microsByTask[m.task_id].push({ id: m.id, title: m.title, done: m.done });
    }

    // Index tasks by goal_id
    const tasksByGoal = {};
    for (const t of tasksRes.rows) {
      if (!tasksByGoal[t.goal_id]) tasksByGoal[t.goal_id] = [];
      tasksByGoal[t.goal_id].push({
        id: t.id, title: t.title, done: t.done, prio: t.priority,
        children: microsByTask[t.id] || [],
      });
    }

    const goals = goalsRes.rows.map((g) => ({
      id: g.id, title: g.title, desc: g.description, cat: g.category,
      prio: g.priority, deadline: g.deadline, reward: g.reward, done: g.done,
      notif: { enabled: g.notif_enabled, freq: g.notif_freq, time: g.notif_time, day: g.notif_day },
      tasks: tasksByGoal[g.id] || [],
    }));

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

// ─── CALENDAR TASKS ───
app.get("/api/calendar", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM calendar_tasks ORDER BY task_date, priority, created_at");
    res.json(result.rows.map(r => ({
      id: r.id,
      title: r.title,
      date: r.task_date,
      done: r.done,
      prio: r.priority,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load calendar tasks" });
  }
});

app.post("/api/calendar", async (req, res) => {
  try {
    const { id, title, date, prio } = req.body;
    const tid = id || uuidv4();
    await pool.query(
      "INSERT INTO calendar_tasks (id, title, task_date, priority) VALUES ($1, $2, $3, $4)",
      [tid, title, date, prio || "medium"]
    );
    res.json({ id: tid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create calendar task" });
  }
});

app.put("/api/calendar/:id", async (req, res) => {
  try {
    const { title, date, done, prio } = req.body;
    const sets = [];
    const vals = [req.params.id];
    let i = 2;
    if (title !== undefined) { sets.push(`title=$${i++}`); vals.push(title); }
    if (date !== undefined) { sets.push(`task_date=$${i++}`); vals.push(date); }
    if (done !== undefined) { sets.push(`done=$${i++}`); vals.push(done); }
    if (prio !== undefined) { sets.push(`priority=$${i++}`); vals.push(prio); }
    if (sets.length > 0) {
      await pool.query(`UPDATE calendar_tasks SET ${sets.join(",")} WHERE id=$1`, vals);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update calendar task" });
  }
});

app.delete("/api/calendar/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM calendar_tasks WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete calendar task" });
  }
});

// ─── BATCH: toggle task + all microtasks in one request ───

app.post("/api/tasks/:id/toggle", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const taskRes = await client.query("SELECT done FROM tasks WHERE id=$1", [req.params.id]);
    if (taskRes.rows.length === 0) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Not found" }); }
    const newDone = !taskRes.rows[0].done;
    await client.query("UPDATE tasks SET done=$2 WHERE id=$1", [req.params.id, newDone]);
    await client.query("UPDATE microtasks SET done=$2 WHERE task_id=$1", [req.params.id, newDone]);
    await client.query("COMMIT");
    res.json({ done: newDone });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed" });
  } finally {
    client.release();
  }
});

// ─── BATCH: toggle microtask + auto-complete parent task ───

app.post("/api/microtasks/:id/toggle", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const microRes = await client.query("SELECT * FROM microtasks WHERE id=$1", [req.params.id]);
    if (microRes.rows.length === 0) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Not found" }); }
    const micro = microRes.rows[0];
    const newDone = !micro.done;
    await client.query("UPDATE microtasks SET done=$2 WHERE id=$1", [req.params.id, newDone]);

    // Check if all siblings are done → auto-complete parent task
    const siblingsRes = await client.query(
      "SELECT done FROM microtasks WHERE task_id=$1 AND id!=$2",
      [micro.task_id, req.params.id]
    );
    const allDone = newDone && siblingsRes.rows.every((r) => r.done);
    const anyUndone = !newDone || siblingsRes.rows.some((r) => !r.done);

    if (allDone) {
      await client.query("UPDATE tasks SET done=true WHERE id=$1", [micro.task_id]);
    } else if (!newDone) {
      await client.query("UPDATE tasks SET done=false WHERE id=$1", [micro.task_id]);
    }

    // Check if all tasks of the goal are done → auto-complete goal
    const taskRes = await client.query("SELECT goal_id FROM tasks WHERE id=$1", [micro.task_id]);
    if (taskRes.rows.length > 0) {
      const goalId = taskRes.rows[0].goal_id;
      const allTasksRes = await client.query("SELECT done FROM tasks WHERE goal_id=$1", [goalId]);
      const goalDone = allTasksRes.rows.length > 0 && allTasksRes.rows.every((r) => r.done);
      await client.query("UPDATE goals SET done=$2 WHERE id=$1", [goalId, goalDone]);
    }

    await client.query("COMMIT");
    res.json({ done: newDone, taskDone: allDone });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed" });
  } finally {
    client.release();
  }
});

// ─── HABITS ───

app.get("/api/habits", async (req, res) => {
  try {
    const [habitsRes, logsRes] = await Promise.all([
      pool.query("SELECT * FROM habits ORDER BY created_at DESC"),
      pool.query("SELECT * FROM habit_logs"),
    ]);
    const logsByHabit = {};
    for (const r of logsRes.rows) {
      if (!logsByHabit[r.habit_id]) logsByHabit[r.habit_id] = {};
      logsByHabit[r.habit_id][r.log_date] = true;
    }
    const habits = habitsRes.rows.map((h) => ({
      id: h.id, title: h.title, emoji: h.emoji, color: h.color, streak: h.streak,
      logs: logsByHabit[h.id] || {},
    }));
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
      "SELECT id FROM habit_logs WHERE habit_id=$1 AND log_date=$2", [req.params.id, date]
    );
    if (existing.rows.length > 0) {
      await pool.query("DELETE FROM habit_logs WHERE habit_id=$1 AND log_date=$2", [req.params.id, date]);
    } else {
      await pool.query("INSERT INTO habit_logs (habit_id, log_date) VALUES ($1,$2)", [req.params.id, date]);
    }
    // Calculate streak
    const logsRes = await pool.query("SELECT log_date FROM habit_logs WHERE habit_id=$1", [req.params.id]);
    const logSet = new Set(logsRes.rows.map((r) => r.log_date));
    let streak = 0;
    const d = new Date(); d.setHours(0, 0, 0, 0);
    while (true) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (logSet.has(key)) { streak++; d.setDate(d.getDate() - 1); } else break;
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

app.get("/api/ideas", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ideas ORDER BY created_at DESC");
    res.json(result.rows.map((i) => ({
      id: i.id, title: i.title, note: i.note, emoji: i.emoji,
      tag: i.tag, color: i.color, done: i.done, created: i.created_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load ideas" });
  }
});

app.post("/api/ideas", async (req, res) => {
  try {
    const { id, title, note, emoji, tag, color } = req.body;
    const iid = id || uuidv4();
    await pool.query(
      "INSERT INTO ideas (id, title, note, emoji, tag, color) VALUES ($1,$2,$3,$4,$5,$6)",
      [iid, title, note || "", emoji || "💡", tag || "Другое", color || "#6366F1"]
    );
    res.json({ id: iid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create idea" });
  }
});

app.put("/api/ideas/:id", async (req, res) => {
  try {
    const { title, note, emoji, tag, color, done } = req.body;
    await pool.query(
      "UPDATE ideas SET title=$2, note=$3, emoji=$4, tag=$5, color=$6, done=$7 WHERE id=$1",
      [req.params.id, title, note || "", emoji || "💡", tag || "Другое", color || "#6366F1", done || false]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update idea" });
  }
});

app.delete("/api/ideas/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM ideas WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete idea" });
  }
});

// ─── Health ───
app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 GoalFlow API on port ${PORT}`));

app.get('/ping', (req, res) => {
  res.json({ status: 'ok' });
});
