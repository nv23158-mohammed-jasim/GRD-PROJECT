import { useEffect, useState, useRef, useCallback } from "react";
import { usePoseDetection, type ExerciseType } from "@/hooks/use-pose-detection";
import { useCreateWorkoutSession } from "@/hooks/use-workout-sessions";
import { difficultyConfigs, type DifficultyLevel, type Grade } from "@shared/schema";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface ExerciseCameraProps {
  exerciseType: ExerciseType;
  difficulty: DifficultyLevel;
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

export function ExerciseCamera({ exerciseType, difficulty }: ExerciseCameraProps) {
  const [, setLocation] = useLocation();
  const config = difficultyConfigs[exerciseType][difficulty];
  
  const {
    videoRef,
    canvasRef,
    isBodyDetected,
    isLoading,
    error,
    repCount,
    resetRepCount,
    startCamera,
    stopCamera,
    setCountingEnabled,
  } = usePoseDetection(exerciseType);
  
  const createSession = useCreateWorkoutSession();
  
  const [isStarted, setIsStarted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(config.timeLimit);
  const [isFinished, setIsFinished] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [finalRepCount, setFinalRepCount] = useState(0);
  
  // Use a ref to track start time for accurate time calculation
  const startTimeRef = useRef<number | null>(null);

  // Start camera on mount
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // Timer countdown using start time reference for accuracy
  useEffect(() => {
    if (!isStarted || isFinished) return;
    
    const interval = setInterval(() => {
      if (startTimeRef.current === null) return;
      
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = Math.max(0, config.timeLimit - elapsed);
      setTimeRemaining(remaining);
      
      if (remaining <= 0) {
        clearInterval(interval);
        finishWorkout(elapsed);
      }
    }, 100); // Check more frequently for accuracy
    
    return () => clearInterval(interval);
  }, [isStarted, isFinished, config.timeLimit]);

  const finishWorkout = useCallback(async (elapsedSeconds: number) => {
    // Disable counting immediately
    setCountingEnabled(false);
    setIsFinished(true);
    
    // Capture the final rep count at this moment
    const finalReps = repCount;
    setFinalRepCount(finalReps);
    
    const finalGrade = calculateGrade(finalReps, config.targetReps);
    setGrade(finalGrade);
    
    // Save workout session with accurate time taken
    const timeTaken = Math.min(elapsedSeconds, config.timeLimit);
    
    try {
      await createSession.mutateAsync({
        exerciseType,
        difficulty,
        targetReps: config.targetReps,
        completedReps: finalReps,
        timeLimit: config.timeLimit,
        timeTaken,
        grade: finalGrade,
      });
    } catch (err) {
      console.error("Failed to save workout:", err);
    }
  }, [repCount, config, exerciseType, difficulty, createSession, setCountingEnabled]);

  const handleStart = () => {
    if (isBodyDetected) {
      // Reset rep count before starting
      resetRepCount();
      // Record start time
      startTimeRef.current = Date.now();
      // Enable counting
      setCountingEnabled(true);
      setIsStarted(true);
    }
  };

  const handleGoHome = () => {
    stopCamera();
    setLocation("/");
  };

  const handleTryAgain = () => {
    // Reset all state
    setIsStarted(false);
    setIsFinished(false);
    setTimeRemaining(config.timeLimit);
    setGrade(null);
    setFinalRepCount(0);
    startTimeRef.current = null;
    // Reset rep count and exercise state
    resetRepCount();
    // Disable counting until next start
    setCountingEnabled(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (error) {
    const isInIframe = window.self !== window.top;
    const currentUrl = window.location.href;
    
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-white text-xl mb-4">Camera Access Required</p>
          <p className="text-muted-foreground mb-6">
            This exercise requires camera access for pose detection.
          </p>
          {isInIframe ? (
            <div className="mb-6">
              <p className="text-yellow-400 mb-4">
                Camera doesn't work in the embedded preview. Open in a new tab to use camera:
              </p>
              <a 
                href={currentUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-block bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium hover:bg-primary/90"
                data-testid="link-open-new-tab"
              >
                Open in New Tab
              </a>
            </div>
          ) : (
            <p className="text-muted-foreground mb-6">
              Please allow camera access when prompted by your browser.
            </p>
          )}
          <div className="space-y-3">
            <Button onClick={handleGoHome} variant="outline" className="w-full" data-testid="button-go-back">
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Finished screen with grade
  if (isFinished && grade) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className={`text-9xl font-bold mb-8 ${getGradeColor(grade)}`}>
            {grade}
          </div>
          <p className="text-white text-2xl mb-2">
            {exerciseType.charAt(0).toUpperCase() + exerciseType.slice(1)} - {difficulty}
          </p>
          <p className="text-muted-foreground text-xl mb-8">
            {finalRepCount} / {config.targetReps} reps completed
          </p>
          <div className="flex gap-4 justify-center">
            <Button variant="outline" onClick={handleTryAgain} data-testid="button-try-again">
              Try Again
            </Button>
            <Button onClick={handleGoHome} data-testid="button-go-home">
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 relative">
      {/* Video Container */}
      <div className="relative w-full h-screen">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none"
        />
        
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
              <p className="text-white text-xl">Loading pose detection...</p>
            </div>
          </div>
        )}
        
        {/* Body detected indicator */}
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isBodyDetected ? "bg-green-500" : "bg-red-500/50"
          }`}>
            {isBodyDetected && <Check className="w-6 h-6 text-white" />}
          </div>
          <span className="text-white text-sm font-medium">
            {isBodyDetected ? "Body Detected" : "Position yourself in frame"}
          </span>
        </div>
        
        {/* Exercise info and timer */}
        <div className="absolute top-4 right-4 text-right">
          <div className="bg-black/60 backdrop-blur-sm rounded-lg p-4">
            <p className="text-primary font-bold text-lg uppercase">
              {exerciseType}
            </p>
            <p className="text-muted-foreground text-sm capitalize">{difficulty}</p>
          </div>
        </div>
        
        {/* Timer and rep counter (when started) */}
        {isStarted && (
          <>
            <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2">
              <div className="text-center">
                <div className="text-8xl font-bold text-white drop-shadow-lg">
                  {formatTime(timeRemaining)}
                </div>
              </div>
            </div>
            
            <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2">
              <div className="bg-black/60 backdrop-blur-sm rounded-2xl px-12 py-6 text-center">
                <p className="text-6xl font-bold text-white">{repCount}</p>
                <p className="text-muted-foreground text-lg">/ {config.targetReps} reps</p>
              </div>
            </div>
          </>
        )}
        
        {/* Start button (before started) */}
        {!isStarted && !isLoading && (
          <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2">
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
                data-testid="button-start-exercise"
              >
                {isBodyDetected ? "Start Exercise" : "Get in Position"}
              </Button>
            </div>
          </div>
        )}
        
        {/* Back button */}
        <div className="absolute bottom-4 left-4">
          <Button variant="ghost" onClick={handleGoHome} data-testid="button-back">
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
