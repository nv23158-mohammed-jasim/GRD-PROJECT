import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, ArrowLeft, Users, Dumbbell, Gamepad2, Swords, Heart, RefreshCw, UserCheck, Mail, Chrome, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const ADMIN_EMAIL = "mohammednv23158@gmail.com";

type TableFilter = "all" | "bmi" | "workout" | "game" | "boxing" | "users";

const TABLE_TABS: { key: TableFilter; label: string; icon: React.ReactNode; color: string }[] = [
  { key: "all", label: "All Records", icon: <Users size={14} />, color: "bg-gray-700" },
  { key: "users", label: "Users", icon: <UserCheck size={14} />, color: "bg-green-700" },
  { key: "bmi", label: "BMI", icon: <Heart size={14} />, color: "bg-purple-700" },
  { key: "workout", label: "Workout", icon: <Dumbbell size={14} />, color: "bg-red-700" },
  { key: "game", label: "Neon Run", icon: <Gamepad2 size={14} />, color: "bg-blue-700" },
  { key: "boxing", label: "Boxing", icon: <Swords size={14} />, color: "bg-orange-700" },
];

function formatDate(d: string) {
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function UserRow({
  user,
  isOwn,
  onDelete,
  isDeleting,
}: {
  user: Record<string, unknown>;
  isOwn: boolean;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const method = String(user.login_method || "google");
  const methodColor = method === "email"
    ? "bg-blue-900 text-blue-300"
    : method === "microsoft"
    ? "bg-cyan-900 text-cyan-300"
    : "bg-red-900 text-red-300";
  const MethodIcon = method === "email" ? Mail : Chrome;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-600 transition-colors">
      {user.picture ? (
        <img src={String(user.picture)} alt="" className="w-8 h-8 rounded-full shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center shrink-0">
          <span className="text-gray-300 text-sm font-bold">{String(user.name || "?")[0].toUpperCase()}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white font-medium text-sm">{String(user.name || "—")}</span>
          <span className="text-gray-400 text-xs truncate">{String(user.email || "—")}</span>
          {isOwn && <span className="text-yellow-500 text-xs">(you)</span>}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge className={`text-xs px-1.5 py-0 flex items-center gap-1 ${methodColor}`}>
            <MethodIcon size={10} />
            {method}
          </Badge>
          {user.has_password && (
            <span className="text-gray-500 text-xs">password set</span>
          )}
        </div>
      </div>
      <span className="text-gray-500 text-xs shrink-0 mr-2">{formatDate(String(user.created_at))}</span>
      {!isOwn && (
        <button
          data-testid={`button-delete-user-${user.id}`}
          onClick={onDelete}
          disabled={isDeleting}
          title="Delete user and all their records"
          className="shrink-0 p-1.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-950/40 transition-colors disabled:opacity-40"
        >
          {isDeleting ? (
            <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Trash2 size={15} />
          )}
        </button>
      )}
    </div>
  );
}

function RecordRow({ row }: { row: Record<string, unknown> }) {
  const type = row.record_type as string;
  const typeColors: Record<string, string> = {
    bmi: "bg-purple-900 text-purple-300",
    workout: "bg-red-900 text-red-300",
    game: "bg-blue-900 text-blue-300",
    boxing: "bg-orange-900 text-orange-300",
  };
  const detailColor = typeColors[type] || "bg-gray-800 text-gray-300";

  function getDetails() {
    if (type === "bmi") return `BMI ${row.bmi} · ${row.category} · ${row.gender} · Age ${row.age} · ${row.height_cm}cm / ${row.weight_kg}kg`;
    if (type === "workout") return `${String(row.exercise_type).toUpperCase()} · ${row.difficulty} · ${row.completed_reps}/${row.target_reps} reps · Grade ${row.grade}`;
    if (type === "game") return `Stage ${row.stage} · Score ${row.score}/${row.target_score} · ${row.difficulty} · ${row.completed ? "✓ Completed" : "✗ Failed"}`;
    if (type === "boxing") return `Round ${row.round}/${row.total_rounds} · Score ${row.score} · ${row.punches_landed}P ${row.dodges_successful}D ${row.blocks_successful}B`;
    return "";
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-600 transition-colors">
      <Badge className={`mt-0.5 text-xs uppercase shrink-0 ${detailColor}`}>{type}</Badge>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white font-medium text-sm truncate">{String(row.user_name || "Unknown")}</span>
          <span className="text-gray-400 text-xs truncate">{String(row.user_email || row.user_id || "—")}</span>
        </div>
        <p className="text-gray-400 text-xs mt-0.5">{getDetails()}</p>
      </div>
      <span className="text-gray-500 text-xs shrink-0">{formatDate(String(row.date))}</span>
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [table, setTable] = useState<TableFilter>("all");
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string; email: string } | null>(null);

  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const { toast } = useToast();

  const backfillMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/backfill").then(r => r.json()),
    onSuccess: (data: { updated: number; detail: Record<string, Record<string, unknown>> }) => {
      const lines = Object.entries(data.detail || {}).map(([tbl, d]) => {
        const info = d as Record<string, unknown>;
        if (info.error) return `${tbl}: ERROR — ${info.error}`;
        return `${tbl}: ${info.nullBefore} null → updated ${info.updated} → ${info.stillNull} remaining`;
      });
      toast({ title: `Backfill complete — ${data.updated} rows updated`, description: lines.join("\n") });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/search"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/counts"] });
    },
    onError: () => toast({ title: "Backfill failed", variant: "destructive" }),
  });

  const claimMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/claim-orphans").then(r => r.json()),
    onSuccess: (data: { claimed: number; detail: Record<string, Record<string, unknown>>; backfill: { updated: number } }) => {
      const lines = Object.entries(data.detail || {}).map(([tbl, d]) => {
        const info = d as Record<string, unknown>;
        if (info.error) return `${tbl}: ERROR — ${info.error}`;
        return `${tbl}: ${info.orphansBefore} orphans → claimed ${info.claimed}`;
      });
      toast({ title: `Claimed ${data.claimed} orphan records + backfilled ${data.backfill?.updated ?? 0}`, description: lines.join("\n") });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/search"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/counts"] });
    },
    onError: () => toast({ title: "Claim failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest("DELETE", `/api/admin/users/${encodeURIComponent(userId)}`).then(r => r.json()),
    onSuccess: (data: { deleted: boolean; recordsRemoved: number }) => {
      toast({
        title: "User deleted",
        description: `Account removed along with ${data.recordsRemoved} activity record${data.recordsRemoved !== 1 ? "s" : ""}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/counts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/search"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Delete failed";
      toast({ title: "Delete failed", description: msg, variant: "destructive" });
    },
  });

  const { data: records = [], isLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ["/api/admin/search", activeSearch, table],
    queryFn: () =>
      apiRequest("GET", `/api/admin/search?search=${encodeURIComponent(activeSearch)}&table=${table}`)
        .then(r => r.json()),
    enabled: isAdmin && table !== "users",
  });

  const { data: allUsers = [], isLoading: usersLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () => apiRequest("GET", "/api/admin/users").then(r => r.json()),
    enabled: isAdmin && table === "users",
  });

  const { data: counts } = useQuery<Record<string, number | string>>({
    queryKey: ["/api/admin/counts"],
    queryFn: () => apiRequest("GET", "/api/admin/counts").then(r => r.json()),
    enabled: isAdmin,
    staleTime: 30_000,
  });

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-xl font-bold">Access Denied</p>
          <p className="text-gray-400 mt-2">You don't have admin privileges.</p>
          <Button className="mt-4" onClick={() => navigate("/")}>Go Home</Button>
        </div>
      </div>
    );
  }

  const handleSearch = () => setActiveSearch(search);
  const filteredUsers = allUsers.filter(u =>
    !activeSearch ||
    String(u.name).toLowerCase().includes(activeSearch.toLowerCase()) ||
    String(u.email).toLowerCase().includes(activeSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Confirmation dialog */}
      <AlertDialog open={!!pendingDelete} onOpenChange={open => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent className="bg-gray-900 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              You are about to permanently delete <strong className="text-white">{pendingDelete?.name}</strong>{" "}
              ({pendingDelete?.email}). This will also remove all their workout, BMI, game, and boxing records.
              <br /><br />
              <span className="text-red-400 font-medium">This cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="button-cancel-delete"
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (pendingDelete) {
                  deleteMutation.mutate(pendingDelete.id);
                  setPendingDelete(null);
                }
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="border-b border-gray-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white transition-colors" data-testid="button-back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-red-500">Admin Panel</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button
            data-testid="button-claim-orphans"
            size="sm" variant="outline"
            className="border-green-700 text-green-400 hover:bg-green-900/30 gap-1.5 text-xs"
            onClick={() => claimMutation.mutate()}
            disabled={claimMutation.isPending}
          >
            <UserCheck size={13} className={claimMutation.isPending ? "animate-spin" : ""} />
            {claimMutation.isPending ? "Claiming…" : "Claim My Records"}
          </Button>
          <Button
            data-testid="button-backfill"
            size="sm" variant="outline"
            className="border-yellow-700 text-yellow-400 hover:bg-yellow-900/30 gap-1.5 text-xs"
            onClick={() => backfillMutation.mutate()}
            disabled={backfillMutation.isPending}
          >
            <RefreshCw size={13} className={backfillMutation.isPending ? "animate-spin" : ""} />
            {backfillMutation.isPending ? "Fixing…" : "Fix NULL Records"}
          </Button>
          <span className="text-gray-500 text-sm">
            {table === "users"
              ? `${filteredUsers.length} user${filteredUsers.length !== 1 ? "s" : ""}`
              : `${records.length} record${records.length !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      {/* DB totals bar */}
      {counts && (
        <div className="border-b border-gray-800 bg-gray-950 px-4 py-2 flex items-center gap-4 text-xs text-gray-400 flex-wrap">
          <span className="font-semibold text-gray-300">DB totals:</span>
          <span>BMI <strong className="text-purple-400">{counts.bmi}</strong></span>
          <span>Workout <strong className="text-red-400">{counts.workout}</strong></span>
          <span>Neon Run <strong className="text-blue-400">{counts.game}</strong></span>
          <span>Boxing <strong className="text-orange-400">{counts.boxing}</strong></span>
          <span>Users <strong className="text-green-400">{counts.users}</strong></span>
        </div>
      )}

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              data-testid="input-search"
              className="pl-9 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 focus:border-red-600"
              placeholder="Search by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
            />
          </div>
          <Button data-testid="button-search" onClick={handleSearch} className="bg-red-600 hover:bg-red-700 text-white">
            Search
          </Button>
          {activeSearch && (
            <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800"
              onClick={() => { setSearch(""); setActiveSearch(""); }}>
              Clear
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {TABLE_TABS.map(tab => (
            <button
              key={tab.key}
              data-testid={`tab-${tab.key}`}
              onClick={() => setTable(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                table === tab.key
                  ? `${tab.color} text-white`
                  : "bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-800"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Users list */}
        {table === "users" && (
          usersLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No users found.</div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((u, i) => (
                <UserRow
                  key={`user-${u.id}-${i}`}
                  user={u}
                  isOwn={String(u.id) === user?.id || String(u.email).toLowerCase() === (user?.email?.toLowerCase() ?? "")}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === String(u.id)}
                  onDelete={() => setPendingDelete({
                    id: String(u.id),
                    name: String(u.name || "Unknown"),
                    email: String(u.email || ""),
                  })}
                />
              ))}
            </div>
          )
        )}

        {/* Activity records list */}
        {table !== "users" && (
          isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {activeSearch ? `No records found for "${activeSearch}"` : "No records found."}
            </div>
          ) : (
            <div className="space-y-2">
              {records.map((row, i) => (
                <RecordRow key={`${row.record_type}-${row.id}-${i}`} row={row} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
