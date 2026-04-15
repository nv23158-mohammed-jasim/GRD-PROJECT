import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { BmiEntryResponse } from "@shared/schema";

export function useCreateBmiEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      age: number;
      heightCm: string;
      weightKg: string;
      bmi: string;
      category: string;
      gender: string;
      activityLevel: string;
      suggestedDifficulty: string;
    }): Promise<BmiEntryResponse> => {
      const res = await apiRequest("POST", "/api/bmi-entries", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bmi-entries"] });
    },
  });
}
