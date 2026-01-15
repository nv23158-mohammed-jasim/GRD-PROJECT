import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WorkoutHistory } from "@/components/WorkoutHistory";
import { useWorkoutSessions } from "@/hooks/use-workout-sessions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Menu,
  Activity,
  Dumbbell,
  History,
  Home,
  Play,
  TrendingUp,
  Award,
} from "lucide-react";

export default function HomePage() {
  const [, setLocation] = useLocation();
  const { data: sessions } = useWorkoutSessions();
  const [menuOpen, setMenuOpen] = useState(false);

  // Calculate stats
  const totalWorkouts = sessions?.length || 0;
  const totalReps = sessions?.reduce((sum, s) => sum + s.completedReps, 0) || 0;
  const bestGrade = sessions?.length
    ? sessions.reduce((best, s) => {
        const gradeOrder = ["F", "D", "C", "B", "A", "A+", "AA+"];
        return gradeOrder.indexOf(s.grade) > gradeOrder.indexOf(best)
          ? s.grade
          : best;
      }, "F")
    : "-";

  const menuItems = [
    { icon: Home, label: "Home", path: "/" },
    { icon: Play, label: "Start Workout", path: "/select-exercise" },
    { icon: History, label: "Workout History", path: "/" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header with hamburger menu */}
      <header className="sticky top-0 z-50 bg-zinc-900 border-b border-white/5">
        <div className="container max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-menu">
                <Menu className="w-6 h-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Activity className="w-6 h-6 text-primary" />
                  Fitness Tracker
                </SheetTitle>
              </SheetHeader>
              <nav className="mt-8 space-y-2">
                {menuItems.map((item) => (
                  <Button
                    key={item.label}
                    variant="ghost"
                    className="w-full justify-start gap-3"
                    onClick={() => {
                      setLocation(item.path);
                      setMenuOpen(false);
                    }}
                    data-testid={`menu-item-${item.label.toLowerCase().replace(" ", "-")}`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </Button>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">Fitness Tracker</span>
          </div>

          <div className="w-10" /> {/* Spacer for centering */}
        </div>
      </header>

      <main className="container max-w-4xl mx-auto px-4 py-8">
        {/* Hero / CTA Section */}
        <Card className="mb-8 bg-gradient-to-br from-primary/20 to-zinc-900 border-primary/30">
          <CardContent className="p-8 text-center">
            <Dumbbell className="w-16 h-16 text-primary mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">Ready to Train?</h1>
            <p className="text-muted-foreground mb-6">
              Track your push-ups and squats with real-time pose detection
            </p>
            <Button
              size="lg"
              className="px-8 py-6 text-lg"
              onClick={() => setLocation("/select-exercise")}
              data-testid="button-start-workout-hero"
            >
              <Play className="w-5 h-5 mr-2" />
              Start Workout
            </Button>
          </CardContent>
        </Card>

        {/* Stats Overview */}
        <div className="grid grid-cols-3 gap-4 mb-8">
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
        </div>

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
