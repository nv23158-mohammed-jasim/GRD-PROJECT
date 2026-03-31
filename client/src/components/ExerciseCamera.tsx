import { useEffect, useState, useRef, useCallback } from "react";
import { usePoseDetection, type ExerciseType } from "@/hooks/use-pose-detection";
import { useCreateWorkoutSession } from "@/hooks/use-workout-sessions";
import { getDifficultyConfig, type DifficultyLevel, type IntensityLevel, type Grade } from "@shared/schema";
import { Check, Loader2, AlertCircle, ExternalLink, Square, Volume2, VolumeX, Timer, Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import type { BMIProfile } from "@/pages/BMIPage";

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

function estimateCalories(exerciseType: ExerciseType, timeTakenSec: number, reps: number, weightKg: number): number {
  const hours = timeTakenSec / 3600;
  const mets: Record<ExerciseType, number> = { pushups: 3.8, squats: 4.0, plank: 3.0 };
  return Math.max(1, Math.round(mets[exerciseType] * weightKg * hours));
}

function speak(text: string, enabled: boolean) {
  if (!enabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.2; u.pitch = 1.0; u.volume = 1.0;
  window.speechSynthesis.speak(u);
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function ExerciseCamera({ exerciseType, difficulty, intensity }: ExerciseCameraProps) {
  const [, setLocation] = useLocation();
  const config = getDifficultyConfig(exerciseType, difficulty, intensity);
  const isPlank = exerciseType === "plank";

  const {
    videoRef, canvasRef, isLoading, loadingStatus, error,
    isBodyDetected, repCount, debugInfo, exercisePhase,
    plankDetected, startCamera, stopCamera, enableCounting,
    disableCounting, resetReps,
  } = usePoseDetection(exerciseType);

  const createSession = useCreateWorkoutSession();

  const [workoutState, setWorkoutState] = useState<"ready" | "active" | "finished">("ready");
  const [timeRemaining, setTimeRemaining] = useState(config.timeLimit);
  const [finalReps, setFinalReps] = useState(0);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [calories, setCalories] = useState(0);

  // Rest timer state
  const [restActive, setRestActive] = useState(false);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const [showRestOptions, setShowRestOptions] = useState(false);
  const restTimerRef = useRef<number | null>(null);

  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const lastRepCountRef = useRef<number>(0);
  const lastPhaseRef = useRef<string>("");
  const guidanceTimeoutRef = useRef<number | null>(null);
  const announced30Ref = useRef<boolean>(false);
  const announced10Ref = useRef<boolean>(false);

  // Get user weight from BMI profile (for calorie estimate)
  const getUserWeight = (): number => {
    try {
      const saved = localStorage.getItem("fitness_bmi_profile");
      if (saved) { const p: BMIProfile = JSON.parse(saved); return p.weightKg; }
    } catch { /* ignore */ }
    return 70;
  };

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (timerRef.current) clearInterval(timerRef.current);
      if (guidanceTimeoutRef.current) clearTimeout(guidanceTimeoutRef.current);
      if (restTimerRef.current) clearInterval(restTimerRef.current);
    };
  }, [startCamera, stopCamera]);

  // Rest timer logic
  const startRest = (seconds: number) => {
    setShowRestOptions(false);
    setRestActive(true);
    setRestTimeLeft(seconds);
    speak(`Rest for ${seconds} seconds`, audioEnabled);
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    let remaining = seconds;
    restTimerRef.current = window.setInterval(() => {
      remaining--;
      setRestTimeLeft(remaining);
      if (remaining <= 0) {
        if (restTimerRef.current) clearInterval(restTimerRef.current);
        setRestActive(false);
        speak("Rest over! Go!", audioEnabled);
      }
    }, 1000);
  };

  const cancelRest = () => {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    setRestActive(false);
    setShowRestOptions(false);
  };

  // Audio guidance
  useEffect(() => {
    if (workoutState !== "active" || !audioEnabled) return;
    if (repCount > lastRepCountRef.current) {
      const msgs = ["Good!", "Nice!", "Keep going!", "Great rep!"];
      speak(msgs[Math.floor(Math.random() * msgs.length)], audioEnabled);
      lastRepCountRef.current = repCount;
    }
    if (exercisePhase !== lastPhaseRef.current) {
      lastPhaseRef.current = exercisePhase;
      if (guidanceTimeoutRef.current) clearTimeout(guidanceTimeoutRef.current);
      guidanceTimeoutRef.current = window.setTimeout(() => {
        if (isPlank) {
          if (exercisePhase === "down") speak("Get back in plank!", audioEnabled);
        } else {
          if (exercisePhase === "up") speak("Go down more", audioEnabled);
          else if (exercisePhase === "down") speak("Come back up", audioEnabled);
        }
      }, 3000);
    }
  }, [repCount, exercisePhase, workoutState, audioEnabled, isPlank]);

  const finishWorkout = useCallback(async (reps: number, elapsed: number, wasEarlyStop: boolean = false) => {
    disableCounting();
    setWorkoutState("finished");
    setFinalReps(reps);
    if (timerRef.current) clearInterval(timerRef.current);
    if (guidanceTimeoutRef.current) clearTimeout(guidanceTimeoutRef.current);
    if (restTimerRef.current) clearInterval(restTimerRef.current);

    const finalGrade = calculateGrade(reps, config.targetReps);
    setGrade(finalGrade);

    const weight = getUserWeight();
    const cal = estimateCalories(exerciseType, Math.min(elapsed, config.timeLimit), reps, weight);
    setCalories(cal);

    const unitLabel = isPlank ? "seconds" : "reps";
    if (wasEarlyStop) speak(`Workout stopped. You completed ${reps} ${unitLabel}.`, audioEnabled);
    else speak(`Time's up! ${reps} ${unitLabel}. Grade: ${finalGrade}`, audioEnabled);

    try {
      await createSession.mutateAsync({
        exerciseType, difficulty, intensity,
        targetReps: config.targetReps,
        completedReps: reps,
        timeLimit: config.timeLimit,
        timeTaken: Math.min(elapsed, config.timeLimit),
        grade: finalGrade,
      });
    } catch (err) { console.error("Failed to save:", err); }
  }, [config, exerciseType, difficulty, intensity, createSession, disableCounting, audioEnabled, isPlank]);

  const handleStart = () => {
    if (!isBodyDetected) return;
    if (isPlank && !plankDetected) return;
    resetReps();
    enableCounting();
    setWorkoutState("active");
    startTimeRef.current = Date.now();
    setTimeRemaining(config.timeLimit);
    lastRepCountRef.current = 0;
    lastPhaseRef.current = "";
    announced30Ref.current = false;
    announced10Ref.current = false;
    speak(isPlank ? "Hold your plank! Go!" : "Starting workout. Go!", audioEnabled);

    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = Math.max(0, config.timeLimit - elapsed);
      setTimeRemaining(remaining);
      if (remaining <= 30 && remaining > 25 && !announced30Ref.current && audioEnabled) {
        announced30Ref.current = true; speak("30 seconds left", true);
      } else if (remaining <= 10 && remaining > 5 && !announced10Ref.current && audioEnabled) {
        announced10Ref.current = true; speak("10 seconds", true);
      }
      if (remaining <= 0 && timerRef.current) clearInterval(timerRef.current);
    }, 100);
  };

  const handleStop = () => {
    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
    finishWorkout(repCount, elapsed, true);
  };

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
    setGrade(null); setFinalReps(0); setCalories(0);
    startTimeRef.current = 0; lastRepCountRef.current = 0;
    announced30Ref.current = false; announced10Ref.current = false;
  };

  const handleGoHome = () => {
    stopCamera();
    window.speechSynthesis?.cancel();
    setLocation("/");
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
              <p className="text-yellow-400 mb-4">Camera doesn't work in the embedded preview.</p>
              <a href={window.location.href} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-md font-medium mb-4">
                <ExternalLink className="w-4 h-4" /> Open in New Tab
              </a>
            </>
          ) : (
            <p className="text-muted-foreground mb-4">{error}</p>
          )}
          <Button variant="outline" onClick={handleGoHome} className="w-full">Go Back</Button>
        </div>
      </div>
    );
  }

  // Finished screen
  if (workoutState === "finished" && grade) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
        <div className="text-center max-w-sm w-full">
          <div className={`text-9xl font-bold mb-6 ${getGradeColor(grade)}`}>{grade}</div>
          <p className="text-white text-2xl mb-1 capitalize">
            {isPlank ? "Plank Hold" : exerciseType} — {difficulty}
          </p>
          <p className="text-muted-foreground text-xl mb-6">
            {isPlank
              ? `${finalReps}s / ${config.targetReps}s held`
              : `${finalReps} / ${config.targetReps} reps completed`}
          </p>

          {/* Calorie estimate */}
          <div className="bg-zinc-800 rounded-2xl px-8 py-5 mb-8 flex justify-center gap-10">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{calories}</p>
              <p className="text-muted-foreground text-sm">kcal burned</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{formatSeconds(config.timeLimit - timeRemaining)}</p>
              <p className="text-muted-foreground text-sm">time taken</p>
            </div>
          </div>

          <div className="flex gap-4 justify-center">
            <Button variant="outline" onClick={handleTryAgain}>Try Again</Button>
            <Button onClick={handleGoHome}>Back to Home</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 relative">
      <div className="relative w-full h-screen">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover transform -scale-x-100" playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none" />

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

        {/* Body + Plank detection indicators */}
        {!isLoading && (
          <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
            <div className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isBodyDetected ? "bg-green-500" : "bg-red-500/50"}`}>
                {isBodyDetected && <Check className="w-6 h-6 text-white" />}
              </div>
              <span className="text-white text-sm font-medium bg-black/50 px-2 py-1 rounded">
                {isBodyDetected ? "Body Detected" : "Get in frame"}
              </span>
            </div>
            {(exerciseType === "pushups" || exerciseType === "plank") && isBodyDetected && (
              <div className="flex items-center gap-2">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${plankDetected ? "bg-green-500" : "bg-yellow-500/70"}`}>
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
            <Button variant="ghost" size="icon" onClick={() => {
              const newState = !audioEnabled;
              setAudioEnabled(newState);
              if (!newState) window.speechSynthesis?.cancel();
            }} className="bg-black/50" data-testid="button-audio-toggle">
              {audioEnabled ? <Volume2 className="w-5 h-5 text-white" /> : <VolumeX className="w-5 h-5 text-white" />}
            </Button>
          </div>
        )}

        {/* Exercise info */}
        <div className="absolute top-4 right-4 z-10">
          <div className="bg-black/60 backdrop-blur-sm rounded-lg p-4">
            <p className="text-primary font-bold text-lg uppercase">
              {isPlank ? "Plank Hold" : exerciseType}
            </p>
            <p className="text-muted-foreground text-sm capitalize">{difficulty}</p>
          </div>
        </div>

        {/* Active workout display */}
        {workoutState === "active" && (
          <>
            <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 z-10">
              <div className="text-8xl font-bold text-white drop-shadow-lg">
                {formatSeconds(timeRemaining)}
              </div>
            </div>

            {/* Plank lost warning */}
            {(exerciseType === "pushups" || isPlank) && !plankDetected && !restActive && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
                <div className="bg-yellow-500/80 backdrop-blur-sm rounded-xl px-6 py-3 text-center">
                  <p className="text-black font-bold text-lg">⚠ Get back in plank!</p>
                  <p className="text-black/80 text-sm">Keep your body horizontal & sideways</p>
                </div>
              </div>
            )}

            {/* Rest timer overlay */}
            {restActive && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
                <div className="text-center">
                  <Coffee className="w-12 h-12 text-blue-400 mx-auto mb-4" />
                  <p className="text-white text-2xl mb-2">Rest Time</p>
                  <p className="text-blue-400 text-8xl font-bold mb-6">{restTimeLeft}</p>
                  <Button variant="outline" onClick={cancelRest}>Skip Rest</Button>
                </div>
              </div>
            )}

            {/* Rep / hold time counter */}
            <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 z-10">
              <div className="bg-black/60 backdrop-blur-sm rounded-2xl px-12 py-6 text-center">
                <p className="text-6xl font-bold text-white">
                  {isPlank ? formatSeconds(repCount) : repCount}
                </p>
                <p className="text-muted-foreground text-lg">
                  {isPlank ? `/ ${config.targetReps}s target` : `/ ${config.targetReps} reps`}
                </p>
                {debugInfo && <p className="text-yellow-400 text-sm mt-2">{debugInfo}</p>}
              </div>
            </div>

            {/* Rest button + stop button */}
            <div className="absolute bottom-4 right-4 z-10 flex gap-2">
              {!isPlank && !restActive && (
                <div className="relative">
                  <Button
                    variant="secondary"
                    onClick={() => setShowRestOptions(p => !p)}
                    data-testid="button-rest"
                  >
                    <Timer className="w-4 h-4 mr-2" />
                    Rest
                  </Button>
                  {showRestOptions && (
                    <div className="absolute bottom-12 right-0 bg-zinc-800 border border-white/10 rounded-xl p-2 flex flex-col gap-1 shadow-lg min-w-[110px]">
                      {[30, 60, 90].map(s => (
                        <Button key={s} size="sm" variant="ghost" className="justify-start"
                          onClick={() => startRest(s)} data-testid={`button-rest-${s}s`}>
                          {s}s rest
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <Button variant="destructive" onClick={handleStop} data-testid="button-stop-workout">
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
              {(exerciseType === "pushups" || isPlank) && (
                <div className="bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 mb-4 text-sm text-left">
                  <p className="text-primary font-semibold mb-1">📐 Side Profile Setup</p>
                  <p className="text-white/80">
                    Turn your body <span className="text-yellow-300 font-bold">sideways</span> to the camera so the AI can see your arm bend.
                  </p>
                  {isPlank && (
                    <p className="text-white/60 mt-1 text-xs">Get into plank position, then press Start.</p>
                  )}
                </div>
              )}
              <p className="text-white text-lg mb-4">
                Target:{" "}
                <span className="font-bold text-primary">
                  {isPlank ? `${config.targetReps}s hold` : `${config.targetReps} reps`}
                </span>{" "}
                in{" "}
                <span className="font-bold text-primary">{formatSeconds(config.timeLimit)}</span>
              </p>
              <Button
                size="lg"
                className="px-12 py-6 text-xl"
                onClick={handleStart}
                disabled={!isBodyDetected || (isPlank && !plankDetected)}
                data-testid="button-start-workout"
              >
                {!isBodyDetected
                  ? "Get in Position"
                  : isPlank && !plankDetected
                    ? "Hold Plank First"
                    : isPlank
                      ? "Start Holding"
                      : "Start Exercise"}
              </Button>
            </div>
          </div>
        )}

        <div className="absolute bottom-4 left-4 z-10">
          <Button variant="ghost" onClick={handleGoHome} data-testid="button-back">Back</Button>
        </div>
      </div>
    </div>
  );
}
