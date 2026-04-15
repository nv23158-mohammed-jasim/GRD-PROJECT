import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type EntryInput } from "@shared/routes";
import { apiRequest } from "@/lib/queryClient";

// GET /api/entries
export function useEntries() {
  return useQuery({
    queryKey: [api.entries.list.path],
    queryFn: async () => {
      const res = await apiRequest("GET", api.entries.list.path);
      return api.entries.list.responses[200].parse(await res.json());
    },
  });
}

// POST /api/entries
export function useCreateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: EntryInput) => {
      const validated = api.entries.create.input.parse(data);
      const res = await apiRequest("POST", api.entries.create.path, validated);
      return api.entries.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.entries.list.path] });
    },
  });
}

// DELETE /api/entries/:id
export function useDeleteEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.entries.delete.path, { id });
      await apiRequest("DELETE", url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.entries.list.path] });
    },
  });
}
