/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import type { TIssuePriorities } from "@plane/types";
import { getDaysUntilISODate, getWorkItemUrgency, groupWorkItemsByUrgency } from "./work-item-urgency";

const TODAY = "2026-10-08";

const item = (id: string, target_date: string | null, created_at: string, priority: TIssuePriorities = "none") => ({
  id,
  target_date,
  created_at,
  priority,
});

describe("getWorkItemUrgency", () => {
  it.each([
    [null, "no_due_date"],
    [undefined, "no_due_date"],
    ["2026-10-07", "overdue"],
    ["2025-01-01", "overdue"],
    ["2026-10-08", "today"],
    ["2026-10-09", "next_7_days"],
    ["2026-10-15", "next_7_days"],
    ["2026-10-16", "later"],
    ["2026-10-08T00:00:00Z", "today"],
  ])("%s is %s", (targetDate, urgency) => {
    expect(getWorkItemUrgency(targetDate, TODAY)).toBe(urgency);
  });

  it("works across a month and year boundary", () => {
    expect(getWorkItemUrgency("2027-01-03", "2026-12-31")).toBe("next_7_days");
    expect(getWorkItemUrgency("2026-12-30", "2027-01-01")).toBe("overdue");
  });
});

describe("getDaysUntilISODate", () => {
  it("counts whole days, negative in the past", () => {
    expect(getDaysUntilISODate("2026-10-08", TODAY)).toBe(0);
    expect(getDaysUntilISODate("2026-10-09", TODAY)).toBe(1);
    expect(getDaysUntilISODate("2026-10-01", TODAY)).toBe(-7);
    expect(getDaysUntilISODate("2027-01-01", "2026-12-31")).toBe(1);
  });
});

describe("groupWorkItemsByUrgency", () => {
  it("orders groups most urgent first and leaves out empty ones", () => {
    const groups = groupWorkItemsByUrgency(
      [
        item("undated", null, "2026-01-01T00:00:00Z"),
        item("later", "2026-12-01", "2026-01-01T00:00:00Z"),
        item("overdue", "2026-10-01", "2026-01-01T00:00:00Z"),
      ],
      TODAY
    );
    expect(groups.map((group) => group.urgency)).toEqual(["overdue", "later", "no_due_date"]);
  });

  it("sorts by due date, then priority, then oldest created", () => {
    const [group] = groupWorkItemsByUrgency(
      [
        item("c", "2026-10-03", "2026-01-01T00:00:00Z", "low"),
        item("b", "2026-10-01", "2026-03-01T00:00:00Z", "medium"),
        item("a", "2026-10-01", "2026-05-01T00:00:00Z", "urgent"),
        item("d", "2026-10-03", "2026-02-01T00:00:00Z", "low"),
        item("e", "2026-10-03", "2026-01-15T00:00:00Z", "low"),
      ],
      TODAY
    );
    expect(group.workItems.map((workItem) => workItem.id)).toEqual(["a", "b", "c", "e", "d"]);
  });

  it("orders work items without a due date by creation date, oldest first", () => {
    const [group] = groupWorkItemsByUrgency(
      [
        item("newest", null, "2026-09-01T00:00:00Z", "urgent"),
        item("oldest", null, "2026-01-01T00:00:00Z", "low"),
        item("middle", null, "2026-05-01T00:00:00Z", "high"),
      ],
      TODAY
    );
    expect(group.urgency).toBe("no_due_date");
    expect(group.workItems.map((workItem) => workItem.id)).toEqual(["oldest", "middle", "newest"]);
  });
});
