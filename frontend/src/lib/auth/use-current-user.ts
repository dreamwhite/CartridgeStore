"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiRequestError } from "../api/client";
import { CURRENT_USER_QUERY_KEY, getCurrentUser } from "../api/auth";
import { authIntegrationEnabled } from "./config";

async function currentUserOrAnonymous() {
  try {
    return await getCurrentUser();
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}

export function useCurrentUser(enabled = authIntegrationEnabled) {
  const query = useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: currentUserOrAnonymous,
    enabled,
    retry: false,
    staleTime: 30_000,
  });

  return {
    ...query,
    user: query.data?.user ?? null,
  };
}

export function useAuthQueryClient() {
  return useQueryClient();
}
