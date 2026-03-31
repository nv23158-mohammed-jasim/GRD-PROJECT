import { useWorkoutSessions, useDeleteWorkoutSession } from "@/hooks/use-workout-sessions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Dumbbell, Activity, Clock, Target, Timer } from "lucide-react";
import { format } from "date-fns";
import type { Grade } from "@shared/schema";

function getGradeColor(grade: Grade): string {
  switch (grade) {
    case "A++": return "bg-yellow-500";
    case "A+": return "bg-green-400";
    case "A": return "bg-green-500";
    case "B": return "bg-blue-500";
    case "C": return "bg-orange-400";
    case "D": return "bg-orange-500";
    case "F": return "bg-red-500";
    default: return "bg-gray-500";
  }
}

function getExerciseIcon(type: string) {
  if (type === "pushups") return Dumbbell;
  if (type === "plank") return Timer;
  return Activity;
}

function getExerciseLabel(type: string) {
  if (type === "plank") return "Plank Hold";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatRepLabel(type: string, reps: number) {
  if (type === "plank") {
    const m = Math.floor(reps / 60);
    const s = reps % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }
  return String(reps);
}

export function WorkoutHistory() {
  const { data: sessions, isLoading } = useWorkoutSessions();
  const deleteSession = useDeleteWorkoutSession();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-muted/20 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <Card className="bg-card/50">
        <CardContent className="p-8 text-center">
          <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No workout history yet.</p>
          <p className="text-sm text-muted-foreground mt-1">Complete a workout to see your progress!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((session) => {
        const Icon = getExerciseIcon(session.exerciseType);
        
        return (
          <Card key={session.id} className="bg-card/50 hover-elevate">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {getExerciseLabel(session.exerciseType)}
                      </span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {session.difficulty}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(session.date), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right hidden sm:block">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Target className="w-4 h-4" />
                      <span>{formatRepLabel(session.exerciseType, session.completedReps)}/{formatRepLabel(session.exerciseType, session.targetReps)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span>{Math.floor(session.timeTaken / 60)}:{(session.timeTaken % 60).toString().padStart(2, "0")}</span>
                    </div>
                  </div>

                  <Badge 
                    className={`${getGradeColor(session.grade as Grade)} text-white text-lg px-3 py-1`}
                  >
                    {session.grade}
                  </Badge>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteSession.mutate(session.id)}
                    disabled={deleteSession.isPending}
                    data-testid={`button-delete-session-${session.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
