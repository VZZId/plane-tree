# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.urls import reverse
from rest_framework import status

from plane.db.models.workspace import WorkspaceHomePreference

HIDDEN_KEYS = {"quick_tutorial", "new_at_plane"}
VISIBLE_KEYS = [key for key, _ in WorkspaceHomePreference.HomeWidgetKeys.choices if key not in HIDDEN_KEYS]


def ordered_keys(response):
    """Widget keys in display order (highest sort_order first, as the web app shows them)."""
    return [row["key"] for row in sorted(response.data, key=lambda row: row["sort_order"], reverse=True)]


@pytest.mark.contract
class TestWorkspaceHomePreferenceGet:
    @pytest.mark.django_db
    def test_new_user_gets_every_widget_in_key_order(self, session_client, workspace):
        url = reverse("workspace-home-preference", kwargs={"slug": workspace.slug})

        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert ordered_keys(response) == VISIBLE_KEYS
        assert all(row["is_enabled"] for row in response.data)
        assert len({row["sort_order"] for row in response.data}) == len(VISIBLE_KEYS)

    @pytest.mark.django_db
    def test_widgets_added_later_go_above_existing_ones(self, session_client, create_user, workspace):
        # a user whose preferences predate the time tracking and assigned work widgets
        for sort_order, key in ((999, "quick_links"), (998, "recents"), (997, "my_stickies")):
            WorkspaceHomePreference.objects.create(
                workspace=workspace, user=create_user, key=key, sort_order=sort_order
            )
        url = reverse("workspace-home-preference", kwargs={"slug": workspace.slug})

        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert ordered_keys(response) == ["time_tracking", "assigned_work", "quick_links", "recents", "my_stickies"]

    @pytest.mark.django_db
    def test_existing_preferences_are_left_alone(self, session_client, create_user, workspace):
        url = reverse("workspace-home-preference", kwargs={"slug": workspace.slug})
        session_client.get(url)
        WorkspaceHomePreference.objects.filter(user=create_user, key="recents").update(
            is_enabled=False, sort_order=5000
        )

        response = session_client.get(url)

        assert len(response.data) == len(VISIBLE_KEYS)
        recents = next(row for row in response.data if row["key"] == "recents")
        assert recents["is_enabled"] is False
        assert recents["sort_order"] == 5000
