import { useRef, useState, useCallback, useEffect } from "react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";

interface UseGamePoseDetectionResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  smallCanvasRef: React.RefObject<HTMLCanvasElement>;
  isLoading: boolean;
  loadingStatus: string;
  error: string | null;
  isBodyDetected: boolean;
  isRunning: boolean;
  isJumping: boolean;
  isDucking: boolean;
  isPushup: boolean;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
}

interface ValueBuffer {
  values: number[];
  maxSize: number;
}

function createValueBuffer(maxSize: number = 8): ValueBuffer {
  return { values: [], maxSize };
}

function addToBuffer(buffer: ValueBuffer, value: number): number {
  buffer.values.push(value);
  if (buffer.values.length > buffer.maxSize) {
    buffer.values.shift();
  }
  return buffer.values.reduce((a, b) => a + b, 0) / buffer.values.length;
}

// Compute variance (spread) in a buffer — high variance = oscillation = movement
function bufferVariance(buffer: ValueBuffer): number {
  if (buffer.values.length < 2) return 0;
  const mean = buffer.values.reduce((a, b) => a + b, 0) / buffer.values.length;
  return buffer.values.reduce((s, v) => s + (v - mean) ** 2, 0) / buffer.values.length;
}

export function useGamePoseDetection(): UseGamePoseDetectionResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const smallCanvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Initializing...");
  const [error, setError] = useState<string | null>(null);
  const [isBodyDetected, setIsBodyDetected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isJumping, setIsJumping] = useState(false);
  const [isDucking, setIsDucking] = useState(false);
  const [isPushup, setIsPushup] = useState(false);

  // Per-wrist Y history — track each independently for oscillation
  const leftWristYBufferRef  = useRef<ValueBuffer>(createValueBuffer(12));
  const rightWristYBufferRef = useRef<ValueBuffer>(createValueBuffer(12));
  // Per-wrist X history for horizontal arm swing
  const leftWristXBufferRef  = useRef<ValueBuffer>(createValueBuffer(12));
  const rightWristXBufferRef = useRef<ValueBuffer>(createValueBuffer(12));
  // Knee Y history (bonus signal)
  const leftKneeYBufferRef   = useRef<ValueBuffer>(createValueBuffer(12));
  const rightKneeYBufferRef  = useRef<ValueBuffer>(createValueBuffer(12));

  const shoulderYBufferRef   = useRef<ValueBuffer>(createValueBuffer(5));
  const hipYBufferRef        = useRef<ValueBuffer>(createValueBuffer(5));
  const elbowAngleBufferRef  = useRef<ValueBuffer>(createValueBuffer(5));

  const runningScoreRef = useRef<number>(0);

  // Calibration
  const standingShoulderYRef = useRef<number | null>(null);
  const standingHipYRef      = useRef<number | null>(null);
  const calibrationFramesRef = useRef<number>(0);

  const calculateAngle = (
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number }
  ): number => {
    const radians =
      Math.atan2(p3.y - p2.y, p3.x - p2.x) -
      Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angle = Math.abs((radians * 180) / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  };

  const getKeypoint = (
    keypoints: poseDetection.Keypoint[],
    name: string,
    minConfidence: number
  ): { x: number; y: number } | null => {
    const kp = keypoints.find(k => k.name === name);
    if (kp && (kp.score ?? 0) > minConfidence) {
      return { x: kp.x, y: kp.y };
    }
    return null;
  };

  const getAverageY = (
    keypoints: poseDetection.Keypoint[],
    leftName: string,
    rightName: string,
    minConfidence: number
  ): number | null => {
    const left  = getKeypoint(keypoints, leftName,  minConfidence);
    const right = getKeypoint(keypoints, rightName, minConfidence);
    if (left && right) return (left.y + right.y) / 2;
    if (left)  return left.y;
    if (right) return right.y;
    return null;
  };

  const processPose = useCallback((keypoints: poseDetection.Keypoint[]) => {
    const minConf = 0.2;  // lower confidence threshold to catch more keypoints

    const shoulderY = getAverageY(keypoints, "left_shoulder",  "right_shoulder", minConf);
    const hipY      = getAverageY(keypoints, "left_hip",       "right_hip",      minConf);
    const wristY    = getAverageY(keypoints, "left_wrist",     "right_wrist",    minConf);

    if (shoulderY === null || hipY === null) return;

    const smoothedShoulderY = addToBuffer(shoulderYBufferRef.current, shoulderY);
    const smoothedHipY      = addToBuffer(hipYBufferRef.current, hipY);
    const smoothedWristY    = wristY !== null ? addToBuffer({ values: [], maxSize: 5 }, wristY) : null;

    // Calibration — first 20 frames
    if (calibrationFramesRef.current < 20) {
      calibrationFramesRef.current++;
      if (standingShoulderYRef.current === null || smoothedShoulderY < standingShoulderYRef.current) {
        standingShoulderYRef.current = smoothedShoulderY;
      }
      if (standingHipYRef.current === null || smoothedHipY < standingHipYRef.current) {
        standingHipYRef.current = smoothedHipY;
      }
      return;
    }

    const standingShoulderY = standingShoulderYRef.current ?? smoothedShoulderY;
    const standingHipY      = standingHipYRef.current      ?? smoothedHipY;
    const frameHeight       = videoRef.current?.videoHeight ?? 480;

    // ── RUNNING DETECTION ──────────────────────────────────────────────────
    // Primary signal: wrist oscillation (arm swing while running/jogging)
    // We track each wrist's Y and X independently and measure their variance.
    // High variance = the wrist is moving up/down or side-to-side = running.

    const lWrist = getKeypoint(keypoints, "left_wrist",  minConf);
    const rWrist = getKeypoint(keypoints, "right_wrist", minConf);
    const lKnee  = getKeypoint(keypoints, "left_knee",   minConf);
    const rKnee  = getKeypoint(keypoints, "right_knee",  minConf);

    if (lWrist) {
      addToBuffer(leftWristYBufferRef.current,  lWrist.y);
      addToBuffer(leftWristXBufferRef.current,  lWrist.x);
    }
    if (rWrist) {
      addToBuffer(rightWristYBufferRef.current, rWrist.y);
      addToBuffer(rightWristXBufferRef.current, rWrist.x);
    }
    if (lKnee) addToBuffer(leftKneeYBufferRef.current,  lKnee.y);
    if (rKnee) addToBuffer(rightKneeYBufferRef.current, rKnee.y);

    // Variance per body part (squared pixels — high value = oscillating)
    const lWristVarY  = bufferVariance(leftWristYBufferRef.current);
    const rWristVarY  = bufferVariance(rightWristYBufferRef.current);
    const lWristVarX  = bufferVariance(leftWristXBufferRef.current);
    const rWristVarX  = bufferVariance(rightWristXBufferRef.current);
    const lKneeVarY   = bufferVariance(leftKneeYBufferRef.current);
    const rKneeVarY   = bufferVariance(rightKneeYBufferRef.current);

    // Combined wrist movement score (Y and X oscillation on either hand)
    // Threshold: variance > 30 (~5–6px RMS) is enough to trigger
    const wristMovement = Math.max(lWristVarY, rWristVarY, lWristVarX * 0.7, rWristVarX * 0.7);
    const kneeMovement  = Math.max(lKneeVarY,  rKneeVarY);

    // Shoulder oscillation (secondary, still useful for upper-body bob)
    const shoulderOscillation = Math.abs(smoothedShoulderY - standingShoulderY);

    // Running = hands oscillating (primary) OR knees bouncing (secondary) OR shoulder bob
    const WRIST_THRESH   = 30;   // variance in px²  (~5–6px RMS movement)
    const KNEE_THRESH    = 40;   // variance in px²
    const SHOULDER_THRESH = 5;   // px deviation from standing

    const isMoving =
      wristMovement  > WRIST_THRESH  ||
      kneeMovement   > KNEE_THRESH   ||
      shoulderOscillation > SHOULDER_THRESH;

    // Hysteresis: fast to start (score += 5), slow to stop (score -= 1)
    if (isMoving) {
      runningScoreRef.current = Math.min(10, runningScoreRef.current + 5);
    } else {
      runningScoreRef.current = Math.max(0,  runningScoreRef.current - 1);
    }

    setIsRunning(runningScoreRef.current >= 3);

    // ── JUMPING: both wrists clearly above shoulders ───────────────────────
    if (lWrist && rWrist) {
      const armsRaised = lWrist.y < smoothedShoulderY - 20 && rWrist.y < smoothedShoulderY - 20;
      setIsJumping(armsRaised);
    } else if (smoothedWristY !== null) {
      setIsJumping(smoothedWristY < smoothedShoulderY - 30);
    }

    // ── DUCKING: hip dropped from standing (squat) ────────────────────────
    const hipDrop = (smoothedHipY - standingHipY) / frameHeight;
    setIsDucking(hipDrop > 0.06);

    // ── PUSHUP: arms bent + shoulders low ─────────────────────────────────
    const leftShoulder  = getKeypoint(keypoints, "left_shoulder",  minConf);
    const leftElbow     = getKeypoint(keypoints, "left_elbow",     minConf);
    const leftWristKp   = getKeypoint(keypoints, "left_wrist",     minConf);
    const rightShoulder = getKeypoint(keypoints, "right_shoulder", minConf);
    const rightElbow    = getKeypoint(keypoints, "right_elbow",    minConf);
    const rightWristKp  = getKeypoint(keypoints, "right_wrist",    minConf);

    const angles: number[] = [];
    if (leftShoulder  && leftElbow  && leftWristKp)  angles.push(calculateAngle(leftShoulder,  leftElbow,  leftWristKp));
    if (rightShoulder && rightElbow && rightWristKp) angles.push(calculateAngle(rightShoulder, rightElbow, rightWristKp));

    if (angles.length > 0) {
      const avgAngle      = angles.reduce((a, b) => a + b, 0) / angles.length;
      const smoothedAngle = addToBuffer(elbowAngleBufferRef.current, avgAngle);
      setIsPushup(smoothedAngle < 110 && smoothedShoulderY > standingShoulderY + 50);
    } else {
      setIsPushup(false);
    }
  }, []);

  const drawSkeleton = useCallback((keypoints: poseDetection.Keypoint[], canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const connections = [
      ["left_shoulder",  "right_shoulder"],
      ["left_shoulder",  "left_hip"],   ["right_shoulder", "right_hip"],
      ["left_hip",       "right_hip"],
      ["left_shoulder",  "left_elbow"], ["left_elbow",  "left_wrist"],
      ["right_shoulder", "right_elbow"],["right_elbow", "right_wrist"],
      ["left_hip",       "left_knee"],  ["right_hip",   "right_knee"],
      ["left_knee",      "left_ankle"], ["right_knee",  "right_ankle"],
    ];

    const getPoint = (name: string) => keypoints.find(k => k.name === name);

    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth   = 3;

    connections.forEach(([a, b]) => {
      const p1 = getPoint(a);
      const p2 = getPoint(b);
      if (p1 && p2 && (p1.score ?? 0) > 0.2 && (p2.score ?? 0) > 0.2) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    });

    keypoints.forEach(kp => {
      if ((kp.score ?? 0) > 0.2) {
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = "#00ff00";
        ctx.fill();
      }
    });
  }, []);

  const runDetection = useCallback(async () => {
    if (!isRunningRef.current) return;
    if (!detectorRef.current || !videoRef.current || !smallCanvasRef.current) {
      animationFrameRef.current = requestAnimationFrame(runDetection);
      return;
    }

    const video = videoRef.current;

    if (video.readyState >= 2) {
      try {
        const poses = await detectorRef.current.estimatePoses(video);

        if (poses.length > 0 && poses[0].keypoints) {
          const keypoints   = poses[0].keypoints;
          const validPoints = keypoints.filter(k => (k.score ?? 0) > 0.2);

          setIsBodyDetected(validPoints.length >= 5);
          drawSkeleton(keypoints, smallCanvasRef.current!, video);
          processPose(keypoints);
        } else {
          setIsBodyDetected(false);
          setIsRunning(false);
        }
      } catch (e) {
        console.error("Detection error:", e);
      }
    }

    animationFrameRef.current = requestAnimationFrame(runDetection);
  }, [drawSkeleton, processPose]);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setLoadingStatus("Setting up TensorFlow...");
      await tf.ready();
      await tf.setBackend("webgl");

      setLoadingStatus("Requesting camera...");
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
          video.onerror = () => reject(new Error("Video failed"));
        });
      }

      setLoadingStatus("Loading AI model...");
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
      );

      detectorRef.current = detector;

      setLoadingStatus("Starting...");
      isRunningRef.current = true;
      runDetection();

      setIsLoading(false);
      setLoadingStatus("");
    } catch (err: any) {
      console.error("Setup error:", err);
      let message = "Failed to start camera.";
      if (err.name === "NotAllowedError") message = "Camera access denied.";
      else if (err.name === "NotFoundError") message = "No camera found.";
      setError(message);
      setIsLoading(false);
    }
  }, [runDetection]);

  const stopCamera = useCallback(() => {
    isRunningRef.current = false;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (detectorRef.current) {
      detectorRef.current.dispose();
      detectorRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return {
    videoRef,
    smallCanvasRef,
    isLoading,
    loadingStatus,
    error,
    isBodyDetected,
    isRunning,
    isJumping,
    isDucking,
    isPushup,
    startCamera,
    stopCamera,
  };
}
