/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { PriorityIcon, StateGroupIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssue, THomeWidgetProps, TStateGroups } from "@plane/types";
import type { TWorkItemUrgency } from "@plane/utils";
import { cn, getDaysUntilISODate, getTodayISODate, groupWorkItemsByUrgency, renderFormattedDate } from "@plane/utils";
// components
import { ContentOverflowWrapper } from "@/components/core/content-overflow-HOC";
import { WorkItemTimerButton } from "@/components/time-tracking/timer/work-item-timer-button";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUser } from "@/hooks/store/user";
import { useTimeTrackingPermissions } from "@/hooks/time-tracking/use-time-tracking-permissions";
// services
import { UserService } from "@/services/user.service";
// local imports
import { EWidgetKeys, WidgetLoader } from "../loaders";

const userService = new UserService();

/** the most urgent work items are fetched first, so this many is plenty for a home widget */
const PER_PAGE = 100;
const OPEN_STATE_GROUPS: TStateGroups[] = ["backlog", "unstarted", "started"];

type TRowProps = {
  workItem: TIssue;
  workspaceSlug: string;
  today: string;
  urgency: TWorkItemUrgency;
  showTimer: boolean;
};

const AssignedWorkItemRow = observer(function AssignedWorkItemRow(props: TRowProps) {
  const { workItem, workspaceSlug, today, urgency, showTimer } = props;
  const { t } = useTranslation();
  const { getProjectIdentifierById } = useProject();
  const { getStateById } = useProjectState();
  const { setPeekIssue } = useIssueDetail();
  // derived values
  const state = getStateById(workItem.state_id);
  const projectIdentifier = getProjectIdentifierById(workItem.project_id);
  const dueDate = workItem.target_date;

  let dueLabel: string | null = null;
  if (dueDate) {
    const days = getDaysUntilISODate(dueDate, today);
    if (days < 0) dueLabel = t("home.assigned_work.due_relative.overdue", { days: -days });
    else if (days === 0) dueLabel = t("home.assigned_work.due_relative.today");
    else if (days === 1) dueLabel = t("home.assigned_work.due_relative.tomorrow");
    else dueLabel = renderFormattedDate(dueDate) ?? null;
  }

  return (
    // the timer button sits inside the row, so the row can't be a <button>
    // oxlint-disable-next-line jsx_a11y/click-events-have-key-events, jsx_a11y/no-static-element-interactions
    <div
      className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-layer-transparent-hover"
      onClick={() =>
        workItem.project_id && setPeekIssue({ workspaceSlug, projectId: workItem.project_id, issueId: workItem.id })
      }
    >
      <Tooltip tooltipContent={state?.name ?? workItem.state__group ?? ""} renderByDefault={false}>
        <span className="flex flex-shrink-0 items-center">
          <StateGroupIcon
            stateGroup={state?.group ?? workItem.state__group ?? "backlog"}
            color={state?.color}
            className="size-4"
            percentage={state?.order}
          />
        </span>
      </Tooltip>
      <span className="flex-shrink-0 text-13 font-medium whitespace-nowrap text-placeholder">
        {projectIdentifier}-{workItem.sequence_id}
      </span>
      <span className="min-w-0 flex-1 truncate text-13 text-primary">{workItem.name}</span>
      {dueLabel && (
        <span
          className={cn("flex-shrink-0 text-11 font-medium whitespace-nowrap text-tertiary", {
            "text-danger-primary": urgency === "overdue",
            "text-warning-primary": urgency === "today",
          })}
        >
          {dueLabel}
        </span>
      )}
      <PriorityIcon priority={workItem.priority} withContainer size={12} />
      {showTimer && workItem.project_id && (
        // keep the timer's click from opening the peek view
        // oxlint-disable-next-line jsx_a11y/click-events-have-key-events, jsx_a11y/no-static-element-interactions
        <span className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <WorkItemTimerButton workspaceSlug={workspaceSlug} projectId={workItem.project_id} issueId={workItem.id} />
        </span>
      )}
    </div>
  );
});

/** Home widget: the current user's open work items, most urgent first. */
export const AssignedWorkWidget = observer(function AssignedWorkWidget({ workspaceSlug }: THomeWidgetProps) {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { issueMap } = useIssues();
  const { getStateById } = useProjectState();
  const { canView: canTrackTime } = useTimeTrackingPermissions(workspaceSlug);
  // derived values
  const userId = currentUser?.id;
  const today = getTodayISODate(currentUser?.user_timezone);

  const { data, isLoading } = useSWR(
    userId ? `HOME_ASSIGNED_WORK_${workspaceSlug}_${userId}` : null,
    userId
      ? () =>
          userService.getUserProfileIssues(workspaceSlug, userId, {
            assignees: userId,
            state_group: OPEN_STATE_GROUPS.join(","),
            order_by: "target_date",
            per_page: PER_PAGE,
          })
      : null,
    { revalidateOnFocus: true, revalidateIfStale: true }
  );

  const fetched = Array.isArray(data?.results) ? (data.results as TIssue[]) : [];
  const seen = new Set<string>();
  const workItems: TIssue[] = [];
  for (const fetchedItem of fetched) {
    if (seen.has(fetchedItem.id)) continue;
    seen.add(fetchedItem.id);
    // edits made in the peek view land in the issue store, so prefer its copy
    const workItem: TIssue = { ...fetchedItem, ...issueMap[fetchedItem.id] };
    const stateGroup = getStateById(workItem.state_id)?.group ?? workItem.state__group;
    if (stateGroup && !OPEN_STATE_GROUPS.includes(stateGroup)) continue;
    if (workItem.assignee_ids && userId && !workItem.assignee_ids.includes(userId)) continue;
    if (workItem.archived_at) continue;
    workItems.push(workItem);
  }
  const groups = groupWorkItemsByUrgency(workItems, today);
  const totalCount = data?.total_count ?? 0;

  return (
    <ContentOverflowWrapper
      maxHeight={415}
      containerClassName="box-border"
      fallback={<></>}
      buttonClassName="bg-surface-2/20"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-14 font-semibold text-tertiary">{t("home.assigned_work.title")}</div>
        {userId && (
          <Link
            href={`/${workspaceSlug}/profile/${userId}/assigned`}
            className="text-13 font-medium text-tertiary hover:text-primary hover:underline"
          >
            {t("home.assigned_work.view_all")}
          </Link>
        )}
      </div>
      {isLoading ? (
        <WidgetLoader widgetKey={EWidgetKeys.RECENT_ACTIVITY} />
      ) : groups.length === 0 ? (
        <div className="py-6 text-center text-13 text-tertiary">{t("home.assigned_work.empty")}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <div key={group.urgency}>
              <div
                className={cn("flex items-center gap-1.5 px-2 pb-1 text-11 font-medium tracking-wide uppercase", {
                  "text-danger-primary": group.urgency === "overdue",
                  "text-warning-primary": group.urgency === "today",
                  "text-tertiary": group.urgency !== "overdue" && group.urgency !== "today",
                })}
              >
                {t(`home.assigned_work.groups.${group.urgency}`)}
                <span className="text-placeholder">{group.workItems.length}</span>
              </div>
              {group.workItems.map((workItem) => (
                <AssignedWorkItemRow
                  key={workItem.id}
                  workItem={workItem}
                  workspaceSlug={workspaceSlug}
                  today={today}
                  urgency={group.urgency}
                  showTimer={canTrackTime}
                />
              ))}
            </div>
          ))}
          {totalCount > fetched.length && (
            <div className="px-2 text-11 text-placeholder">
              {t("home.assigned_work.showing", { shown: fetched.length, total: totalCount })}
            </div>
          )}
        </div>
      )}
    </ContentOverflowWrapper>
  );
});
