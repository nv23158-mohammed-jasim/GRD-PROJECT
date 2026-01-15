import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type EntryInput } from "@shared/routes";

// GET /api/entries
export function useEntries() {
  return useQuery({
    queryKey: [api.entries.list.path],
    queryFn: async () => {
      const res = await fetch(api.entries.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch entries");
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
      const res = await fetch(api.entries.create.path, {
        method: api.entries.create.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.entries.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error('Failed to create entry');
      }
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
      const res = await fetch(url, {
        method: api.entries.delete.method,
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 404) throw new Error('Entry not found');
        throw new Error('Failed to delete entry');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.entries.list.path] });
    },
  });
}
