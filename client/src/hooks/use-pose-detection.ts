import { useRef, useEffect, useState, useCallback } from "react";
import * as poseDetection from "@tensorflow-models/pose-detection";
import "@tensorflow/tfjs";

export type ExerciseType = "pushups" | "squats";

interface PosePoint {
  x: number;
  y: number;
  score?: number;
  name?: string;
}

interface UsePoseDetectionResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isBodyDetected: boolean;
  isLoading: boolean;
  error: string | null;
  repCount: number;
  resetRepCount: () => void;
  keypoints: PosePoint[];
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  setCountingEnabled: (enabled: boolean) => void;
}

export function usePoseDetection(exerciseType: ExerciseType): UsePoseDetectionResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const animationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isBodyDetected, setIsBodyDetected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repCount, setRepCount] = useState(0);
  const [keypoints, setKeypoints] = useState<PosePoint[]>([]);
  
  // Track exercise state for rep counting
  const exerciseStateRef = useRef<"up" | "down">("up");
  // Track whether counting is enabled
  const countingEnabledRef = useRef(false);
  
  const resetRepCount = useCallback(() => {
    setRepCount(0);
    exerciseStateRef.current = "up";
  }, []);

  const setCountingEnabled = useCallback((enabled: boolean) => {
    countingEnabledRef.current = enabled;
    if (enabled) {
      // Reset state when starting
      exerciseStateRef.current = "up";
    }
  }, []);

  // Get angle between three points
  const getAngle = (a: PosePoint, b: PosePoint, c: PosePoint): number => {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180) / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  };

  // Check if keypoint is valid (has good confidence)
  const isValidKeypoint = (kp: PosePoint | undefined): boolean => {
    return kp !== undefined && (kp.score ?? 0) > 0.3;
  };

  // Count reps based on exercise type
  const countReps = useCallback((poses: poseDetection.Pose[]) => {
    // Only count reps when counting is enabled
    if (!countingEnabledRef.current) return;
    if (poses.length === 0) return;
    
    const pose = poses[0];
    const kp = pose.keypoints;
    
    // Get keypoints by name
    const getKp = (name: string) => kp.find(k => k.name === name);
    
    if (exerciseType === "pushups") {
      // Track pushups using elbow angle
      const leftShoulder = getKp("left_shoulder");
      const leftElbow = getKp("left_elbow");
      const leftWrist = getKp("left_wrist");
      const rightShoulder = getKp("right_shoulder");
      const rightElbow = getKp("right_elbow");
      const rightWrist = getKp("right_wrist");
      
      // Use whichever arm has better visibility
      let angle = 180;
      
      if (isValidKeypoint(leftShoulder) && isValidKeypoint(leftElbow) && isValidKeypoint(leftWrist)) {
        angle = Math.min(angle, getAngle(leftShoulder!, leftElbow!, leftWrist!));
      }
      if (isValidKeypoint(rightShoulder) && isValidKeypoint(rightElbow) && isValidKeypoint(rightWrist)) {
        angle = Math.min(angle, getAngle(rightShoulder!, rightElbow!, rightWrist!));
      }
      
      // Pushup: down when elbow angle < 100, up when > 160
      if (angle < 100 && exerciseStateRef.current === "up") {
        exerciseStateRef.current = "down";
      } else if (angle > 160 && exerciseStateRef.current === "down") {
        exerciseStateRef.current = "up";
        setRepCount(prev => prev + 1);
      }
    } else if (exerciseType === "squats") {
      // Track squats using knee angle
      const leftHip = getKp("left_hip");
      const leftKnee = getKp("left_knee");
      const leftAnkle = getKp("left_ankle");
      const rightHip = getKp("right_hip");
      const rightKnee = getKp("right_knee");
      const rightAnkle = getKp("right_ankle");
      
      let angle = 180;
      
      if (isValidKeypoint(leftHip) && isValidKeypoint(leftKnee) && isValidKeypoint(leftAnkle)) {
        angle = Math.min(angle, getAngle(leftHip!, leftKnee!, leftAnkle!));
      }
      if (isValidKeypoint(rightHip) && isValidKeypoint(rightKnee) && isValidKeypoint(rightAnkle)) {
        angle = Math.min(angle, getAngle(rightHip!, rightKnee!, rightAnkle!));
      }
      
      // Squat: down when knee angle < 100, up when > 160
      if (angle < 100 && exerciseStateRef.current === "up") {
        exerciseStateRef.current = "down";
      } else if (angle > 160 && exerciseStateRef.current === "down") {
        exerciseStateRef.current = "up";
        setRepCount(prev => prev + 1);
      }
    }
  }, [exerciseType]);

  // Draw skeleton on canvas
  const drawSkeleton = useCallback((poses: poseDetection.Pose[], canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (poses.length === 0) return;
    
    const pose = poses[0];
    const kps = pose.keypoints;
    
    // Skeleton connections
    const connections: [string, string][] = [
      ["nose", "left_eye"], ["nose", "right_eye"],
      ["left_eye", "left_ear"], ["right_eye", "right_ear"],
      ["left_shoulder", "right_shoulder"],
      ["left_shoulder", "left_elbow"], ["right_shoulder", "right_elbow"],
      ["left_elbow", "left_wrist"], ["right_elbow", "right_wrist"],
      ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
      ["left_hip", "right_hip"],
      ["left_hip", "left_knee"], ["right_hip", "right_knee"],
      ["left_knee", "left_ankle"], ["right_knee", "right_ankle"],
    ];
    
    // Draw connections
    ctx.strokeStyle = "#ff3333";
    ctx.lineWidth = 4;
    
    connections.forEach(([p1Name, p2Name]) => {
      const p1 = kps.find(k => k.name === p1Name);
      const p2 = kps.find(k => k.name === p2Name);
      
      if (p1 && p2 && (p1.score ?? 0) > 0.3 && (p2.score ?? 0) > 0.3) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    });
    
    // Draw keypoints
    kps.forEach(kp => {
      if ((kp.score ?? 0) > 0.3) {
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#ff3333";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }, []);

  // Detection loop
  const detect = useCallback(async () => {
    if (!detectorRef.current || !videoRef.current || !canvasRef.current) return;
    
    if (videoRef.current.readyState >= 2) {
      try {
        const poses = await detectorRef.current.estimatePoses(videoRef.current);
        
        // Check if body is detected (enough keypoints with good scores)
        const validKeypoints = poses[0]?.keypoints.filter(kp => (kp.score ?? 0) > 0.3) ?? [];
        setIsBodyDetected(validKeypoints.length >= 10);
        setKeypoints(poses[0]?.keypoints ?? []);
        
        // Draw skeleton
        drawSkeleton(poses, canvasRef.current, videoRef.current);
        
        // Count reps (only when counting is enabled)
        countReps(poses);
      } catch (err) {
        console.error("Pose detection error:", err);
      }
    }
    
    animationRef.current = requestAnimationFrame(detect);
  }, [drawSkeleton, countReps]);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      // Initialize pose detector
      const model = poseDetection.SupportedModels.MoveNet;
      const detectorConfig: poseDetection.MoveNetModelConfig = {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
      };
      
      detectorRef.current = await poseDetection.createDetector(model, detectorConfig);
      
      setIsLoading(false);
      
      // Start detection loop
      detect();
    } catch (err: any) {
      console.error("Camera/detector setup error:", err);
      
      // Provide more specific error messages
      let errorMessage = "Failed to access camera or initialize pose detection.";
      
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        errorMessage = "Camera permission was denied. Please allow camera access in your browser settings and refresh the page.";
      } else if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        errorMessage = "No camera found. Please connect a camera and try again.";
      } else if (err?.name === "NotReadableError" || err?.name === "TrackStartError") {
        errorMessage = "Camera is in use by another application. Please close other apps using the camera and try again.";
      } else if (err?.name === "OverconstrainedError") {
        errorMessage = "Camera doesn't support the requested settings. Trying with default settings...";
      } else if (err?.name === "SecurityError") {
        errorMessage = "Camera access blocked due to security restrictions. Make sure you're using HTTPS.";
      } else if (err?.message) {
        errorMessage = `Camera error: ${err.message}`;
      }
      
      setError(errorMessage);
      setIsLoading(false);
    }
  }, [detect]);

  const stopCamera = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    if (detectorRef.current) {
      detectorRef.current.dispose();
      detectorRef.current = null;
    }
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
    isBodyDetected,
    isLoading,
    error,
    repCount,
    resetRepCount,
    keypoints,
    startCamera,
    stopCamera,
    setCountingEnabled,
  };
}
