import {
  getSchedulerTasks,
  refreshSchedulerTasksState,
  runSchedulerTask,
  updateSchedulerTask,
} from "../services/scheduler.js";
import { listImportRuns } from "../services/importRunJournal.js";

const allowedRunStatuses = new Set([
  "completed",
  "completed_with_warnings",
  "skipped",
  "failed",
]);

export function getImportRuns(req, res) {
  const { task = "", status = "", limit = "100" } = req.query || {};
  const parsedLimit = Number(limit);

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
    return res.status(422).json({
      ok: false,
      error: "limit must be an integer from 1 to 500",
    });
  }

  if (status && !allowedRunStatuses.has(status)) {
    return res.status(422).json({
      ok: false,
      error: "Unknown import run status",
    });
  }

  const journal = listImportRuns({ task, status, limit: parsedLimit });
  return res.status(200).json({
    ok: true,
    data: journal.data,
    meta: {
      returned: journal.data.length,
      available: journal.available,
      retention_days: journal.retentionDays,
      max_entries: journal.maxEntries,
      volatile: true,
    },
  });
}

export async function getTasks(req, res) {
  await refreshSchedulerTasksState();
  return res.status(200).json({ tasks: getSchedulerTasks() });
}

export async function runTask(req, res) {
  const { taskKey } = req.params;
  const result = await runSchedulerTask(taskKey);

  if (!result?.found) {
    return res.status(404).json({ error: "Scheduler task not found" });
  }

  if (result.blockedReason) {
    return res.status(409).json({
      error: "Scheduler task is blocked by branch configuration",
      blockedReason: result.blockedReason,
      taskKey,
      task: result.task || null,
    });
  }

  if (result.runResult?.status === "failed") {
    return res.status(500).json({
      error: result.runResult.message || "Scheduler task failed",
      taskKey,
      task: result.task || null,
      runResult: result.runResult,
    });
  }

  return res.status(200).json({
    ok: true,
    taskKey,
    task: result.task || null,
    runResult: result.runResult || null,
  });
}

export async function updateTask(req, res) {
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

    const updatedTask = await updateSchedulerTask(taskKey, { active, intervalMs: parsed });
    if (!updatedTask) {
      return res.status(404).json({ error: "Scheduler task not found" });
    }

    return res.status(200).json({ ok: true, task: updatedTask });
  }

  const updatedTask = await updateSchedulerTask(taskKey, { active });
  if (!updatedTask) {
    return res.status(404).json({ error: "Scheduler task not found" });
  }

  return res.status(200).json({ ok: true, task: updatedTask });
}
