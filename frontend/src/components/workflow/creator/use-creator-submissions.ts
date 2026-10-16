"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listMySubmissions, resubmitSubmission } from "../../../lib/api/workflow";
import { workflowQueryKeys } from "../../../lib/api/query-keys";

export function useCreatorSubmissions(page: number, enabled: boolean) {
  const queryClient = useQueryClient();
  const submissions = useQuery({
    queryKey: workflowQueryKeys.mine(page),
    queryFn: () => listMySubmissions(undefined, page, 25),
    enabled,
    retry: false,
  });
  const resubmit = useMutation({
    mutationFn: resubmitSubmission,
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowQueryKeys.mineRoot() });
      void queryClient.invalidateQueries({ queryKey: workflowQueryKeys.drafts() });
    },
  });

  return { submissions, resubmit };
}
