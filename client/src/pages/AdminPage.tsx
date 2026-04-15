import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft, Users, Dumbbell, Gamepad2, Swords, Heart, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const ADMIN_EMAIL = "mohammednv23158@gmail.com";

type TableFilter = "all" | "bmi" | "workout" | "game" | "boxing";

const TABLE_TABS: { key: TableFilter; label: string; icon: React.ReactNode; color: string }[] = [
  { key: "all", label: "All Records", icon: <Users size={14} />, color: "bg-gray-700" },
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
      toast({
        title: `Backfill complete — ${data.updated} rows updated`,
        description: lines.join("\n"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/search"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/counts"] });
    },
    onError: () => toast({ title: "Backfill failed", variant: "destructive" }),
  });

  const { data: records = [], isLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ["/api/admin/search", activeSearch, table],
    queryFn: () =>
      apiRequest("GET", `/api/admin/search?search=${encodeURIComponent(activeSearch)}&table=${table}`)
        .then(r => r.json()),
    enabled: isAdmin,
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

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-red-500">Admin Panel</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button
            data-testid="button-backfill"
            size="sm"
            variant="outline"
            className="border-yellow-700 text-yellow-400 hover:bg-yellow-900/30 gap-1.5 text-xs"
            onClick={() => backfillMutation.mutate()}
            disabled={backfillMutation.isPending}
          >
            <RefreshCw size={13} className={backfillMutation.isPending ? "animate-spin" : ""} />
            {backfillMutation.isPending ? "Fixing…" : "Fix NULL Records"}
          </Button>
          <span className="text-gray-500 text-sm">
            {records.length} record{records.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* DB totals bar — shows real counts directly from the database */}
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
          <Button
            data-testid="button-search"
            onClick={handleSearch}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Search
          </Button>
          {activeSearch && (
            <Button
              variant="outline"
              className="border-gray-700 text-gray-300 hover:bg-gray-800"
              onClick={() => { setSearch(""); setActiveSearch(""); }}
            >
              Clear
            </Button>
          )}
        </div>

        {/* Table filter tabs */}
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

        {/* Results */}
        {isLoading ? (
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
        )}
      </div>
    </div>
  );
}
