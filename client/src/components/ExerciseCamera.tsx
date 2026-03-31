import { useEffect, useState, useRef, useCallback } from "react";
import { usePoseDetection, type ExerciseType } from "@/hooks/use-pose-detection";
import { useCreateWorkoutSession } from "@/hooks/use-workout-sessions";
import { getDifficultyConfig, type DifficultyLevel, type IntensityLevel, type Grade } from "@shared/schema";
import { Check, Loader2, AlertCircle, ExternalLink, Square, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface ExerciseCameraProps {
  exerciseType: ExerciseType;
  difficulty: DifficultyLevel;
  intensity: IntensityLevel;
}

function calculateGrade(completedReps: number, targetReps: number): Grade {
  const ratio = completedReps / targetReps;
  if (ratio >= 1.5) return "A++";
  if (ratio >= 1.25) return "A+";
  if (ratio >= 1.0) return "A";
  if (ratio >= 0.8) return "B";
  if (ratio >= 0.6) return "C";
  if (ratio >= 0.4) return "D";
  return "F";
}

function getGradeColor(grade: Grade): string {
  switch (grade) {
    case "A++": return "text-yellow-400";
    case "A+": return "text-green-400";
    case "A": return "text-green-500";
    case "B": return "text-blue-400";
    case "C": return "text-orange-400";
    case "D": return "text-orange-500";
    case "F": return "text-red-500";
  }
}

// Audio guidance using browser speech synthesis
function speak(text: string, enabled: boolean) {
  if (!enabled || !window.speechSynthesis) return;
  
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.2;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  window.speechSynthesis.speak(utterance);
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
    exercisePhase,
    plankDetected,
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
  const [audioEnabled, setAudioEnabled] = useState(true);
  
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const lastRepCountRef = useRef<number>(0);
  const lastPhaseRef = useRef<string>("");
  const guidanceTimeoutRef = useRef<number | null>(null);
  const phaseStartTimeRef = useRef<number>(0);
  const announced30Ref = useRef<boolean>(false);
  const announced10Ref = useRef<boolean>(false);

  // Start camera on mount
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (timerRef.current) clearInterval(timerRef.current);
      if (guidanceTimeoutRef.current) clearTimeout(guidanceTimeoutRef.current);
    };
  }, [startCamera, stopCamera]);

  // Audio guidance based on exercise phase and reps
  useEffect(() => {
    if (workoutState !== "active" || !audioEnabled) return;
    
    // Rep completion feedback
    if (repCount > lastRepCountRef.current) {
      const messages = ["Good!", "Nice!", "Keep going!", "Great rep!"];
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      speak(randomMessage, audioEnabled);
      lastRepCountRef.current = repCount;
    }
    
    // Phase change guidance
    if (exercisePhase !== lastPhaseRef.current) {
      lastPhaseRef.current = exercisePhase;
      phaseStartTimeRef.current = Date.now();
      
      // Clear any pending guidance
      if (guidanceTimeoutRef.current) {
        clearTimeout(guidanceTimeoutRef.current);
      }
      
      // Set up delayed guidance if staying in same phase too long
      guidanceTimeoutRef.current = window.setTimeout(() => {
        if (exercisePhase === "up") {
          speak("Go down more", audioEnabled);
        } else if (exercisePhase === "down") {
          speak("Come back up", audioEnabled);
        }
      }, 3000); // 3 seconds in same phase triggers guidance
    }
  }, [repCount, exercisePhase, workoutState, audioEnabled]);

  const finishWorkout = useCallback(async (reps: number, elapsed: number, wasEarlyStop: boolean = false) => {
    disableCounting();
    setWorkoutState("finished");
    setFinalReps(reps);
    
    if (timerRef.current) clearInterval(timerRef.current);
    if (guidanceTimeoutRef.current) clearTimeout(guidanceTimeoutRef.current);
    
    const finalGrade = calculateGrade(reps, config.targetReps);
    setGrade(finalGrade);
    
    // Announce results
    if (wasEarlyStop) {
      speak(`Workout stopped. You completed ${reps} reps.`, audioEnabled);
    } else {
      speak(`Time's up! You completed ${reps} reps. Grade: ${finalGrade}`, audioEnabled);
    }
    
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
  }, [config, exerciseType, difficulty, intensity, createSession, disableCounting, audioEnabled]);

  const handleStart = () => {
    if (!isBodyDetected) return;
    
    resetReps();
    enableCounting();
    setWorkoutState("active");
    startTimeRef.current = Date.now();
    setTimeRemaining(config.timeLimit);
    lastRepCountRef.current = 0;
    lastPhaseRef.current = "";
    announced30Ref.current = false;
    announced10Ref.current = false;
    
    speak("Starting workout. Go!", audioEnabled);
    
    // Start timer
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = Math.max(0, config.timeLimit - elapsed);
      setTimeRemaining(remaining);
      
      // Announce time remaining at intervals (only once each)
      if (remaining <= 30 && remaining > 25 && !announced30Ref.current && audioEnabled) {
        announced30Ref.current = true;
        speak("30 seconds left", true);
      } else if (remaining <= 10 && remaining > 5 && !announced10Ref.current && audioEnabled) {
        announced10Ref.current = true;
        speak("10 seconds", true);
      }
      
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 100);
  };

  // Handle early stop
  const handleStop = () => {
    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
    finishWorkout(repCount, elapsed, true);
  };

  // Watch for timer end
  useEffect(() => {
    if (workoutState === "active" && timeRemaining <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      finishWorkout(repCount, elapsed, false);
    }
  }, [timeRemaining, workoutState, repCount, finishWorkout]);

  const handleTryAgain = () => {
    resetReps();
    setWorkoutState("ready");
    setTimeRemaining(config.timeLimit);
    setGrade(null);
    setFinalReps(0);
    startTimeRef.current = 0;
    lastRepCountRef.current = 0;
    announced30Ref.current = false;
    announced10Ref.current = false;
  };

  const handleGoHome = () => {
    stopCamera();
    window.speechSynthesis?.cancel();
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
          <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
            <div className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isBodyDetected ? "bg-green-500" : "bg-red-500/50"
              }`}>
                {isBodyDetected && <Check className="w-6 h-6 text-white" />}
              </div>
              <span className="text-white text-sm font-medium bg-black/50 px-2 py-1 rounded">
                {isBodyDetected ? "Body Detected" : "Get in frame"}
              </span>
            </div>
            {/* Plank indicator for pushups */}
            {exerciseType === "pushups" && isBodyDetected && (
              <div className="flex items-center gap-2">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  plankDetected ? "bg-green-500" : "bg-yellow-500/70"
                }`}>
                  {plankDetected && <Check className="w-6 h-6 text-white" />}
                </div>
                <span className="text-white text-sm font-medium bg-black/50 px-2 py-1 rounded">
                  {plankDetected ? "Plank Position ✓" : "Get in plank position"}
                </span>
              </div>
            )}
          </div>
        )}
        
        {/* Audio toggle */}
        {!isLoading && (
          <div className="absolute top-16 left-4 z-10">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const newState = !audioEnabled;
                setAudioEnabled(newState);
                if (!newState) {
                  window.speechSynthesis?.cancel();
                }
              }}
              className="bg-black/50"
              data-testid="button-audio-toggle"
            >
              {audioEnabled ? (
                <Volume2 className="w-5 h-5 text-white" />
              ) : (
                <VolumeX className="w-5 h-5 text-white" />
              )}
            </Button>
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
            
            {/* Plank lost warning during active pushup workout */}
            {exerciseType === "pushups" && !plankDetected && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
                <div className="bg-yellow-500/80 backdrop-blur-sm rounded-xl px-6 py-3 text-center">
                  <p className="text-black font-bold text-lg">⚠ Get back in plank!</p>
                  <p className="text-black/80 text-sm">Keep your body horizontal & sideways</p>
                </div>
              </div>
            )}
            
            <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 z-10">
              <div className="bg-black/60 backdrop-blur-sm rounded-2xl px-12 py-6 text-center">
                <p className="text-6xl font-bold text-white">{repCount}</p>
                <p className="text-muted-foreground text-lg">/ {config.targetReps} reps</p>
                {debugInfo && (
                  <p className="text-yellow-400 text-sm mt-2">{debugInfo}</p>
                )}
              </div>
            </div>
            
            {/* Stop button during workout */}
            <div className="absolute bottom-4 right-4 z-10">
              <Button 
                variant="destructive" 
                onClick={handleStop}
                data-testid="button-stop-workout"
              >
                <Square className="w-4 h-4 mr-2" />
                Stop & Save
              </Button>
            </div>
          </>
        )}
        
        {/* Start button */}
        {workoutState === "ready" && !isLoading && (
          <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-10 w-full max-w-sm px-4">
            <div className="text-center">
              {/* Side-profile hint for pushups */}
              {exerciseType === "pushups" && (
                <div className="bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 mb-4 text-sm text-left">
                  <p className="text-primary font-semibold mb-1">📐 Side Profile Setup</p>
                  <p className="text-white/80">Turn your body <span className="text-yellow-300 font-bold">sideways</span> to the camera so the AI can see your elbow bend clearly.</p>
                  <p className="text-white/60 mt-1 text-xs">Get into a plank position with your arm facing the camera.</p>
                </div>
              )}
              <p className="text-white text-lg mb-4">
                Target: <span className="font-bold text-primary">{config.targetReps} reps</span> in{" "}
                <span className="font-bold text-primary">{formatTime(config.timeLimit)}</span>
              </p>
              <Button
                size="lg"
                className="px-12 py-6 text-xl"
                onClick={handleStart}
                disabled={!isBodyDetected}
                data-testid="button-start-workout"
              >
                {isBodyDetected ? "Start Exercise" : "Get in Position"}
              </Button>
            </div>
          </div>
        )}
        
        {/* Back button */}
        <div className="absolute bottom-4 left-4 z-10">
          <Button variant="ghost" onClick={handleGoHome} data-testid="button-back">
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
