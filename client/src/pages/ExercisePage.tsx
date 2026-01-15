import { useRoute } from "wouter";
import { ExerciseCamera } from "@/components/ExerciseCamera";
import type { ExerciseType } from "@/hooks/use-pose-detection";
import type { DifficultyLevel, IntensityLevel } from "@shared/schema";

export default function ExercisePage() {
  const [, params] = useRoute("/exercise/:type/:difficulty/:intensity");
  
  const exerciseType = (params?.type as ExerciseType) || "pushups";
  const difficulty = (params?.difficulty as DifficultyLevel) || "beginner";
  const intensity = (parseInt(params?.intensity || "2") as IntensityLevel) || 2;

  return (
    <ExerciseCamera 
      exerciseType={exerciseType} 
      difficulty={difficulty} 
      intensity={intensity}
    />
  );
}
