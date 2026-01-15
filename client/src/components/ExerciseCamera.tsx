import { useEffect, useState, useRef, useCallback } from "react";
import { usePoseDetection, type ExerciseType } from "@/hooks/use-pose-detection";
import { useCreateWorkoutSession } from "@/hooks/use-workout-sessions";
import { getDifficultyConfig, type DifficultyLevel, type IntensityLevel, type Grade } from "@shared/schema";
import { Check, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface ExerciseCameraProps {
  exerciseType: ExerciseType;
  difficulty: DifficultyLevel;
  intensity: IntensityLevel;
}

function calculateGrade(completedReps: number, targetReps: number): Grade {
  const ratio = completedReps / targetReps;
  if (ratio >= 1.5) return "AA+";
  if (ratio >= 1.25) return "A+";
  if (ratio >= 1.0) return "A";
  if (ratio >= 0.8) return "B";
  if (ratio >= 0.6) return "C";
  if (ratio >= 0.4) return "D";
  return "F";
}

function getGradeColor(grade: Grade): string {
  switch (grade) {
    case "AA+": return "text-yellow-400";
    case "A+": return "text-green-400";
    case "A": return "text-green-500";
    case "B": return "text-blue-400";
    case "C": return "text-orange-400";
    case "D": return "text-orange-500";
    case "F": return "text-red-500";
  }
}

export function ExerciseCamera({ exerciseType, difficulty, intensity }: ExerciseCameraProps) {
  const [, setLocation] = useLocation();
  const config = getDifficultyConfig(exerciseType, difficulty, intensity);
  
  const {
    videoRef,
    canvasRef,
    isLoading,
    loadingStatus,
    error,
    isBodyDetected,
    repCount,
    debugInfo,
    startCamera,
    stopCamera,
    enableCounting,
    disableCounting,
    resetReps,
  } = usePoseDetection(exerciseType);
  
  const createSession = useCreateWorkoutSession();
  
  const [workoutState, setWorkoutState] = useState<"ready" | "active" | "finished">("ready");
  const [timeRemaining, setTimeRemaining] = useState(config.timeLimit);
  const [finalReps, setFinalReps] = useState(0);
  const [grade, setGrade] = useState<Grade | null>(null);
  
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  // Start camera on mount
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCamera, stopCamera]);

  const finishWorkout = useCallback(async (reps: number, elapsed: number) => {
    disableCounting();
    setWorkoutState("finished");
    setFinalReps(reps);
    
    const finalGrade = calculateGrade(reps, config.targetReps);
    setGrade(finalGrade);
    
    try {
      await createSession.mutateAsync({
        exerciseType,
        difficulty,
        intensity,
        targetReps: config.targetReps,
        completedReps: reps,
        timeLimit: config.timeLimit,
        timeTaken: Math.min(elapsed, config.timeLimit),
        grade: finalGrade,
      });
    } catch (err) {
      console.error("Failed to save:", err);
    }
  }, [config, exerciseType, difficulty, intensity, createSession, disableCounting]);

  const handleStart = () => {
    if (!isBodyDetected) return;
    
    resetReps();
    enableCounting();
    setWorkoutState("active");
    startTimeRef.current = Date.now();
    setTimeRemaining(config.timeLimit);
    
    // Start timer
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = Math.max(0, config.timeLimit - elapsed);
      setTimeRemaining(remaining);
      
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 100);
  };

  // Watch for timer end
  useEffect(() => {
    if (workoutState === "active" && timeRemaining <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      finishWorkout(repCount, elapsed);
    }
  }, [timeRemaining, workoutState, repCount, finishWorkout]);

  const handleTryAgain = () => {
    resetReps();
    setWorkoutState("ready");
    setTimeRemaining(config.timeLimit);
    setGrade(null);
    setFinalReps(0);
    startTimeRef.current = 0;
  };

  const handleGoHome = () => {
    stopCamera();
    setLocation("/");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Error screen
  if (error) {
    const isInIframe = window.self !== window.top;
    
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-white text-xl mb-4">Camera Access Required</p>
          
          {isInIframe ? (
            <>
              <p className="text-yellow-400 mb-4">
                Camera doesn't work in the embedded preview.
              </p>
              <a 
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-md font-medium mb-4"
              >
                <ExternalLink className="w-4 h-4" />
                Open in New Tab
              </a>
            </>
          ) : (
            <p className="text-muted-foreground mb-4">{error}</p>
          )}
          
          <Button variant="outline" onClick={handleGoHome} className="w-full">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // Finished screen
  if (workoutState === "finished" && grade) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className={`text-9xl font-bold mb-8 ${getGradeColor(grade)}`}>
            {grade}
          </div>
          <p className="text-white text-2xl mb-2 capitalize">
            {exerciseType} - {difficulty}
          </p>
          <p className="text-muted-foreground text-xl mb-8">
            {finalReps} / {config.targetReps} reps completed
          </p>
          <div className="flex gap-4 justify-center">
            <Button variant="outline" onClick={handleTryAgain}>
              Try Again
            </Button>
            <Button onClick={handleGoHome}>
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 relative">
      <div className="relative w-full h-screen">
        {/* Video feed */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
          playsInline
          muted
        />
        
        {/* Skeleton overlay */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none"
        />
        
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-20">
            <div className="text-center max-w-sm">
              <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto mb-6" />
              <p className="text-white text-xl mb-2">Loading...</p>
              <p className="text-muted-foreground">{loadingStatus}</p>
            </div>
          </div>
        )}
        
        {/* Body detection indicator */}
        {!isLoading && (
          <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isBodyDetected ? "bg-green-500" : "bg-red-500/50"
            }`}>
              {isBodyDetected && <Check className="w-6 h-6 text-white" />}
            </div>
            <span className="text-white text-sm font-medium bg-black/50 px-2 py-1 rounded">
              {isBodyDetected ? "Body Detected" : "Get in frame"}
            </span>
          </div>
        )}
        
        {/* Exercise info */}
        <div className="absolute top-4 right-4 z-10">
          <div className="bg-black/60 backdrop-blur-sm rounded-lg p-4">
            <p className="text-primary font-bold text-lg uppercase">{exerciseType}</p>
            <p className="text-muted-foreground text-sm capitalize">{difficulty}</p>
          </div>
        </div>
        
        {/* Active workout display */}
        {workoutState === "active" && (
          <>
            <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 z-10">
              <div className="text-8xl font-bold text-white drop-shadow-lg">
                {formatTime(timeRemaining)}
              </div>
            </div>
            
            <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 z-10">
              <div className="bg-black/60 backdrop-blur-sm rounded-2xl px-12 py-6 text-center">
                <p className="text-6xl font-bold text-white">{repCount}</p>
                <p className="text-muted-foreground text-lg">/ {config.targetReps} reps</p>
                {debugInfo && (
                  <p className="text-yellow-400 text-sm mt-2">{debugInfo}</p>
                )}
              </div>
            </div>
          </>
        )}
        
        {/* Start button */}
        {workoutState === "ready" && !isLoading && (
          <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-10">
            <div className="text-center">
              <p className="text-white text-lg mb-4">
                Target: <span className="font-bold text-primary">{config.targetReps} reps</span> in{" "}
                <span className="font-bold text-primary">{formatTime(config.timeLimit)}</span>
              </p>
              <Button
                size="lg"
                className="px-12 py-6 text-xl"
                onClick={handleStart}
                disabled={!isBodyDetected}
              >
                {isBodyDetected ? "Start Exercise" : "Get in Position"}
              </Button>
            </div>
          </div>
        )}
        
        {/* Back button */}
        <div className="absolute bottom-4 left-4 z-10">
          <Button variant="ghost" onClick={handleGoHome}>
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
