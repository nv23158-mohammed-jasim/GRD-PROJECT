import { useRoute } from "wouter";
import { ExerciseCamera } from "@/components/ExerciseCamera";
import type { ExerciseType } from "@/hooks/use-pose-detection";
import type { DifficultyLevel } from "@shared/schema";

export default function ExercisePage() {
  const [, params] = useRoute("/exercise/:type/:difficulty");
  
  const exerciseType = (params?.type as ExerciseType) || "pushups";
  const difficulty = (params?.difficulty as DifficultyLevel) || "beginner";

  return (
    <ExerciseCamera exerciseType={exerciseType} difficulty={difficulty} />
  );
}
