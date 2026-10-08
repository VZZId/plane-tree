# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from ..base import BaseAPIView
from plane.db.models.workspace import WorkspaceHomePreference
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Workspace
from plane.app.serializers.workspace import WorkspaceHomePreferenceSerializer

# Third party imports
from rest_framework.response import Response
from rest_framework import status


class WorkspaceHomePreferenceViewSet(BaseAPIView):
    model = WorkspaceHomePreference

    def get_serializer_class(self):
        return WorkspaceHomePreferenceSerializer

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        get_preference = WorkspaceHomePreference.objects.filter(user=request.user, workspace_id=workspace.id)

        existing_sort_orders = dict(get_preference.values_list("key", "sort_order"))

        keys = [
            key
            for key, _ in WorkspaceHomePreference.HomeWidgetKeys.choices
            if key not in ["quick_tutorial", "new_at_plane"]
        ]
        missing_keys = [key for key in keys if key not in existing_sort_orders]

        # Widgets are shown highest sort_order first. Missing widgets go above the ones the user
        # already has (so a newly added widget shows up at the top), in HomeWidgetKeys order.
        top_sort_order = max(existing_sort_orders.values(), default=999)
        WorkspaceHomePreference.objects.bulk_create(
            [
                WorkspaceHomePreference(
                    key=key,
                    user=request.user,
                    workspace=workspace,
                    sort_order=top_sort_order + len(missing_keys) - index,
                )
                for index, key in enumerate(missing_keys)
            ],
            batch_size=10,
            ignore_conflicts=True,
        )

        preference = WorkspaceHomePreference.objects.filter(user=request.user, workspace_id=workspace.id)

        return Response(
            preference.values("key", "is_enabled", "config", "sort_order"),
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def patch(self, request, slug, key):
        preference = WorkspaceHomePreference.objects.filter(key=key, workspace__slug=slug, user=request.user).first()

        if preference:
            serializer = WorkspaceHomePreferenceSerializer(preference, data=request.data, partial=True)

            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        return Response({"detail": "Preference not found"}, status=status.HTTP_400_BAD_REQUEST)
