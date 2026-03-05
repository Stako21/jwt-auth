import {
  getSchedulerTasks,
  runSchedulerTask,
  updateSchedulerTask,
} from "../services/scheduler.js";

export function getTasks(req, res) {
  return res.status(200).json({ tasks: getSchedulerTasks() });
}

export async function runTask(req, res) {
  const { taskKey } = req.params;
  const found = await runSchedulerTask(taskKey);

  if (!found) {
    return res.status(404).json({ error: "Scheduler task not found" });
  }

  return res.status(200).json({ ok: true, taskKey });
}

export function updateTask(req, res) {
  const { taskKey } = req.params;
  const { active, intervalMs } = req.body || {};

  if (typeof active !== "boolean" && intervalMs === undefined) {
    return res.status(400).json({
      error: "Provide at least one field: active or intervalMs",
    });
  }

  if (intervalMs !== undefined) {
    const parsed = Number(intervalMs);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return res.status(400).json({ error: "intervalMs must be a positive integer" });
    }

    const updatedTask = updateSchedulerTask(taskKey, { active, intervalMs: parsed });
    if (!updatedTask) {
      return res.status(404).json({ error: "Scheduler task not found" });
    }

    return res.status(200).json({ ok: true, task: updatedTask });
  }

  const updatedTask = updateSchedulerTask(taskKey, { active });
  if (!updatedTask) {
    return res.status(404).json({ error: "Scheduler task not found" });
  }

  return res.status(200).json({ ok: true, task: updatedTask });
}
