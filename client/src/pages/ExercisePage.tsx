import { useRoute } from "wouter";
import { ExerciseCamera } from "@/components/ExerciseCamera";
import type { ExerciseType } from "@/hooks/use-pose-detection";
import type { DifficultyLevel, IntensityLevel } from "@shared/schema";

// Validate and coerce intensity to valid value
function parseIntensity(value: string | undefined): IntensityLevel {
  const parsed = parseInt(value || "2");
  if (parsed === 1 || parsed === 2 || parsed === 3) {
    return parsed as IntensityLevel;
  }
  return 2; // Default to balanced intensity
}

// Validate exercise type
function parseExerciseType(value: string | undefined): ExerciseType {
  if (value === "pushups" || value === "squats") {
    return value;
  }
  return "pushups";
}

// Validate difficulty level
function parseDifficulty(value: string | undefined): DifficultyLevel {
  if (value === "beginner" || value === "medium" || value === "pro") {
    return value;
  }
  return "beginner";
}

export default function ExercisePage() {
  const [, params] = useRoute("/exercise/:type/:difficulty/:intensity");
  
  const exerciseType = parseExerciseType(params?.type);
  const difficulty = parseDifficulty(params?.difficulty);
  const intensity = parseIntensity(params?.intensity);

  return (
    <ExerciseCamera 
      exerciseType={exerciseType} 
      difficulty={difficulty} 
      intensity={intensity}
    />
  );
}
