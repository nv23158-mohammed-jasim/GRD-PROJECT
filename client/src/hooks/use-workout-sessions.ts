import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { WorkoutSession, CreateWorkoutSessionRequest } from "@shared/schema";

export function useWorkoutSessions() {
  return useQuery<WorkoutSession[]>({
    queryKey: ["/api/workout-sessions"],
    staleTime: 0,
    refetchOnMount: true,
  });
}

export function useCreateWorkoutSession() {
  return useMutation({
    mutationFn: async (session: CreateWorkoutSessionRequest) => {
      const res = await fetch("/api/workout-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session),
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/workout-sessions"] });
    },
  });
}

export function useDeleteWorkoutSession() {
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/workout-sessions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workout-sessions"] });
    },
  });
}
