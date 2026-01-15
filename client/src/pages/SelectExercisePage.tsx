import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getDifficultyConfig, type ExerciseType, type DifficultyLevel, type IntensityLevel } from "@shared/schema";
import { ArrowLeft, Dumbbell, Activity, Clock, Target, Square } from "lucide-react";

export default function SelectExercisePage() {
  const [, setLocation] = useLocation();
  const [selectedExercise, setSelectedExercise] = useState<ExerciseType | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel | null>(null);
  const [selectedIntensity, setSelectedIntensity] = useState<IntensityLevel>(2);

  const exercises: { type: ExerciseType; label: string; icon: typeof Dumbbell }[] = [
    { type: "pushups", label: "Push-ups", icon: Dumbbell },
    { type: "squats", label: "Squats", icon: Activity },
  ];

  const difficulties: { level: DifficultyLevel; label: string; color: string }[] = [
    { level: "beginner", label: "Beginner", color: "bg-green-500" },
    { level: "medium", label: "Medium", color: "bg-yellow-500" },
    { level: "pro", label: "Pro", color: "bg-red-500" },
  ];

  const intensityLevels: IntensityLevel[] = [1, 2, 3];

  const handleStart = () => {
    if (selectedExercise && selectedDifficulty) {
      setLocation(`/exercise/${selectedExercise}/${selectedDifficulty}/${selectedIntensity}`);
    }
  };

  const config = selectedExercise && selectedDifficulty 
    ? getDifficultyConfig(selectedExercise, selectedDifficulty, selectedIntensity)
    : null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setLocation("/")}
            data-testid="button-back-home"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold">Start Workout</h1>
        </div>

        {/* Exercise Selection */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 text-muted-foreground">Select Exercise</h2>
          <div className="grid grid-cols-2 gap-4">
            {exercises.map(({ type, label, icon: Icon }) => (
              <Card
                key={type}
                className={`cursor-pointer transition-all hover-elevate ${
                  selectedExercise === type
                    ? "border-primary bg-primary/10"
                    : "border-border"
                }`}
                onClick={() => setSelectedExercise(type)}
                data-testid={`card-exercise-${type}`}
              >
                <CardContent className="flex flex-col items-center justify-center p-6">
                  <Icon className={`w-12 h-12 mb-3 ${
                    selectedExercise === type ? "text-primary" : "text-muted-foreground"
                  }`} />
                  <span className="font-semibold text-lg">{label}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Difficulty Selection */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 text-muted-foreground">Select Difficulty</h2>
          <div className="grid grid-cols-3 gap-4">
            {difficulties.map(({ level, label, color }) => (
              <Card
                key={level}
                className={`cursor-pointer transition-all hover-elevate ${
                  selectedDifficulty === level
                    ? "border-primary"
                    : "border-border"
                }`}
                onClick={() => setSelectedDifficulty(level)}
                data-testid={`card-difficulty-${level}`}
              >
                <CardContent className="flex flex-col items-center justify-center p-4">
                  <div className={`w-4 h-4 rounded-full ${color} mb-2`} />
                  <span className="font-medium">{label}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Intensity Selection - Only show after difficulty is selected */}
        {selectedDifficulty && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-2 text-muted-foreground">Select Intensity</h2>
            <p className="text-sm text-muted-foreground mb-4">
              More squares = higher reps, less time
            </p>
            <div className="grid grid-cols-3 gap-4">
              {intensityLevels.map((level) => (
                <Card
                  key={level}
                  className={`cursor-pointer transition-all hover-elevate ${
                    selectedIntensity === level
                      ? "border-primary bg-primary/10"
                      : "border-border"
                  }`}
                  onClick={() => setSelectedIntensity(level)}
                  data-testid={`card-intensity-${level}`}
                >
                  <CardContent className="flex flex-col items-center justify-center p-4">
                    <div className="flex gap-1 mb-2">
                      {Array.from({ length: level }).map((_, i) => (
                        <Square
                          key={i}
                          className={`w-5 h-5 ${
                            selectedIntensity === level
                              ? "text-primary fill-primary"
                              : "text-muted-foreground fill-muted-foreground"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {level === 1 ? "Easy" : level === 2 ? "Normal" : "Hard"}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Config Preview */}
        {config && (
          <Card className="mb-8 bg-card/50">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">Workout Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Time Limit</p>
                    <p className="font-semibold">{formatTime(config.timeLimit)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Target className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Target Reps</p>
                    <p className="font-semibold">{config.targetReps} reps</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Start Button */}
        <Button
          size="lg"
          className="w-full py-6 text-lg"
          disabled={!selectedExercise || !selectedDifficulty}
          onClick={handleStart}
          data-testid="button-start-workout"
        >
          Start Workout
        </Button>
      </div>
    </div>
  );
}
