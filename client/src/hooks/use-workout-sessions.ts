import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { WorkoutSession, CreateWorkoutSessionRequest } from "@shared/schema";

export function useWorkoutSessions() {
  return useQuery<WorkoutSession[]>({
    queryKey: ["/api/workout-sessions"],
  });
}

export function useCreateWorkoutSession() {
  return useMutation({
    mutationFn: async (session: CreateWorkoutSessionRequest) => {
      const res = await apiRequest("POST", "/api/workout-sessions", session);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workout-sessions"] });
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
