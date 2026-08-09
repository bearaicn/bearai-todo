import type { RepeatRule, Task } from "./task.js";

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function addCalendarMonths(value: Date, months: number) {
  const day = value.getDate();
  value.setDate(1);
  value.setMonth(value.getMonth() + months);
  value.setDate(Math.min(day, daysInMonth(value.getFullYear(), value.getMonth())));
}

function formatLocalDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function nextRepeatDue(rule: RepeatRule, due?: string | null, now = new Date()) {
  const dateOnly = !due || dateOnlyPattern.test(due);
  const parts = due && dateOnly ? due.split("-").map(Number) : null;
  const value = due
    ? dateOnly && parts
      ? new Date(parts[0], parts[1] - 1, parts[2])
      : new Date(due)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const interval = Math.max(1, Math.trunc(rule.interval || 1));
  if (rule.frequency === "daily") value.setDate(value.getDate() + interval);
  if (rule.frequency === "weekly") value.setDate(value.getDate() + interval * 7);
  if (rule.frequency === "monthly") addCalendarMonths(value, interval);
  if (rule.frequency === "yearly") addCalendarMonths(value, interval * 12);
  return dateOnly ? formatLocalDate(value) : value.toISOString();
}

export function nextRecurringTask(task: Task, id: string, now = new Date()): Task {
  if (!task.repeat) throw new Error("任务没有重复规则");
  const timestamp = now.toISOString();
  const due=nextRepeatDue(task.repeat, task.due, now),seriesKey=task.seriesKey??task.id;
  return {
    ...task,
    id,
    revision: 1,
    status: "active",
    due,
    reminder: null,
    attachments: [],
    completedAt: null,
    voidedAt:null,
    recurrenceSourceId:task.id,
    seriesKey,
    instanceKey:task.instanceKey?`${seriesKey}:${due}`:task.instanceKey,
    validOn:task.rollover==='forbidden'?due.slice(0,10):task.validOn,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
