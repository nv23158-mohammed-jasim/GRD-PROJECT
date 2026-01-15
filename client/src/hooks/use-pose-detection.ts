import { useRef, useState, useCallback, useEffect } from "react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";

export type ExerciseType = "pushups" | "squats";

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
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  enableCounting: () => void;
  disableCounting: () => void;
  resetReps: () => void;
}

// Smoothing buffer for values
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
  
  // Exercise state tracking
  const exercisePhaseRef = useRef<"up" | "down">("up");
  const countingEnabledRef = useRef(false);
  const valueBufferRef = useRef<ValueBuffer>(createValueBuffer(5));
  
  // For squats: track initial standing hip position
  const standingHipRatioRef = useRef<number | null>(null);
  const calibrationFramesRef = useRef<number>(0);

  // Calculate angle between 3 points
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

  // Get average position of left and right keypoints
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
    
    if (leftValid && rightValid) {
      return { x: (left!.x + right!.x) / 2, y: (left!.y + right!.y) / 2, valid: true };
    } else if (leftValid) {
      return { x: left!.x, y: left!.y, valid: true };
    } else if (rightValid) {
      return { x: right!.x, y: right!.y, valid: true };
    }
    return { x: 0, y: 0, valid: false };
  };

  // Process pose for rep counting
  const processPose = useCallback((keypoints: poseDetection.Keypoint[]) => {
    if (!countingEnabledRef.current) return;
    
    const minConfidence = 0.25;
    
    if (exerciseType === "pushups") {
      // PUSHUPS: Use elbow angle
      const getBestElbowAngle = (): number | null => {
        const angles: number[] = [];
        
        // Left arm
        const lShoulder = keypoints.find(k => k.name === "left_shoulder");
        const lElbow = keypoints.find(k => k.name === "left_elbow");
        const lWrist = keypoints.find(k => k.name === "left_wrist");
        
        if (lShoulder && lElbow && lWrist && 
            (lShoulder.score ?? 0) > minConfidence &&
            (lElbow.score ?? 0) > minConfidence &&
            (lWrist.score ?? 0) > minConfidence) {
          angles.push(calculateAngle(lShoulder, lElbow, lWrist));
        }
        
        // Right arm
        const rShoulder = keypoints.find(k => k.name === "right_shoulder");
        const rElbow = keypoints.find(k => k.name === "right_elbow");
        const rWrist = keypoints.find(k => k.name === "right_wrist");
        
        if (rShoulder && rElbow && rWrist &&
            (rShoulder.score ?? 0) > minConfidence &&
            (rElbow.score ?? 0) > minConfidence &&
            (rWrist.score ?? 0) > minConfidence) {
          angles.push(calculateAngle(rShoulder, rElbow, rWrist));
        }
        
        if (angles.length === 0) return null;
        return Math.min(...angles);
      };
      
      const angle = getBestElbowAngle();
      if (angle === null) return;
      
      const smoothedAngle = addToBuffer(valueBufferRef.current, angle);
      setDebugInfo(`Elbow: ${Math.round(smoothedAngle)}°`);
      
      // Pushup thresholds
      const downThreshold = 100;
      const upThreshold = 140;
      
      if (exercisePhaseRef.current === "up" && smoothedAngle < downThreshold) {
        exercisePhaseRef.current = "down";
      } else if (exercisePhaseRef.current === "down" && smoothedAngle > upThreshold) {
        exercisePhaseRef.current = "up";
        setRepCount(prev => prev + 1);
      }
      
    } else {
      // SQUATS: Use vertical hip position relative to shoulders (works from any angle!)
      const shoulders = getAveragePoint(keypoints, "left_shoulder", "right_shoulder", minConfidence);
      const hips = getAveragePoint(keypoints, "left_hip", "right_hip", minConfidence);
      const knees = getAveragePoint(keypoints, "left_knee", "right_knee", minConfidence);
      
      if (!shoulders.valid || !hips.valid) return;
      
      // Calculate hip-to-shoulder vertical ratio
      // When standing: hips are lower, ratio is larger
      // When squatting: hips drop, ratio increases more
      // We use the distance from shoulder to hip vs shoulder to knee
      
      const shoulderToHip = hips.y - shoulders.y; // Positive when hip is below shoulder
      
      // If we have knee position, use ratio of hip position relative to knee
      let squatDepth: number;
      
      if (knees.valid) {
        // Ratio of how far down the hip has moved toward the knee
        const shoulderToKnee = knees.y - shoulders.y;
        if (shoulderToKnee <= 0) return;
        
        squatDepth = shoulderToHip / shoulderToKnee;
        // Standing: ~0.5 (hip halfway between shoulder and knee)
        // Squatting: ~0.7-0.9 (hip closer to knee level)
      } else {
        // Fallback: just use shoulder-to-hip distance normalized by frame height
        const frameHeight = videoRef.current?.videoHeight || 480;
        squatDepth = shoulderToHip / (frameHeight * 0.4);
      }
      
      const smoothedDepth = addToBuffer(valueBufferRef.current, squatDepth);
      
      // Calibrate standing position in first few frames
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
      
      setDebugInfo(`Depth: ${(depthChange * 100).toFixed(0)}%`);
      
      // Thresholds based on depth change from standing
      // Down: hip drops by 15% or more
      // Up: hip returns to within 8% of standing position
      const downThreshold = 0.15;
      const upThreshold = 0.08;
      
      if (exercisePhaseRef.current === "up" && depthChange > downThreshold) {
        exercisePhaseRef.current = "down";
      } else if (exercisePhaseRef.current === "down" && depthChange < upThreshold) {
        exercisePhaseRef.current = "up";
        setRepCount(prev => prev + 1);
      }
    }
  }, [exerciseType]);

  // Draw skeleton on canvas
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
    
    // Draw lines
    ctx.strokeStyle = "#ff3333";
    ctx.lineWidth = 4;
    
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
    
    // Draw points
    keypoints.forEach(kp => {
      const confidence = kp.score ?? 0;
      if (confidence > 0.2) {
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 6, 0, 2 * Math.PI);
        
        if (confidence > 0.6) {
          ctx.fillStyle = "#00ff00";
        } else if (confidence > 0.4) {
          ctx.fillStyle = "#ffff00";
        } else {
          ctx.fillStyle = "#ff6600";
        }
        
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
    
    // Draw phase indicator
    const phase = exercisePhaseRef.current;
    ctx.fillStyle = phase === "down" ? "#00ff00" : "#ffffff";
    ctx.font = "bold 24px Arial";
    ctx.fillText(phase.toUpperCase(), 20, canvas.height - 20);
  }, []);

  // Detection loop
  const runDetection = useCallback(async () => {
    if (!isRunningRef.current) return;
    if (!detectorRef.current || !videoRef.current || !canvasRef.current) {
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
          
          setIsBodyDetected(validPoints.length >= 8);
          drawSkeleton(keypoints, canvasRef.current!, video);
          processPose(keypoints);
        } else {
          setIsBodyDetected(false);
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
      
      setLoadingStatus("Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 }, 
          height: { ideal: 480 },
          facingMode: "user"
        },
        audio: false,
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        await new Promise<void>((resolve, reject) => {
          const video = videoRef.current!;
          video.onloadedmetadata = () => {
            video.play().then(resolve).catch(reject);
          };
          video.onerror = () => reject(new Error("Video failed to load"));
        });
      }
      
      setLoadingStatus("Loading AI model (may take 10-20 seconds)...");
      
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        }
      );
      
      detectorRef.current = detector;
      
      setLoadingStatus("Starting detection...");
      isRunningRef.current = true;
      runDetection();
      
      setIsLoading(false);
      setLoadingStatus("");
      
    } catch (err: any) {
      console.error("Setup error:", err);
      
      let message = "Failed to start camera.";
      if (err.name === "NotAllowedError") {
        message = "Camera access was denied. Please allow camera access and reload the page.";
      } else if (err.name === "NotFoundError") {
        message = "No camera found. Please connect a camera.";
      } else if (err.name === "NotReadableError") {
        message = "Camera is being used by another app. Close other apps and try again.";
      } else if (err.message) {
        message = err.message;
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

  const enableCounting = useCallback(() => {
    countingEnabledRef.current = true;
    exercisePhaseRef.current = "up";
    valueBufferRef.current = createValueBuffer(5);
    standingHipRatioRef.current = null;
    calibrationFramesRef.current = 0;
    setIsCountingEnabled(true);
  }, []);

  const disableCounting = useCallback(() => {
    countingEnabledRef.current = false;
    setIsCountingEnabled(false);
  }, []);

  const resetReps = useCallback(() => {
    setRepCount(0);
    exercisePhaseRef.current = "up";
    valueBufferRef.current = createValueBuffer(5);
    standingHipRatioRef.current = null;
    calibrationFramesRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    canvasRef,
    isLoading,
    loadingStatus,
    error,
    isBodyDetected,
    repCount,
    isCountingEnabled,
    debugInfo,
    startCamera,
    stopCamera,
    enableCounting,
    disableCounting,
    resetReps,
  };
}
