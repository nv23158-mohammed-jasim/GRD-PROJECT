import { useRef, useState, useCallback, useEffect } from "react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";

export type ExerciseType = "pushups" | "squats" | "plank";

interface UsePoseDetectionResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isLoading: boolean;
  loadingStatus: string;
  error: string | null;
  isBodyDetected: boolean;
  repCount: number;
  isCountingEnabled: boolean;
  debugInfo: string;
  exercisePhase: "up" | "down";
  plankDetected: boolean;
  squatDepth: number;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  enableCounting: () => void;
  disableCounting: () => void;
  resetReps: () => void;
}

interface ValueBuffer {
  values: number[];
  maxSize: number;
}

function createValueBuffer(maxSize: number = 5): ValueBuffer {
  return { values: [], maxSize };
}

function addToBuffer(buffer: ValueBuffer, value: number): number {
  buffer.values.push(value);
  if (buffer.values.length > buffer.maxSize) buffer.values.shift();
  return buffer.values.reduce((a, b) => a + b, 0) / buffer.values.length;
}

export function usePoseDetection(exerciseType: ExerciseType): UsePoseDetectionResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Initializing...");
  const [error, setError] = useState<string | null>(null);
  const [isBodyDetected, setIsBodyDetected] = useState(false);
  const [repCount, setRepCount] = useState(0);
  const [isCountingEnabled, setIsCountingEnabled] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");
  const [exercisePhase, setExercisePhase] = useState<"up" | "down">("up");
  const [plankDetected, setPlankDetected] = useState(false);
  const [squatDepth, setSquatDepth] = useState(0);

  const exercisePhaseRef = useRef<"up" | "down">("up");
  const countingEnabledRef = useRef(false);
  const angleBufferRef = useRef<ValueBuffer>(createValueBuffer(5));
  const standingHipRatioRef = useRef<number | null>(null);
  const calibrationFramesRef = useRef<number>(0);
  const squatDepthBufferRef = useRef<ValueBuffer>(createValueBuffer(7));
  const squatDepthDisplayRef = useRef<number>(0);
  const lastRepTimeRef = useRef<number>(0);

  // Plank hold accumulation
  const plankStartTimeRef = useRef<number | null>(null);
  const plankAccumulatedRef = useRef<number>(0);
  const plankLastCountRef = useRef<number>(0);

  const MIN_REP_INTERVAL = 600;

  const calculateAngle = (
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number }
  ): number => {
    const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angle = Math.abs((radians * 180) / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  };

  const getAveragePoint = (
    keypoints: poseDetection.Keypoint[],
    leftName: string,
    rightName: string,
    minConfidence: number
  ): { x: number; y: number; valid: boolean } => {
    const left = keypoints.find(k => k.name === leftName);
    const right = keypoints.find(k => k.name === rightName);
    const leftValid = left && (left.score ?? 0) > minConfidence;
    const rightValid = right && (right.score ?? 0) > minConfidence;
    if (leftValid && rightValid) return { x: (left!.x + right!.x) / 2, y: (left!.y + right!.y) / 2, valid: true };
    if (leftValid) return { x: left!.x, y: left!.y, valid: true };
    if (rightValid) return { x: right!.x, y: right!.y, valid: true };
    return { x: 0, y: 0, valid: false };
  };

  // Check if body is in plank position (shoulder and hip at similar heights)
  const checkPlankPosition = useCallback((
    shoulder: poseDetection.Keypoint,
    hip: poseDetection.Keypoint | undefined,
    ankle: poseDetection.Keypoint | undefined
  ): boolean => {
    const frameHeight = videoRef.current?.videoHeight || 480;
    if (!hip || (hip.score ?? 0) < 0.15) return true;
    const shoulderY = shoulder.y / frameHeight;
    const hipY = hip.y / frameHeight;
    if (Math.abs(hipY - shoulderY) > 0.22) return false;
    if (hipY > shoulderY + 0.22) return false;
    if (ankle && (ankle.score ?? 0) > 0.15) {
      if (Math.abs((ankle.y / frameHeight) - shoulderY) > 0.28) return false;
    }
    return true;
  }, []);

  const processPose = useCallback((keypoints: poseDetection.Keypoint[]) => {
    const minConf = 0.2;

    // Always check plank for pushup/plank display even when not counting
    if (exerciseType === "pushups" || exerciseType === "plank") {
      const lShoulder = keypoints.find(k => k.name === "left_shoulder");
      const lElbow = keypoints.find(k => k.name === "left_elbow");
      const lWrist = keypoints.find(k => k.name === "left_wrist");
      const rShoulder = keypoints.find(k => k.name === "right_shoulder");
      const rElbow = keypoints.find(k => k.name === "right_elbow");
      const rWrist = keypoints.find(k => k.name === "right_wrist");
      const lHip = keypoints.find(k => k.name === "left_hip");
      const rHip = keypoints.find(k => k.name === "right_hip");
      const lAnkle = keypoints.find(k => k.name === "left_ankle");
      const rAnkle = keypoints.find(k => k.name === "right_ankle");

      const lScore = Math.min(lShoulder?.score ?? 0, lElbow?.score ?? 0, lWrist?.score ?? 0);
      const rScore = Math.min(rShoulder?.score ?? 0, rElbow?.score ?? 0, rWrist?.score ?? 0);

      let shoulder: poseDetection.Keypoint | undefined;
      let hip: poseDetection.Keypoint | undefined;
      let ankle: poseDetection.Keypoint | undefined;

      if (lScore >= rScore && lScore > minConf) {
        shoulder = lShoulder; hip = lHip; ankle = lAnkle;
      } else if (rScore > minConf) {
        shoulder = rShoulder; hip = rHip; ankle = rAnkle;
      }

      if (shoulder) {
        const inPlank = checkPlankPosition(shoulder, hip, ankle);
        setPlankDetected(inPlank);
      }
    }

    if (!countingEnabledRef.current) return;

    if (exerciseType === "pushups") {
      // ---- SIDE-PROFILE PUSH-UPS ----
      const lShoulder = keypoints.find(k => k.name === "left_shoulder");
      const lElbow = keypoints.find(k => k.name === "left_elbow");
      const lWrist = keypoints.find(k => k.name === "left_wrist");
      const rShoulder = keypoints.find(k => k.name === "right_shoulder");
      const rElbow = keypoints.find(k => k.name === "right_elbow");
      const rWrist = keypoints.find(k => k.name === "right_wrist");
      const lHip = keypoints.find(k => k.name === "left_hip");
      const rHip = keypoints.find(k => k.name === "right_hip");
      const lAnkle = keypoints.find(k => k.name === "left_ankle");
      const rAnkle = keypoints.find(k => k.name === "right_ankle");

      const lScore = Math.min(lShoulder?.score ?? 0, lElbow?.score ?? 0, lWrist?.score ?? 0);
      const rScore = Math.min(rShoulder?.score ?? 0, rElbow?.score ?? 0, rWrist?.score ?? 0);

      let shoulder: poseDetection.Keypoint | undefined;
      let elbow: poseDetection.Keypoint | undefined;
      let wrist: poseDetection.Keypoint | undefined;
      let hip: poseDetection.Keypoint | undefined;
      let ankle: poseDetection.Keypoint | undefined;

      if (lScore >= rScore && lScore > minConf) {
        shoulder = lShoulder; elbow = lElbow; wrist = lWrist; hip = lHip; ankle = lAnkle;
      } else if (rScore > minConf) {
        shoulder = rShoulder; elbow = rElbow; wrist = rWrist; hip = rHip; ankle = rAnkle;
      }

      if (!shoulder || !elbow || !wrist) {
        setDebugInfo("Arm not visible — face sideways");
        return;
      }

      const inPlank = checkPlankPosition(shoulder, hip, ankle);
      if (!inPlank) {
        setDebugInfo(`Not in plank | Elbow: ${Math.round(calculateAngle(shoulder, elbow, wrist))}°`);
        if (exercisePhaseRef.current === "down") { exercisePhaseRef.current = "up"; setExercisePhase("up"); }
        return;
      }

      const rawAngle = calculateAngle(shoulder, elbow, wrist);
      const smoothedAngle = addToBuffer(angleBufferRef.current, rawAngle);
      setDebugInfo(`Plank ✓ | Elbow: ${Math.round(smoothedAngle)}°`);

      const now = Date.now();
      if (exercisePhaseRef.current === "up" && smoothedAngle < 100) {
        exercisePhaseRef.current = "down"; setExercisePhase("down");
      } else if (exercisePhaseRef.current === "down" && smoothedAngle > 145) {
        if (now - lastRepTimeRef.current >= MIN_REP_INTERVAL) {
          exercisePhaseRef.current = "up"; setExercisePhase("up");
          lastRepTimeRef.current = now;
          setRepCount(prev => prev + 1);
        }
      }

    } else if (exerciseType === "plank") {
      // ---- PLANK HOLD TIMER ----
      const lShoulder = keypoints.find(k => k.name === "left_shoulder");
      const lElbow = keypoints.find(k => k.name === "left_elbow");
      const lWrist = keypoints.find(k => k.name === "left_wrist");
      const rShoulder = keypoints.find(k => k.name === "right_shoulder");
      const rElbow = keypoints.find(k => k.name === "right_elbow");
      const rWrist = keypoints.find(k => k.name === "right_wrist");
      const lHip = keypoints.find(k => k.name === "left_hip");
      const rHip = keypoints.find(k => k.name === "right_hip");
      const lAnkle = keypoints.find(k => k.name === "left_ankle");
      const rAnkle = keypoints.find(k => k.name === "right_ankle");

      const lScore = Math.min(lShoulder?.score ?? 0, lElbow?.score ?? 0, lWrist?.score ?? 0);
      const rScore = Math.min(rShoulder?.score ?? 0, rElbow?.score ?? 0, rWrist?.score ?? 0);

      let shoulder: poseDetection.Keypoint | undefined;
      let hip: poseDetection.Keypoint | undefined;
      let ankle: poseDetection.Keypoint | undefined;

      if (lScore >= rScore && lScore > minConf) { shoulder = lShoulder; hip = lHip; ankle = lAnkle; }
      else if (rScore > minConf) { shoulder = rShoulder; hip = rHip; ankle = rAnkle; }

      const inPlank = shoulder ? checkPlankPosition(shoulder, hip, ankle) : false;
      setPlankDetected(inPlank);

      if (inPlank) {
        if (plankStartTimeRef.current === null) plankStartTimeRef.current = Date.now();
        const currentHold = Math.floor((Date.now() - plankStartTimeRef.current) / 1000);
        const total = plankAccumulatedRef.current + currentHold;
        if (total !== plankLastCountRef.current) {
          plankLastCountRef.current = total;
          setRepCount(total);
        }
        exercisePhaseRef.current = "up";
        setExercisePhase("up");
        setDebugInfo(`Holding: ${total}s`);
      } else {
        if (plankStartTimeRef.current !== null) {
          plankAccumulatedRef.current += Math.floor((Date.now() - plankStartTimeRef.current) / 1000);
          plankStartTimeRef.current = null;
        }
        exercisePhaseRef.current = "down";
        setExercisePhase("down");
        setDebugInfo(`Break: ${plankAccumulatedRef.current}s accumulated`);
        setRepCount(plankAccumulatedRef.current);
      }

    } else {
      // ---- SQUATS ----
      // Try side-profile knee angle first (more accurate), fall back to hip position
      const lHip = keypoints.find(k => k.name === "left_hip");
      const lKnee = keypoints.find(k => k.name === "left_knee");
      const lAnkle = keypoints.find(k => k.name === "left_ankle");
      const rHip = keypoints.find(k => k.name === "right_hip");
      const rKnee = keypoints.find(k => k.name === "right_knee");
      const rAnkle = keypoints.find(k => k.name === "right_ankle");

      const lKneeScore = Math.min(lHip?.score ?? 0, lKnee?.score ?? 0, lAnkle?.score ?? 0);
      const rKneeScore = Math.min(rHip?.score ?? 0, rKnee?.score ?? 0, rAnkle?.score ?? 0);
      const bestKneeScore = Math.max(lKneeScore, rKneeScore);

      if (bestKneeScore > 0.3) {
        // Use knee angle (side profile)
        let hip: poseDetection.Keypoint, knee: poseDetection.Keypoint, ankle: poseDetection.Keypoint;
        if (lKneeScore >= rKneeScore) {
          hip = lHip!; knee = lKnee!; ankle = lAnkle!;
        } else {
          hip = rHip!; knee = rKnee!; ankle = rAnkle!;
        }

        const kneeAngle = calculateAngle(hip, knee, ankle);
        const smoothed = addToBuffer(angleBufferRef.current, kneeAngle);

        // Depth: 0 = standing (~170°), 1 = full squat (~90°)
        const depth = Math.min(1, Math.max(0, (170 - smoothed) / 80));
        squatDepthDisplayRef.current = depth;
        setSquatDepth(depth);
        setDebugInfo(`Knee: ${Math.round(smoothed)}° | Depth: ${Math.round(depth * 100)}%`);

        const now = Date.now();
        if (exercisePhaseRef.current === "up" && smoothed < 120) {
          exercisePhaseRef.current = "down"; setExercisePhase("down");
        } else if (exercisePhaseRef.current === "down" && smoothed > 155) {
          if (now - lastRepTimeRef.current >= MIN_REP_INTERVAL) {
            exercisePhaseRef.current = "up"; setExercisePhase("up");
            lastRepTimeRef.current = now;
            setRepCount(prev => prev + 1);
          }
        }
      } else {
        // Fall back: vertical hip position
        const shoulders = getAveragePoint(keypoints, "left_shoulder", "right_shoulder", minConf);
        const hips = getAveragePoint(keypoints, "left_hip", "right_hip", minConf);
        const knees = getAveragePoint(keypoints, "left_knee", "right_knee", minConf);

        if (!shoulders.valid || !hips.valid) return;

        const shoulderToHip = hips.y - shoulders.y;
        let squatDepthVal: number;

        if (knees.valid) {
          const shoulderToKnee = knees.y - shoulders.y;
          if (shoulderToKnee <= 0) return;
          squatDepthVal = shoulderToHip / shoulderToKnee;
        } else {
          const frameHeight = videoRef.current?.videoHeight || 480;
          squatDepthVal = shoulderToHip / (frameHeight * 0.4);
        }

        const smoothedDepth = addToBuffer(squatDepthBufferRef.current, squatDepthVal);

        if (calibrationFramesRef.current < 10) {
          calibrationFramesRef.current++;
          if (standingHipRatioRef.current === null || smoothedDepth < standingHipRatioRef.current) {
            standingHipRatioRef.current = smoothedDepth;
          }
          setDebugInfo(`Calibrating... ${calibrationFramesRef.current}/10`);
          return;
        }

        const standingRatio = standingHipRatioRef.current || 0.5;
        const depthChange = smoothedDepth - standingRatio;
        const visualDepth = Math.min(1, Math.max(0, depthChange / 0.3));
        squatDepthDisplayRef.current = visualDepth;
        setSquatDepth(visualDepth);
        setDebugInfo(`Depth: ${(depthChange * 100).toFixed(0)}%`);

        const now = Date.now();
        if (exercisePhaseRef.current === "up" && depthChange > 0.12) {
          exercisePhaseRef.current = "down"; setExercisePhase("down");
        } else if (exercisePhaseRef.current === "down" && depthChange < 0.06) {
          if (now - lastRepTimeRef.current >= MIN_REP_INTERVAL) {
            exercisePhaseRef.current = "up"; setExercisePhase("up");
            lastRepTimeRef.current = now;
            setRepCount(prev => prev + 1);
          }
        }
      }
    }
  }, [exerciseType, checkPlankPosition]);

  const drawSkeleton = useCallback((keypoints: poseDetection.Keypoint[], canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const connections = [
      ["nose", "left_eye"], ["nose", "right_eye"],
      ["left_eye", "left_ear"], ["right_eye", "right_ear"],
      ["left_shoulder", "right_shoulder"],
      ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
      ["left_hip", "right_hip"],
      ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
      ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
      ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
      ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
    ];

    const getPoint = (name: string) => keypoints.find(k => k.name === name);

    ctx.strokeStyle = "#ff3333";
    ctx.lineWidth = 4;
    connections.forEach(([a, b]) => {
      const p1 = getPoint(a);
      const p2 = getPoint(b);
      if (p1 && p2 && (p1.score ?? 0) > 0.2 && (p2.score ?? 0) > 0.2) {
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
    });

    keypoints.forEach(kp => {
      const confidence = kp.score ?? 0;
      if (confidence > 0.2) {
        ctx.beginPath(); ctx.arc(kp.x, kp.y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = confidence > 0.6 ? "#00ff00" : confidence > 0.4 ? "#ffff00" : "#ff6600";
        ctx.fill();
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.stroke();
      }
    });

    // Phase indicator
    const phase = exercisePhaseRef.current;
    ctx.fillStyle = (exerciseType === "plank")
      ? (phase === "up" ? "#00ff88" : "#ff4444")
      : (phase === "down" ? "#00ff00" : "#ffffff");
    ctx.font = "bold 24px Arial";
    ctx.fillText(
      exerciseType === "plank" ? (phase === "up" ? "HOLDING" : "BROKEN") : phase.toUpperCase(),
      20, canvas.height - 20
    );

    // Squat depth indicator
    if (exerciseType === "squats") {
      const depth = squatDepthDisplayRef.current;
      const bx = canvas.width - 28;
      const bh = 150;
      const by = (canvas.height - bh) / 2;
      const bw = 16;

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(bx, by, bw, bh);

      const fillH = bh * depth;
      const fillY = by + bh - fillH;
      ctx.fillStyle = depth > 0.5 ? "#00ff88" : depth > 0.25 ? "#ffaa00" : "#ff4444";
      ctx.fillRect(bx, fillY, bw, fillH);

      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.fillText("DEPTH", bx + bw / 2, by - 6);
      ctx.fillText(`${Math.round(depth * 100)}%`, bx + bw / 2, by + bh + 14);
      ctx.textAlign = "left";
    }
  }, [exerciseType]);

  const runDetection = useCallback(async () => {
    if (!isRunningRef.current) return;
    if (!detectorRef.current || !videoRef.current || !canvasRef.current) {
      animationFrameRef.current = requestAnimationFrame(runDetection); return;
    }
    const video = videoRef.current;
    if (video.readyState >= 2) {
      try {
        const poses = await detectorRef.current.estimatePoses(video);
        if (poses.length > 0 && poses[0].keypoints) {
          const keypoints = poses[0].keypoints;
          const threshold = exerciseType === "squats" ? 0.25 : 0.2;
          const minCount = exerciseType === "squats" ? 8 : 6;
          setIsBodyDetected(keypoints.filter(k => (k.score ?? 0) > threshold).length >= minCount);
          drawSkeleton(keypoints, canvasRef.current!, video);
          processPose(keypoints);
        } else {
          setIsBodyDetected(false);
        }
      } catch (e) { console.error("Detection error:", e); }
    }
    animationFrameRef.current = requestAnimationFrame(runDetection);
  }, [drawSkeleton, processPose, exerciseType]);

  const startCamera = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      setLoadingStatus("Setting up TensorFlow...");
      await tf.ready(); await tf.setBackend("webgl");

      setLoadingStatus("Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((resolve, reject) => {
          const video = videoRef.current!;
          video.onloadedmetadata = () => video.play().then(resolve).catch(reject);
          video.onerror = () => reject(new Error("Video failed to load"));
        });
      }

      setLoadingStatus("Loading AI model (may take 10–20 seconds)...");
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
      );
      detectorRef.current = detector;
      isRunningRef.current = true;
      runDetection();
      setIsLoading(false); setLoadingStatus("");
    } catch (err: any) {
      let message = "Failed to start camera.";
      if (err.name === "NotAllowedError") message = "Camera access was denied. Please allow camera access and reload.";
      else if (err.name === "NotFoundError") message = "No camera found. Please connect a camera.";
      else if (err.name === "NotReadableError") message = "Camera is being used by another app.";
      else if (err.message) message = err.message;
      setError(message); setIsLoading(false);
    }
  }, [runDetection]);

  const stopCamera = useCallback(() => {
    isRunningRef.current = false;
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (detectorRef.current) { detectorRef.current.dispose(); detectorRef.current = null; }
  }, []);

  const enableCounting = useCallback(() => {
    countingEnabledRef.current = true;
    exercisePhaseRef.current = "up"; setExercisePhase("up");
    angleBufferRef.current = createValueBuffer(5);
    squatDepthBufferRef.current = createValueBuffer(7);
    standingHipRatioRef.current = null; calibrationFramesRef.current = 0;
    lastRepTimeRef.current = 0;
    plankStartTimeRef.current = null; plankAccumulatedRef.current = 0; plankLastCountRef.current = 0;
    setIsCountingEnabled(true);
  }, []);

  const disableCounting = useCallback(() => {
    countingEnabledRef.current = false;
    // Flush any active plank hold
    if (plankStartTimeRef.current !== null) {
      plankAccumulatedRef.current += Math.floor((Date.now() - plankStartTimeRef.current) / 1000);
      plankStartTimeRef.current = null;
    }
    setIsCountingEnabled(false);
  }, []);

  const resetReps = useCallback(() => {
    setRepCount(0);
    exercisePhaseRef.current = "up"; setExercisePhase("up");
    angleBufferRef.current = createValueBuffer(5);
    squatDepthBufferRef.current = createValueBuffer(7);
    standingHipRatioRef.current = null; calibrationFramesRef.current = 0;
    lastRepTimeRef.current = 0;
    plankStartTimeRef.current = null; plankAccumulatedRef.current = 0; plankLastCountRef.current = 0;
  }, []);

  useEffect(() => { return () => { stopCamera(); }; }, [stopCamera]);

  return {
    videoRef, canvasRef, isLoading, loadingStatus, error,
    isBodyDetected, repCount, isCountingEnabled, debugInfo,
    exercisePhase, plankDetected, squatDepth,
    startCamera, stopCamera, enableCounting, disableCounting, resetReps,
  };
}
