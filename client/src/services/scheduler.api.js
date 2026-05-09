import { AuthClient } from "../context/AuthContext";

export async function fetchSchedulerTasks() {
  const response = await AuthClient.get("/scheduler/tasks");
  return response.data?.tasks || [];
}

export async function runSchedulerTaskNow(taskKey) {
  const response = await AuthClient.post(`/scheduler/run/${taskKey}`);
  return response.data || null;
}

export async function updateSchedulerTaskConfig(taskKey, payload) {
  const response = await AuthClient.patch(`/scheduler/tasks/${taskKey}`, payload);
  return response.data?.task || null;
}
