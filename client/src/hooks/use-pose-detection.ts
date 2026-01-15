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
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  enableCounting: () => void;
  disableCounting: () => void;
  resetReps: () => void;
}

// Smoothing buffer for angle values
interface AngleBuffer {
  values: number[];
  maxSize: number;
}

function createAngleBuffer(maxSize: number = 5): AngleBuffer {
  return { values: [], maxSize };
}

function addToBuffer(buffer: AngleBuffer, value: number): number {
  buffer.values.push(value);
  if (buffer.values.length > buffer.maxSize) {
    buffer.values.shift();
  }
  // Return smoothed average
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
  
  // Exercise state tracking with hysteresis
  const exercisePhaseRef = useRef<"up" | "down" | "transitioning">("up");
  const countingEnabledRef = useRef(false);
  const angleBufferRef = useRef<AngleBuffer>(createAngleBuffer(5));
  const lastValidAngleRef = useRef<number>(180);
  
  // Thresholds with hysteresis to prevent flickering
  const getThresholds = () => {
    if (exerciseType === "pushups") {
      return {
        downThreshold: 100,      // Trigger down when angle < 100
        upThreshold: 140,        // Trigger up when angle > 140
        minConfidence: 0.25,     // Minimum keypoint confidence
      };
    } else {
      return {
        downThreshold: 110,      // Squats have wider angles
        upThreshold: 145,
        minConfidence: 0.25,
      };
    }
  };

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

  // Get best angle from both sides (360-degree detection)
  const getBestAngle = (
    keypoints: poseDetection.Keypoint[],
    joint1Names: [string, string], // left and right options for first joint
    joint2Names: [string, string], // left and right options for middle joint (angle vertex)
    joint3Names: [string, string], // left and right options for third joint
    minConfidence: number
  ): number | null => {
    const getPoint = (name: string) => keypoints.find(k => k.name === name);
    const isValid = (p: poseDetection.Keypoint | undefined) => p && (p.score ?? 0) > minConfidence;
    
    const angles: number[] = [];
    
    // Try left side
    const left1 = getPoint(joint1Names[0]);
    const left2 = getPoint(joint2Names[0]);
    const left3 = getPoint(joint3Names[0]);
    
    if (isValid(left1) && isValid(left2) && isValid(left3)) {
      angles.push(calculateAngle(left1!, left2!, left3!));
    }
    
    // Try right side
    const right1 = getPoint(joint1Names[1]);
    const right2 = getPoint(joint2Names[1]);
    const right3 = getPoint(joint3Names[1]);
    
    if (isValid(right1) && isValid(right2) && isValid(right3)) {
      angles.push(calculateAngle(right1!, right2!, right3!));
    }
    
    if (angles.length === 0) return null;
    
    // Use the minimum angle (most bent position) for more accurate detection
    // This helps when one side is more visible than the other
    return Math.min(...angles);
  };

  // Process pose for rep counting with improved accuracy
  const processPose = useCallback((keypoints: poseDetection.Keypoint[]) => {
    if (!countingEnabledRef.current) return;
    
    const thresholds = getThresholds();
    let currentAngle: number | null = null;
    
    if (exerciseType === "pushups") {
      // Use elbow angle for pushups - check both arms
      currentAngle = getBestAngle(
        keypoints,
        ["left_shoulder", "right_shoulder"],
        ["left_elbow", "right_elbow"],
        ["left_wrist", "right_wrist"],
        thresholds.minConfidence
      );
    } else {
      // Use knee angle for squats - check both legs
      currentAngle = getBestAngle(
        keypoints,
        ["left_hip", "right_hip"],
        ["left_knee", "right_knee"],
        ["left_ankle", "right_ankle"],
        thresholds.minConfidence
      );
    }
    
    if (currentAngle === null) return;
    
    // Apply smoothing
    const smoothedAngle = addToBuffer(angleBufferRef.current, currentAngle);
    lastValidAngleRef.current = smoothedAngle;
    
    // State machine with hysteresis
    const phase = exercisePhaseRef.current;
    
    if (phase === "up") {
      // Looking for down position
      if (smoothedAngle < thresholds.downThreshold) {
        exercisePhaseRef.current = "down";
      }
    } else if (phase === "down") {
      // Looking for up position - this completes a rep
      if (smoothedAngle > thresholds.upThreshold) {
        exercisePhaseRef.current = "up";
        setRepCount(prev => prev + 1);
      }
    }
  }, [exerciseType]);

  // Draw skeleton on canvas with 360-degree visibility
  const drawSkeleton = useCallback((keypoints: poseDetection.Keypoint[], canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // All body connections to draw (both sides)
    const connections = [
      // Head and torso
      ["nose", "left_eye"], ["nose", "right_eye"],
      ["left_eye", "left_ear"], ["right_eye", "right_ear"],
      ["left_shoulder", "right_shoulder"],
      ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
      ["left_hip", "right_hip"],
      // Arms
      ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
      ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
      // Legs
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
    
    // Draw points with different colors based on confidence
    keypoints.forEach(kp => {
      const confidence = kp.score ?? 0;
      if (confidence > 0.2) {
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 6, 0, 2 * Math.PI);
        
        // Color based on confidence: green = high, yellow = medium, red = low
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
          
          // Need at least 8 valid points for body detection
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
      // Step 1: Initialize TensorFlow
      setLoadingStatus("Setting up TensorFlow...");
      await tf.ready();
      await tf.setBackend("webgl");
      
      // Step 2: Get camera
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
        
        // Wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          const video = videoRef.current!;
          video.onloadedmetadata = () => {
            video.play().then(resolve).catch(reject);
          };
          video.onerror = () => reject(new Error("Video failed to load"));
        });
      }
      
      // Step 3: Load pose detection model
      setLoadingStatus("Loading AI model (may take 10-20 seconds)...");
      
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        }
      );
      
      detectorRef.current = detector;
      
      // Step 4: Start detection
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
    angleBufferRef.current = createAngleBuffer(5);
    setIsCountingEnabled(true);
  }, []);

  const disableCounting = useCallback(() => {
    countingEnabledRef.current = false;
    setIsCountingEnabled(false);
  }, []);

  const resetReps = useCallback(() => {
    setRepCount(0);
    exercisePhaseRef.current = "up";
    angleBufferRef.current = createAngleBuffer(5);
  }, []);

  // Cleanup on unmount
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
    startCamera,
    stopCamera,
    enableCounting,
    disableCounting,
    resetReps,
  };
}
