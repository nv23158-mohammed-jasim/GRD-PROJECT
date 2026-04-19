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
import { Search, ArrowLeft, Users, Dumbbell, Gamepad2, Swords, Heart, RefreshCw, UserCheck, Mail, Chrome, Trash2, ClipboardList, Download, Database, ArrowUpDown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type TableFilter = "all" | "bmi" | "workout" | "game" | "boxing" | "users" | "audit";

const TABLE_TABS: { key: TableFilter; label: string; icon: React.ReactNode; color: string }[] = [
  { key: "all", label: "All Records", icon: <Users size={14} />, color: "bg-gray-700" },
  { key: "users", label: "Users", icon: <UserCheck size={14} />, color: "bg-green-700" },
  { key: "bmi", label: "BMI", icon: <Heart size={14} />, color: "bg-purple-700" },
  { key: "workout", label: "Workout", icon: <Dumbbell size={14} />, color: "bg-red-700" },
  { key: "game", label: "Neon Run", icon: <Gamepad2 size={14} />, color: "bg-blue-700" },
  { key: "boxing", label: "Boxing", icon: <Swords size={14} />, color: "bg-orange-700" },
  { key: "audit", label: "Audit Log", icon: <ClipboardList size={14} />, color: "bg-slate-700" },
];

function formatDate(d: string) {
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function ActivityCounts({ user }: { user: Record<string, unknown> }) {
  const workout = Number(user.workout_count ?? 0);
  const bmi = Number(user.bmi_count ?? 0);
  const game = Number(user.game_count ?? 0);
  const boxing = Number(user.boxing_count ?? 0);
  const total = workout + bmi + game + boxing;

  if (total === 0) {
    return <span className="text-gray-600 text-xs italic">no activity</span>;
  }

  const parts: { label: string; value: number; color: string }[] = [
    { label: "workout", value: workout, color: "text-red-400" },
    { label: "BMI", value: bmi, color: "text-purple-400" },
    { label: "game", value: game, color: "text-blue-400" },
    { label: "boxing", value: boxing, color: "text-orange-400" },
  ].filter(p => p.value > 0);

  return (
    <span className="text-xs text-gray-500 flex items-center gap-1">
      <span className="text-gray-700">·</span>
      {parts.map((p, i) => (
        <span key={p.label}>
          <strong className={p.color}>{p.value}</strong>{" "}
          <span>{p.label}{p.value !== 1 ? "s" : ""}</span>
          {i < parts.length - 1 && <span className="text-gray-700 mx-0.5">·</span>}
        </span>
      ))}
    </span>
  );
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
  const methodLabel = method === "email" ? "Email" : method === "microsoft" ? "Microsoft" : "Google";
  const methodColor = method === "email"
    ? "bg-blue-900 text-blue-300"
    : method === "microsoft"
    ? "bg-cyan-900 text-cyan-300"
    : "bg-red-900 text-red-300";
  const MethodIcon = method === "email" ? Mail : Chrome;

  const displayName = String(user.name || "").trim() || String(user.email || "").split("@")[0] || "Unknown";

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-600 transition-colors">
      {user.picture ? (
        <img src={String(user.picture)} alt="" className="w-8 h-8 rounded-full shrink-0" />
      ) : (
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${method === "email" ? "bg-blue-900" : "bg-gray-700"}`}>
          <span className="text-gray-200 text-sm font-bold">{displayName[0].toUpperCase()}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white font-medium text-sm">{displayName}</span>
          <span className="text-gray-400 text-xs truncate">{String(user.email || "—")}</span>
          {isOwn && <span className="text-yellow-500 text-xs">(you)</span>}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <Badge className={`text-xs px-1.5 py-0 flex items-center gap-1 ${methodColor}`}>
            <MethodIcon size={10} />
            {methodLabel}
          </Badge>
          <ActivityCounts user={user} />
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

interface AuditLogEntry {
  id: number;
  action: string;
  adminId: string;
  adminEmail: string;
  targetUserId: string;
  targetUserEmail: string;
  targetUserName: string;
  recordsRemoved: number;
  timestamp: string;
}

function AuditLogRow({ entry }: { entry: AuditLogEntry }) {
  const isDelete = entry.action === "delete_user";
  const isBackfill = entry.action === "backfill";
  const isOrphan = entry.action === "claim_orphans";

  const ActionIcon = isDelete ? Trash2 : isBackfill ? RefreshCw : Database;
  const iconColor = isDelete ? "text-red-400" : isBackfill ? "text-yellow-400" : "text-cyan-400";
  const actionLabel = isDelete ? "Deleted user"
    : isBackfill ? "Ran backfill"
    : isOrphan ? "Claimed orphans"
    : entry.action;

  return (
    <div
      data-testid={`audit-log-entry-${entry.id}`}
      className="flex items-start gap-3 p-3 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-600 transition-colors"
    >
      <div className="shrink-0 mt-0.5">
        <ActionIcon size={14} className={iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {isDelete ? (
            <>
              <span className="text-white font-medium text-sm">{entry.targetUserName}</span>
              <span className="text-gray-400 text-xs truncate">{entry.targetUserEmail}</span>
              <span className="text-gray-600 text-xs">·</span>
              <span className="text-gray-500 text-xs">{entry.recordsRemoved} record{entry.recordsRemoved !== 1 ? "s" : ""} removed</span>
            </>
          ) : (
            <span className="text-white font-medium text-sm">{entry.targetUserName}</span>
          )}
        </div>
        <p className="text-gray-500 text-xs mt-0.5">
          {actionLabel} by <span className="text-gray-400">{entry.adminEmail}</span>
        </p>
      </div>
      <span data-testid={`audit-log-timestamp-${entry.id}`} className="text-gray-500 text-xs shrink-0">{formatDate(entry.timestamp)}</span>
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
  const [methodFilter, setMethodFilter] = useState<"all" | "google" | "email">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "most-active">("newest");
  const [auditSearch, setAuditSearch] = useState("");

  const { toast } = useToast();

  const { data: adminCheck, isLoading: adminCheckLoading } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
    queryFn: () => apiRequest("GET", "/api/admin/check").then(r => r.json()),
    enabled: !!user,
    retry: false,
  });

  const isAdmin = adminCheck?.isAdmin === true;

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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/audit-log"] });
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
    enabled: isAdmin && table !== "users" && table !== "audit",
  });

  const { data: allUsers = [], isLoading: usersLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () => apiRequest("GET", "/api/admin/users").then(r => r.json()),
    enabled: isAdmin && table === "users",
  });

  const { data: auditLogs = [], isLoading: auditLoading } = useQuery<AuditLogEntry[]>({
    queryKey: ["/api/admin/audit-log"],
    queryFn: () => apiRequest("GET", "/api/admin/audit-log").then(r => r.json()),
    enabled: isAdmin && table === "audit",
  });

  const { data: counts } = useQuery<Record<string, number | string>>({
    queryKey: ["/api/admin/counts"],
    queryFn: () => apiRequest("GET", "/api/admin/counts").then(r => r.json()),
    enabled: isAdmin,
    staleTime: 30_000,
  });

  if (adminCheckLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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

  function exportActivityCSV() {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const date = (d: unknown) => d ? new Date(String(d)).toISOString() : "";

    let headers: string[];
    let rows: string[][];

    if (table === "bmi") {
      headers = ["Name", "Email", "BMI", "Category", "Gender", "Age", "Height (cm)", "Weight (kg)", "Date"];
      rows = records.map(r => [
        String(r.user_name ?? ""), String(r.user_email ?? ""),
        String(r.bmi ?? ""), String(r.category ?? ""), String(r.gender ?? ""),
        String(r.age ?? ""), String(r.height_cm ?? ""), String(r.weight_kg ?? ""),
        date(r.date),
      ]);
    } else if (table === "workout") {
      headers = ["Name", "Email", "Exercise Type", "Difficulty", "Completed Reps", "Target Reps", "Grade", "Date"];
      rows = records.map(r => [
        String(r.user_name ?? ""), String(r.user_email ?? ""),
        String(r.exercise_type ?? ""), String(r.difficulty ?? ""),
        String(r.completed_reps ?? ""), String(r.target_reps ?? ""),
        String(r.grade ?? ""), date(r.date),
      ]);
    } else if (table === "game") {
      headers = ["Name", "Email", "Stage", "Score", "Target Score", "Difficulty", "Completed", "Date"];
      rows = records.map(r => [
        String(r.user_name ?? ""), String(r.user_email ?? ""),
        String(r.stage ?? ""), String(r.score ?? ""), String(r.target_score ?? ""),
        String(r.difficulty ?? ""), r.completed ? "Yes" : "No",
        date(r.date),
      ]);
    } else if (table === "boxing") {
      headers = ["Name", "Email", "Round", "Total Rounds", "Score", "Punches Landed", "Dodges", "Blocks", "Date"];
      rows = records.map(r => [
        String(r.user_name ?? ""), String(r.user_email ?? ""),
        String(r.round ?? ""), String(r.total_rounds ?? ""), String(r.score ?? ""),
        String(r.punches_landed ?? ""), String(r.dodges_successful ?? ""),
        String(r.blocks_successful ?? ""), date(r.date),
      ]);
    } else {
      // "all" tab — include record_type + common + type-specific fields
      headers = ["Type", "Name", "Email", "BMI", "Category", "Gender", "Age", "Height (cm)", "Weight (kg)", "Exercise Type", "Difficulty", "Completed Reps", "Target Reps", "Grade", "Stage", "Score", "Target Score", "Completed", "Round", "Total Rounds", "Punches Landed", "Dodges", "Blocks", "Date"];
      rows = records.map(r => [
        String(r.record_type ?? ""), String(r.user_name ?? ""), String(r.user_email ?? ""),
        String(r.bmi ?? ""), String(r.category ?? ""), String(r.gender ?? ""),
        String(r.age ?? ""), String(r.height_cm ?? ""), String(r.weight_kg ?? ""),
        String(r.exercise_type ?? ""), String(r.difficulty ?? ""),
        String(r.completed_reps ?? ""), String(r.target_reps ?? ""), String(r.grade ?? ""),
        String(r.stage ?? ""), String(r.score ?? ""), String(r.target_score ?? ""),
        r.completed != null ? (r.completed ? "Yes" : "No") : "",
        String(r.round ?? ""), String(r.total_rounds ?? ""),
        String(r.punches_landed ?? ""), String(r.dodges_successful ?? ""),
        String(r.blocks_successful ?? ""), date(r.date),
      ]);
    }

    const csv = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix = activeSearch ? `-filtered` : "";
    a.download = `${table}-records${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const headers = ["Name", "Email", "Login Method", "Signup Date", "Workout Count", "BMI Count", "Game Count", "Boxing Count"];
    const rows = filteredUsers.map(u => [
      String(u.name ?? ""),
      String(u.email ?? ""),
      String(u.login_method ?? "google"),
      u.created_at ? new Date(String(u.created_at)).toISOString().slice(0, 10) : "",
      String(u.workout_count ?? 0),
      String(u.bmi_count ?? 0),
      String(u.game_count ?? 0),
      String(u.boxing_count ?? 0),
    ]);
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const methodSuffix = methodFilter !== "all" ? `-${methodFilter}` : "";
    const dateSuffix = dateFrom || dateTo
      ? `-${dateFrom || "start"}_${dateTo || "end"}`
      : `-${new Date().toISOString().slice(0, 10)}`;
    a.download = `users${methodSuffix}${dateSuffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const filteredUsers = allUsers.filter(u => {
    if (activeSearch) {
      const q = activeSearch.toLowerCase();
      if (!String(u.name).toLowerCase().includes(q) && !String(u.email).toLowerCase().includes(q)) return false;
    }
    if (methodFilter !== "all" && String(u.login_method || "google") !== methodFilter) return false;
    if (dateFrom || dateTo) {
      if (!u.created_at) return false;
      const signedUp = new Date(String(u.created_at)).getTime();
      if (dateFrom && signedUp < new Date(dateFrom + "T00:00:00.000Z").getTime()) return false;
      if (dateTo   && signedUp > new Date(dateTo   + "T23:59:59.999Z").getTime()) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === "newest") {
      return new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime();
    }
    if (sortBy === "oldest") {
      return new Date(String(a.created_at || 0)).getTime() - new Date(String(b.created_at || 0)).getTime();
    }
    const totalA = Number(a.workout_count ?? 0) + Number(a.bmi_count ?? 0) + Number(a.game_count ?? 0) + Number(a.boxing_count ?? 0);
    const totalB = Number(b.workout_count ?? 0) + Number(b.bmi_count ?? 0) + Number(b.game_count ?? 0) + Number(b.boxing_count ?? 0);
    return totalB - totalA;
  });

  const auditQuery = auditSearch.toLowerCase();
  const filteredAuditLogs = auditLogs.filter(e =>
    !auditQuery ||
    e.adminEmail.toLowerCase().includes(auditQuery) ||
    e.targetUserEmail.toLowerCase().includes(auditQuery) ||
    e.targetUserName.toLowerCase().includes(auditQuery) ||
    e.action.toLowerCase().includes(auditQuery)
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
              : table === "audit"
              ? `${filteredAuditLogs.length}${auditSearch ? ` of ${auditLogs.length}` : ""} action${auditLogs.length !== 1 ? "s" : ""} logged`
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

        {/* Date range filter — only shown on Users tab */}
        {table === "users" && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-500 text-xs">Joined:</span>
            <input
              type="date"
              data-testid="input-date-from"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              max={dateTo || undefined}
              className="bg-gray-900 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-green-600"
            />
            <span className="text-gray-600 text-xs">to</span>
            <input
              type="date"
              data-testid="input-date-to"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              className="bg-gray-900 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-green-600"
            />
            {(dateFrom || dateTo) && (
              <button
                data-testid="button-clear-dates"
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Export CSV — shown on activity tabs (not users, not audit) */}
        {table !== "users" && table !== "audit" && (
          <div className="flex justify-end">
            <Button
              data-testid="button-export-activity-csv"
              size="sm"
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-800 gap-1.5 text-xs"
              onClick={exportActivityCSV}
              disabled={records.length === 0 || isLoading}
            >
              <Download size={13} />
              Export CSV
            </Button>
          </div>
        )}

        {/* Sort + login method filter + CSV export — only shown on Users tab */}
        {table === "users" && (
          <div className="flex items-center gap-2 flex-wrap">
            <ArrowUpDown size={13} className="text-gray-500 shrink-0" />
            {(["newest", "oldest", "most-active"] as const).map(s => (
              <button
                key={s}
                data-testid={`sort-${s}`}
                onClick={() => setSortBy(s)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  sortBy === s
                    ? "bg-green-800 text-white"
                    : "bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-800"
                }`}
              >
                {s === "newest" ? "Newest" : s === "oldest" ? "Oldest" : "Most Active"}
              </button>
            ))}
          </div>
        )}

        {/* Login method filter + CSV export — only shown on Users tab */}
        {table === "users" && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-500 text-xs">Filter:</span>
            {(["all", "google", "email"] as const).map(m => (
              <button
                key={m}
                data-testid={`filter-method-${m}`}
                onClick={() => setMethodFilter(m)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  methodFilter === m
                    ? m === "google" ? "bg-red-800 text-white"
                      : m === "email" ? "bg-blue-800 text-white"
                      : "bg-gray-600 text-white"
                    : "bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-800"
                }`}
              >
                {m === "all" ? "All" : m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
            <div className="flex-1" />
            <Button
              data-testid="button-export-csv"
              size="sm"
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-800 gap-1.5 text-xs"
              onClick={exportCSV}
              disabled={filteredUsers.length === 0}
            >
              <Download size={13} />
              Export CSV
            </Button>
          </div>
        )}

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

        {/* Audit search — only shown on audit tab */}
        {table === "audit" && !auditLoading && auditLogs.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                data-testid="input-audit-search"
                type="text"
                placeholder="Filter by admin, user, or action…"
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 pl-7 focus:outline-none focus:border-slate-500"
              />
            </div>
            {auditSearch && (
              <button
                data-testid="button-clear-audit-search"
                onClick={() => setAuditSearch("")}
                className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Audit log list */}
        {table === "audit" && (
          auditLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No actions recorded yet.</div>
          ) : filteredAuditLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No entries match "{auditSearch}".</div>
          ) : (
            <div className="space-y-2" data-testid="audit-log-list">
              {filteredAuditLogs.map(entry => (
                <AuditLogRow key={entry.id} entry={entry} />
              ))}
            </div>
          )
        )}

        {/* Activity records list */}
        {table !== "users" && table !== "audit" && (
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
