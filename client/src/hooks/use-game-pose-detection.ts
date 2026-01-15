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

function createValueBuffer(maxSize: number = 5): ValueBuffer {
  return { values: [], maxSize };
}

function addToBuffer(buffer: ValueBuffer, value: number): number {
  buffer.values.push(value);
  if (buffer.values.length > buffer.maxSize) {
    buffer.values.shift();
  }
  return buffer.values.reduce((a, b) => a + b, 0) / buffer.values.length;
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

  // Buffers for smoothing
  const shoulderYBufferRef = useRef<ValueBuffer>(createValueBuffer(5));
  const hipYBufferRef = useRef<ValueBuffer>(createValueBuffer(5));
  const wristYBufferRef = useRef<ValueBuffer>(createValueBuffer(5));
  const elbowAngleBufferRef = useRef<ValueBuffer>(createValueBuffer(5));
  
  // Running detection - track vertical oscillation
  const recentShoulderYRef = useRef<number[]>([]);
  const lastRunningUpdateRef = useRef<number>(0);
  const runningScoreRef = useRef<number>(0);
  
  // Calibration
  const standingShoulderYRef = useRef<number | null>(null);
  const standingHipYRef = useRef<number | null>(null);
  const calibrationFramesRef = useRef<number>(0);

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
    const left = getKeypoint(keypoints, leftName, minConfidence);
    const right = getKeypoint(keypoints, rightName, minConfidence);
    
    if (left && right) return (left.y + right.y) / 2;
    if (left) return left.y;
    if (right) return right.y;
    return null;
  };

  const processPose = useCallback((keypoints: poseDetection.Keypoint[]) => {
    const minConfidence = 0.25;
    
    const shoulderY = getAverageY(keypoints, "left_shoulder", "right_shoulder", minConfidence);
    const hipY = getAverageY(keypoints, "left_hip", "right_hip", minConfidence);
    const wristY = getAverageY(keypoints, "left_wrist", "right_wrist", minConfidence);
    
    if (shoulderY === null || hipY === null) return;

    const smoothedShoulderY = addToBuffer(shoulderYBufferRef.current, shoulderY);
    const smoothedHipY = addToBuffer(hipYBufferRef.current, hipY);
    const smoothedWristY = wristY !== null ? addToBuffer(wristYBufferRef.current, wristY) : null;

    // Calibration for standing position
    if (calibrationFramesRef.current < 15) {
      calibrationFramesRef.current++;
      if (standingShoulderYRef.current === null || smoothedShoulderY < standingShoulderYRef.current) {
        standingShoulderYRef.current = smoothedShoulderY;
      }
      if (standingHipYRef.current === null || smoothedHipY < standingHipYRef.current) {
        standingHipYRef.current = smoothedHipY;
      }
      return;
    }

    const standingShoulderY = standingShoulderYRef.current || smoothedShoulderY;
    const standingHipY = standingHipYRef.current || smoothedHipY;
    const frameHeight = videoRef.current?.videoHeight || 480;
    
    // RUNNING: Detect vertical oscillation (body bouncing up and down when running in place)
    const now = Date.now();
    recentShoulderYRef.current.push(smoothedShoulderY);
    if (recentShoulderYRef.current.length > 20) {
      recentShoulderYRef.current.shift();
    }
    
    // Analyze oscillation - look for direction changes (peaks and valleys)
    let directionChanges = 0;
    if (recentShoulderYRef.current.length >= 10) {
      let lastDirection = 0; // 0 = none, 1 = up, -1 = down
      for (let i = 1; i < recentShoulderYRef.current.length; i++) {
        const diff = recentShoulderYRef.current[i] - recentShoulderYRef.current[i - 1];
        const currentDirection = diff > 1 ? 1 : diff < -1 ? -1 : 0;
        if (currentDirection !== 0 && currentDirection !== lastDirection && lastDirection !== 0) {
          directionChanges++;
        }
        if (currentDirection !== 0) lastDirection = currentDirection;
      }
    }
    
    // Running detected if we see multiple direction changes (oscillation)
    const isRunningDetected = directionChanges >= 3;
    
    // Smooth the running state with a score system
    if (isRunningDetected) {
      runningScoreRef.current = Math.min(10, runningScoreRef.current + 2);
    } else {
      runningScoreRef.current = Math.max(0, runningScoreRef.current - 1);
    }
    
    setIsRunning(runningScoreRef.current >= 4);
    
    // JUMPING: Wrists above shoulders (arms raised up)
    if (smoothedWristY !== null) {
      const armsRaised = smoothedWristY < smoothedShoulderY - 30;
      setIsJumping(armsRaised);
    }
    
    // DUCKING: Hip dropped significantly from standing (squat detection)
    const hipDrop = (smoothedHipY - standingHipY) / frameHeight;
    const isDuckingDetected = hipDrop > 0.08;
    setIsDucking(isDuckingDetected);
    
    // PUSHUP: Detect elbow angle (similar to exercise pushup detection)
    let pushupDetected = false;
    
    const lShoulder = getKeypoint(keypoints, "left_shoulder", minConfidence);
    const lElbow = getKeypoint(keypoints, "left_elbow", minConfidence);
    const lWrist = getKeypoint(keypoints, "left_wrist", minConfidence);
    const rShoulder = getKeypoint(keypoints, "right_shoulder", minConfidence);
    const rElbow = getKeypoint(keypoints, "right_elbow", minConfidence);
    const rWrist = getKeypoint(keypoints, "right_wrist", minConfidence);
    
    const angles: number[] = [];
    if (lShoulder && lElbow && lWrist) {
      angles.push(calculateAngle(lShoulder, lElbow, lWrist));
    }
    if (rShoulder && rElbow && rWrist) {
      angles.push(calculateAngle(rShoulder, rElbow, rWrist));
    }
    
    if (angles.length > 0) {
      const avgAngle = angles.reduce((a, b) => a + b, 0) / angles.length;
      const smoothedAngle = addToBuffer(elbowAngleBufferRef.current, avgAngle);
      // Pushup position: arms bent significantly
      pushupDetected = smoothedAngle < 110 && smoothedShoulderY > standingShoulderY + 50;
    }
    
    setIsPushup(pushupDetected);
  }, []);

  const drawSkeleton = useCallback((keypoints: poseDetection.Keypoint[], canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const connections = [
      ["left_shoulder", "right_shoulder"],
      ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
      ["left_hip", "right_hip"],
      ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
      ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
    ];
    
    const getPoint = (name: string) => keypoints.find(k => k.name === name);
    
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 3;
    
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
          const keypoints = poses[0].keypoints;
          const validPoints = keypoints.filter(k => (k.score ?? 0) > 0.25);
          
          setIsBodyDetected(validPoints.length >= 6);
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
      if (err.name === "NotAllowedError") {
        message = "Camera access denied.";
      } else if (err.name === "NotFoundError") {
        message = "No camera found.";
      }
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
