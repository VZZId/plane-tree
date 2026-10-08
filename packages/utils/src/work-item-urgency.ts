/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssuePriorities } from "@plane/types";
import { addDaysToISODate } from "./time-tracking";

export type TWorkItemUrgency = "overdue" | "today" | "next_7_days" | "later" | "no_due_date";

/** Most urgent first. */
export const WORK_ITEM_URGENCY_ORDER: TWorkItemUrgency[] = ["overdue", "today", "next_7_days", "later", "no_due_date"];

export type TUrgencySortableWorkItem = {
  /** YYYY-MM-DD */
  target_date?: string | null;
  created_at?: string;
  priority?: TIssuePriorities | null;
};

const PRIORITY_RANK: Record<TIssuePriorities, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

/** How urgent a due date is relative to `today` (YYYY-MM-DD, in the user's timezone). */
export const getWorkItemUrgency = (targetDate: string | null | undefined, today: string): TWorkItemUrgency => {
  if (!targetDate) return "no_due_date";
  const dueDate = targetDate.slice(0, 10);
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  if (dueDate <= addDaysToISODate(today, 7)) return "next_7_days";
  return "later";
};

/** Whole days from `today` to a YYYY-MM-DD date, negative when it is in the past. */
export const getDaysUntilISODate = (date: string, today: string): number =>
  Math.round((Date.parse(date.slice(0, 10)) - Date.parse(today)) / 86_400_000);

const compareWorkItems = (a: TUrgencySortableWorkItem, b: TUrgencySortableWorkItem): number => {
  // oldest first, it has been waiting longest
  const byCreatedAt = (a.created_at ?? "").localeCompare(b.created_at ?? "");
  // items without a due date are all in the same group and go purely by creation date
  if (!a.target_date || !b.target_date) return byCreatedAt;
  const byDueDate = a.target_date.localeCompare(b.target_date);
  if (byDueDate !== 0) return byDueDate;
  const byPriority = PRIORITY_RANK[a.priority ?? "none"] - PRIORITY_RANK[b.priority ?? "none"];
  return byPriority !== 0 ? byPriority : byCreatedAt;
};

/**
 * Work items grouped by how soon they are due, most urgent group first, empty groups left out.
 * Within a group: earliest due date, then highest priority, then oldest created; work items
 * without a due date are ordered by creation date.
 */
export const groupWorkItemsByUrgency = <T extends TUrgencySortableWorkItem>(
  workItems: T[],
  today: string
): { urgency: TWorkItemUrgency; workItems: T[] }[] => {
  const groups = new Map<TWorkItemUrgency, T[]>(WORK_ITEM_URGENCY_ORDER.map((urgency) => [urgency, []]));
  for (const workItem of workItems) groups.get(getWorkItemUrgency(workItem.target_date, today))?.push(workItem);
  return WORK_ITEM_URGENCY_ORDER.map((urgency) => ({
    urgency,
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts the group's own array
    workItems: (groups.get(urgency) ?? []).sort(compareWorkItems),
  })).filter((group) => group.workItems.length > 0);
};
