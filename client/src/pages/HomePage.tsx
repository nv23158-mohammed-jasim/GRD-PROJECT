import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkoutHistory } from "@/components/WorkoutHistory";
import { useWorkoutSessions } from "@/hooks/use-workout-sessions";
import { useAuth } from "@/hooks/use-auth";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Menu, Activity, Dumbbell, History, Home, Play, TrendingUp, Award,
  Gamepad2, Zap, Flame, Calendar, Trophy, Timer, BarChart2, User, LogOut, ShieldCheck,
} from "lucide-react";
import type { WorkoutSession } from "@shared/schema";
import type { BMIProfile } from "@/pages/BMIPage";

function calculateStreak(sessions: WorkoutSession[]): number {
  if (!sessions || sessions.length === 0) return 0;
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const workoutDays = new Set(
    sessions.map(s => new Date(s.date).setHours(0, 0, 0, 0))
  );
  let streak = 0;
  let checkMs = todayMs;
  if (!workoutDays.has(checkMs)) checkMs -= 86400000;
  while (workoutDays.has(checkMs)) {
    streak++;
    checkMs -= 86400000;
  }
  return streak;
}

const GRADE_ORDER = ["F", "D", "C", "B", "A", "A+", "A++"];

function getBestGrade(sessions: WorkoutSession[], type: string): string {
  const filtered = sessions.filter(s => s.exerciseType === type);
  if (filtered.length === 0) return "-";
  return filtered.reduce((best, s) =>
    GRADE_ORDER.indexOf(s.grade) > GRADE_ORDER.indexOf(best) ? s.grade : best, "F"
  );
}

function getBestReps(sessions: WorkoutSession[], type: string): number {
  const filtered = sessions.filter(s => s.exerciseType === type);
  if (filtered.length === 0) return 0;
  return Math.max(...filtered.map(s => s.completedReps));
}

export default function HomePage() {
  const [, setLocation] = useLocation();
  const { data: sessions } = useWorkoutSessions();
  const { user, logout, isLoggingOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bmiProfile, setBmiProfile] = useState<BMIProfile | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("fitness_bmi_profile");
    if (saved) { try { setBmiProfile(JSON.parse(saved)); } catch { /* ignore */ } }
  }, []);

  const allSessions = sessions || [];

  const totalWorkouts = allSessions.length;
  const totalReps = allSessions.reduce((sum, s) => sum + s.completedReps, 0);
  const bestGrade = allSessions.length
    ? allSessions.reduce((best, s) =>
        GRADE_ORDER.indexOf(s.grade) > GRADE_ORDER.indexOf(best) ? s.grade : best, "F")
    : "-";
  const streak = calculateStreak(allSessions);

  // Progress chart data — last 15 sessions
  const chartData = allSessions.slice(-15).map((s, i) => ({
    session: i + 1,
    reps: s.completedReps,
    type: s.exerciseType,
    pushups: s.exerciseType === "pushups" ? s.completedReps : undefined,
    squats: s.exerciseType === "squats" ? s.completedReps : undefined,
    plank: s.exerciseType === "plank" ? s.completedReps : undefined,
  }));

  const isAdmin = user?.email?.toLowerCase() === "mohammednv23158@gmail.com";

  const menuItems = [
    { icon: Home, label: "Home", path: "/" },
    { icon: Play, label: "Start Workout", path: "/select-exercise" },
    { icon: Gamepad2, label: "Game Mode", path: "/game" },
    { icon: Zap, label: "Boxing Mode", path: "/boxing" },
    { icon: User, label: "BMI Profile", path: "/bmi" },
    ...(isAdmin ? [{ icon: ShieldCheck, label: "Admin Panel", path: "/admin" }] : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-zinc-900 border-b border-white/5">
        <div className="container max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-menu">
                <Menu className="w-6 h-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 flex flex-col">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Activity className="w-6 h-6 text-primary" />
                  LAB
                </SheetTitle>
              </SheetHeader>
              {user && (
                <div className="flex items-center gap-3 mt-4 px-1 py-3 border-b border-white/10">
                  {user.picture ? (
                    <img src={user.picture} alt={user.name} className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-red-600 flex items-center justify-center">
                      <span className="text-white text-sm font-bold">{user.name[0]}</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                    <p className="text-xs text-zinc-400 truncate">{user.email}</p>
                  </div>
                </div>
              )}
              <nav className="mt-4 space-y-2 flex-1">
                {menuItems.map((item) => (
                  <Button
                    key={item.label}
                    variant="ghost"
                    className="w-full justify-start gap-3"
                    onClick={() => { setLocation(item.path); setMenuOpen(false); }}
                    data-testid={`menu-item-${item.label.toLowerCase().replace(/ /g, "-")}`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </Button>
                ))}
              </nav>
              <div className="border-t border-white/10 pt-3 mt-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-zinc-400 hover:text-red-400"
                  onClick={() => logout()}
                  disabled={isLoggingOut}
                  data-testid="button-logout"
                >
                  <LogOut className="w-5 h-5" />
                  {isLoggingOut ? "Signing out…" : "Sign out"}
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">LAB</span>
          </div>
          <div className="w-10" />
        </div>
      </header>

      <main className="container max-w-4xl mx-auto px-4 py-8">

        {/* BMI Profile card — show if completed */}
        {bmiProfile ? (
          <Card
            className="mb-6 bg-zinc-800/60 border-white/10 cursor-pointer hover-elevate"
            onClick={() => setLocation("/bmi")}
            data-testid="card-bmi-profile"
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {user?.picture ? (
                  <img src={user.picture} alt={user.name} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-white">{user?.name || "BMI Profile"}</p>
                  <p className="text-sm text-muted-foreground">
                    BMI: <span className="text-white font-medium">{bmiProfile.bmi}</span>
                    {" · "}{bmiProfile.category}
                    {" · "}<span className="text-primary capitalize font-medium">{bmiProfile.suggestedDifficulty}</span> recommended
                  </p>
                </div>
              </div>
              <span className="text-muted-foreground text-sm">Edit →</span>
            </CardContent>
          </Card>
        ) : (
          <Card
            className="mb-6 bg-primary/5 border-primary/30 cursor-pointer hover-elevate"
            onClick={() => setLocation("/bmi")}
            data-testid="card-bmi-cta"
          >
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-white">Set up your BMI profile</p>
                <p className="text-sm text-muted-foreground">Get a personalized difficulty recommendation →</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Hero CTA */}
        <Card className="mb-8 bg-gradient-to-br from-primary/20 to-zinc-900 border-primary/30">
          <CardContent className="p-8 text-center">
            <Dumbbell className="w-16 h-16 text-primary mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">Ready to Train?</h1>
            <p className="text-muted-foreground mb-6">
              Track your workouts with real-time AI pose detection
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Button size="lg" className="px-8 py-6 text-lg" onClick={() => setLocation("/select-exercise")} data-testid="button-start-workout-hero">
                <Play className="w-5 h-5 mr-2" /> Start Workout
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-6 text-lg" onClick={() => setLocation("/game")} data-testid="button-game-mode-hero">
                <Gamepad2 className="w-5 h-5 mr-2" /> Game Mode
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-6 text-lg" onClick={() => setLocation("/boxing")} data-testid="button-boxing-mode-hero">
                <Zap className="w-5 h-5 mr-2" /> Boxing Mode
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats Overview — 4 stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <Card className="bg-card/50">
            <CardContent className="p-4 text-center">
              <TrendingUp className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">{totalWorkouts}</p>
              <p className="text-sm text-muted-foreground">Workouts</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-4 text-center">
              <Dumbbell className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">{totalReps}</p>
              <p className="text-sm text-muted-foreground">Total Reps</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-4 text-center">
              <Award className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">{bestGrade}</p>
              <p className="text-sm text-muted-foreground">Best Grade</p>
            </CardContent>
          </Card>
          <Card className={`bg-card/50 ${streak >= 3 ? "border-orange-500/50" : ""}`}>
            <CardContent className="p-4 text-center">
              <Flame className={`w-6 h-6 mx-auto mb-2 ${streak >= 3 ? "text-orange-400" : "text-muted-foreground"}`} />
              <p className={`text-2xl font-bold ${streak >= 3 ? "text-orange-400" : ""}`}>
                {streak}{streak >= 3 ? " 🔥" : ""}
              </p>
              <p className="text-sm text-muted-foreground">{streak === 1 ? "Day Streak" : "Day Streak"}</p>
            </CardContent>
          </Card>
        </div>

        {/* Personal Bests */}
        {allSessions.length > 0 && (
          <Card className="mb-8 bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Trophy className="w-5 h-5 text-yellow-400" />
                Personal Bests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { type: "pushups", label: "Push-ups", icon: Dumbbell, unit: "reps" },
                  { type: "squats", label: "Squats", icon: Activity, unit: "reps" },
                  { type: "plank", label: "Plank", icon: Timer, unit: "sec" },
                ].map(({ type, label, icon: Icon, unit }) => {
                  const best = getBestReps(allSessions, type);
                  const grade = getBestGrade(allSessions, type);
                  return (
                    <div key={type} className="text-center bg-zinc-800/50 rounded-xl p-4">
                      <Icon className="w-6 h-6 text-primary mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      <p className="text-2xl font-bold text-white">{best > 0 ? best : "—"}</p>
                      <p className="text-xs text-muted-foreground">{best > 0 ? unit : ""}</p>
                      {grade !== "-" && (
                        <p className="text-xs text-primary font-semibold mt-1">Best: {grade}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Progress Chart */}
        <Card className="mb-8 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart2 className="w-5 h-5 text-primary" />
              Progress {chartData.length > 0 ? `— Last ${chartData.length} Sessions` : "Chart"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="h-[200px] flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <BarChart2 className="w-10 h-10 opacity-30" />
                <p className="text-sm">No workouts yet — complete a session to see your progress here</p>
              </div>
            ) : chartData.length === 1 ? (
              <div className="h-[200px] flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <BarChart2 className="w-10 h-10 opacity-30" />
                <p className="text-sm">Complete one more workout to unlock your progress chart</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <XAxis dataKey="session" tick={{ fill: "#888", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#888", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "#1c1c1c", border: "1px solid #333", borderRadius: 8 }}
                    labelFormatter={v => `Session ${v}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="pushups" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} connectNulls name="Push-ups" />
                  <Line type="monotone" dataKey="squats" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} connectNulls name="Squats" />
                  <Line type="monotone" dataKey="plank" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} connectNulls name="Plank (s)" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Workout History */}
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Workout History
          </h2>
          <WorkoutHistory />
        </div>
      </main>
    </div>
  );
}
