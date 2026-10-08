/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { Play, Plus, Square } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TTimeEntry, THomeWidgetProps } from "@plane/types";
import {
  addDaysToISODate,
  formatTimeDuration,
  getElapsedSeconds,
  getTodayISODate,
  getWeekStartDate,
} from "@plane/utils";
// components
import { getEntryTitle } from "@/components/time-tracking/helpers";
import { ElapsedTime, useNow } from "@/components/time-tracking/timer/elapsed-time";
// hooks
import { useTimer } from "@/hooks/store/use-timer";
import { useUser, useUserProfile } from "@/hooks/store/user";
import { useTimeSummary } from "@/hooks/time-tracking/use-time-summary";
import { useTimeTrackingPermissions } from "@/hooks/time-tracking/use-time-tracking-permissions";
import { useTimerActions } from "@/hooks/time-tracking/use-timer-actions";

type TTotalCardProps = {
  label: string;
  /** completed time in the range, from the summary API (which leaves out the running timer) */
  loggedSeconds: number | undefined;
  /** the running timer, when it counts towards this range */
  runningTimer: TTimeEntry | null;
  clockOffsetMs: number;
};

/** A total that keeps counting while the timer runs, so it re-renders on its own every second. */
function TotalCard({ label, loggedSeconds, runningTimer, clockOffsetMs }: TTotalCardProps) {
  const now = useNow(runningTimer ? 1000 : 60_000);
  const runningSeconds = runningTimer?.started_at ? getElapsedSeconds(runningTimer.started_at, now, clockOffsetMs) : 0;
  return (
    <div className="flex flex-col gap-1 rounded-md border-[0.5px] border-subtle bg-layer-1 p-4">
      <span className="text-13 text-tertiary">{label}</span>
      <span className="text-20 font-semibold text-primary tabular-nums">
        {loggedSeconds === undefined ? "–" : formatTimeDuration(loggedSeconds + runningSeconds)}
      </span>
    </div>
  );
}

/** Home widget: the running timer, and the current user's time logged today and this week. */
export const TimeTrackingWidget = observer(function TimeTrackingWidget({ workspaceSlug }: THomeWidgetProps) {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { data: profile } = useUserProfile();
  const { canView } = useTimeTrackingPermissions(workspaceSlug);
  const { runningTimer, clockOffsetMs, openLogTimeModal, setStartPopoverOpen } = useTimer();
  const { stop } = useTimerActions(workspaceSlug);
  const [isStopping, setIsStopping] = useState(false);
  // derived values
  const userId = currentUser?.id;
  const today = getTodayISODate(currentUser?.user_timezone);
  const weekStart = getWeekStartDate(today, profile?.start_of_the_week ?? 0);
  const weekEnd = addDaysToISODate(weekStart, 6);
  const isEnabled = canView && !!userId;

  const { summary: todaySummary } = useTimeSummary(
    workspaceSlug,
    isEnabled ? { date_from: today, date_to: today, user_ids: [userId] } : null
  );
  const { summary: weekSummary } = useTimeSummary(
    workspaceSlug,
    isEnabled ? { date_from: weekStart, date_to: weekEnd, user_ids: [userId] } : null
  );

  // Guests don't see time tracking
  if (!isEnabled) return null;

  const timer = runningTimer?.started_at ? { ...runningTimer, started_at: runningTimer.started_at } : null;
  const handleStop = async () => {
    setIsStopping(true);
    await stop();
    setIsStopping(false);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-14 font-semibold text-tertiary">{t("home.time_tracking.title")}</div>
        <Link
          href={`/${workspaceSlug}/time-tracking/`}
          className="text-13 font-medium text-tertiary hover:text-primary hover:underline"
        >
          {t("home.time_tracking.open")}
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="col-span-2 flex items-center gap-3 rounded-md border-[0.5px] border-subtle bg-layer-1 p-4">
          {timer ? (
            <>
              <span className="relative flex size-2.5 flex-shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-primary opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-accent-primary" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <ElapsedTime
                  startedAt={timer.started_at}
                  clockOffsetMs={clockOffsetMs}
                  className="text-20 font-semibold text-primary"
                />
                <span className="truncate text-13 text-tertiary" title={getEntryTitle(timer)}>
                  {getEntryTitle(timer)}
                </span>
              </div>
              <Button
                variant="secondary"
                size="lg"
                prependIcon={<Square className="fill-current" />}
                onClick={() => void handleStop()}
                loading={isStopping}
                disabled={isStopping}
              >
                {t("time-tracking.timer.stop_short")}
              </Button>
            </>
          ) : (
            <>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-20 font-semibold text-placeholder tabular-nums">0:00:00</span>
                <span className="truncate text-13 text-tertiary">{t("home.time_tracking.no_timer")}</span>
              </div>
              <Button variant="secondary" size="lg" prependIcon={<Plus />} onClick={() => openLogTimeModal()}>
                {t("time-tracking.log_time.title_create")}
              </Button>
              <Button variant="primary" size="lg" prependIcon={<Play />} onClick={() => setStartPopoverOpen(true)}>
                {t("time-tracking.timer.start_short")}
              </Button>
            </>
          )}
        </div>
        <TotalCard
          label={t("home.time_tracking.today")}
          loggedSeconds={todaySummary?.total_seconds}
          runningTimer={timer && timer.spent_on === today ? timer : null}
          clockOffsetMs={clockOffsetMs}
        />
        <TotalCard
          label={t("home.time_tracking.this_week")}
          loggedSeconds={weekSummary?.total_seconds}
          runningTimer={timer && timer.spent_on >= weekStart && timer.spent_on <= weekEnd ? timer : null}
          clockOffsetMs={clockOffsetMs}
        />
      </div>
    </div>
  );
});
