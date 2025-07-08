import { useEffect, useRef, useCallback, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';

// Helper function for linear interpolation (lerp)
const lerp = (start: number, end: number, amount: number) => {
  return start * (1 - amount) + end * amount;
};

// Helper function to format time (moved from parent)
const formatRecordingTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

interface RecordingPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPlayRecordedAudio: () => void;
  onPauseRecording: () => void; // New prop for pausing playback
  onReRecord: () => void;
  onProceed: () => void;
  isRecording: boolean;
  recordingTime: number;
  recordedDuration: number;
  recordedAudioUrl: string | null;
  maxDuration: number;
  analyserNode: AnalyserNode | null; // New prop

  isPlayingRecordedAudio: boolean; // New prop to control play/pause state for recorded audio
  currentPlaybackTime: number; // New prop for current playback time of recorded audio (from parent)
  resetTrigger: number; // New prop to explicitly trigger visual resets
}

const RecordingPopupComponent = ({
  isOpen,
  onClose,
  onStartRecording,
  onStopRecording,
  onPlayRecordedAudio,
  onPauseRecording, // Destructure new prop
  onReRecord,
  onProceed,
  isRecording,
  recordingTime,
  recordedDuration,
  recordedAudioUrl,
  maxDuration,
  analyserNode, // New prop
  isPlayingRecordedAudio, // Destructure new prop
  currentPlaybackTime, // Destructure new prop (from parent)
  resetTrigger, // Destructure new prop
}: RecordingPopupProps) => {
  const liveWaveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameIdRef = useRef<number | null>(null); // For live recording animation
  const playbackAnimationFrameIdRef = useRef<number | null>(null); // For playback animation
  const waveformHistoryRef = useRef<number[]>([]); // To store historical bar heights

  // New refs and state for internal smooth playback time management
  const playbackStartTimeRef = useRef<number | null>(null);
  const [internalPlaybackTime, setInternalPlaybackTime] = useState(0); // High-resolution time for smooth display
  const smoothedScrollOffsetRef = useRef(0); // For smooth waveform scrolling
  const lastFrameTimeRef = useRef<number | null>(null); // To track time between frames for deltaTime
  const cachedWaveformCanvasRef = useRef<HTMLCanvasElement | null>(null); // Offscreen canvas for cached waveform

  if (!isOpen) return null;

  // Helper function to draw a single rounded rectangle bar (reused for caching and live)
  const drawRoundedRect = useCallback(
    (
      drawCtx: CanvasRenderingContext2D,
      x: number,
      y: number,
      width: number,
      height: number,
      radius: number,
    ) => {
      if (height < 2 * radius) {
        drawCtx.fillRect(x, y, width, height);
        return;
      }
      drawCtx.beginPath();
      drawCtx.moveTo(x + radius, y);
      drawCtx.lineTo(x + width - radius, y);
      drawCtx.arcTo(x + width, y, x + width, y + radius, radius);
      drawCtx.lineTo(x + width, y + height - radius);
      drawCtx.arcTo(
        x + width,
        y + height,
        x + width - radius,
        y + height,
        radius,
      );
      drawCtx.lineTo(x + radius, y + height);
      drawCtx.arcTo(x, y + height, x, y + height - radius, radius);
      drawCtx.lineTo(x, y + radius);
      drawCtx.arcTo(x, y, x + radius, y, radius);
      drawCtx.closePath();
      drawCtx.fill();
    },
    [],
  );

  // Function to draw the entire static waveform onto the cached canvas
  const drawStaticWaveformToCache = useCallback(() => {
    if (
      !liveWaveformCanvasRef.current ||
      waveformHistoryRef.current.length === 0
    )
      return;

    const mainCanvas = liveWaveformCanvasRef.current;
    const dpr = window.devicePixelRatio || 1;

    // Create/get offscreen canvas
    if (!cachedWaveformCanvasRef.current) {
      cachedWaveformCanvasRef.current = document.createElement('canvas');
    }
    const cachedCanvas = cachedWaveformCanvasRef.current;
    const cachedCtx = cachedCanvas.getContext('2d');

    if (!cachedCtx) {
      console.error(
        'RecordingPopupComponent: Could not get 2D context for cached waveform.',
      );
      return;
    }

    const fixedBarWidth = 3; // Logical pixels
    const fixedGap = 2.3; // Logical pixels
    const totalBarAndGapWidth = fixedBarWidth + fixedGap;

    // Calculate the total physical width needed to draw all bars uncompressed
    const totalWaveformPhysicalWidth =
      waveformHistoryRef.current.length * totalBarAndGapWidth * dpr;

    // Set cached canvas dimensions: width to hold all bars, height to match visible canvas
    cachedCanvas.width = totalWaveformPhysicalWidth; // This is the crucial change for width
    cachedCanvas.height = Math.floor(mainCanvas.offsetHeight * dpr);

    const physicalHeight = cachedCanvas.height; // Use cached canvas height

    cachedCtx.clearRect(0, 0, cachedCanvas.width, physicalHeight);

    const cornerRadiusLogical = 1;
    const cornerRadiusPhysical = cornerRadiusLogical * dpr;

    const unplayedBarColor = 'rgba(255, 255, 255, 1)'; // Use the user's current unplayed color
    cachedCtx.fillStyle = unplayedBarColor;

    for (let i = 0; i < waveformHistoryRef.current.length; i++) {
      const historicalBarHeight = waveformHistoryRef.current[i]; // Logical height
      // Draw all bars without any scrolling offset, as this is the full static view
      const barX = i * totalBarAndGapWidth * dpr;
      const barHeightPhysical = historicalBarHeight * dpr;
      const barY = (physicalHeight - barHeightPhysical) / 2;
      const barWidthPhysical = fixedBarWidth * dpr;

      // Draw all bars regardless of visible area, as this is the full cached waveform
      drawRoundedRect(
        cachedCtx,
        barX,
        barY,
        barWidthPhysical,
        barHeightPhysical,
        cornerRadiusPhysical,
      );
    }
    console.log(
      '[DEBUG] Static waveform drawn to cached canvas. Waveform history length:',
      waveformHistoryRef.current.length,
    );
  }, [waveformHistoryRef, drawRoundedRect]);

  // Waveform drawing logic for live recording
  const drawLiveWaveformBars = useCallback(() => {
    if (!liveWaveformCanvasRef.current || !analyserNode) {
      if (isRecording)
        animationFrameIdRef.current =
          requestAnimationFrame(drawLiveWaveformBars);
      return;
    }

    const canvas = liveWaveformCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (isRecording)
        animationFrameIdRef.current =
          requestAnimationFrame(drawLiveWaveformBars);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    if (
      canvas.width === 0 ||
      canvas.height === 0 ||
      canvas.width !== Math.floor(canvas.offsetWidth * dpr) ||
      canvas.height !== Math.floor(canvas.offsetHeight * dpr)
    ) {
      canvas.width = Math.floor(canvas.offsetWidth * dpr);
      canvas.height = Math.floor(canvas.offsetHeight * dpr);
    }

    const physicalWidth = canvas.width;
    const physicalHeight = canvas.height;

    ctx.clearRect(0, 0, physicalWidth, physicalHeight);

    const fixedBarWidth = 3; // Logical pixels
    const fixedGap = 2.3; // Logical pixels
    const totalBarAndGapWidth = fixedBarWidth + fixedGap;
    const cornerRadiusLogical = 1;
    const cornerRadiusPhysical = cornerRadiusLogical * dpr;

    // Get current audio data
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserNode.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let j = 0; j < bufferLength; j++) {
      sum += dataArray[j];
    }
    const averageAmplitude = sum / bufferLength;

    const sensitivityFactor = 30.5;
    const scaledHeight =
      ((averageAmplitude / 255) * physicalHeight * sensitivityFactor) / dpr; // Scale by dpr for logical height calculation
    const newBarHeight = Math.max(2, Math.min(scaledHeight, 32)); // Max 32 logical pixels

    waveformHistoryRef.current.push(newBarHeight);

    // Calculate scroll offset for live recording (always show the end of the waveform)
    const totalBarsRecorded = waveformHistoryRef.current.length;
    const totalWaveformPhysicalWidthLive =
      totalBarsRecorded * totalBarAndGapWidth * dpr;
    const visiblePhysicalWidthLive = physicalWidth;
    let scrollOffsetLive = 0;

    if (totalWaveformPhysicalWidthLive > visiblePhysicalWidthLive) {
      scrollOffsetLive =
        totalWaveformPhysicalWidthLive - visiblePhysicalWidthLive;
    }

    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < totalBarsRecorded; i++) {
      const historicalBarHeight = waveformHistoryRef.current[i];
      const barX = i * totalBarAndGapWidth * dpr - scrollOffsetLive;
      const barHeightPhysical = historicalBarHeight * dpr;
      const barY = (physicalHeight - barHeightPhysical) / 2;
      const barWidthPhysical = fixedBarWidth * dpr;

      if (barX + barWidthPhysical > 0 && barX < physicalWidth) {
        drawRoundedRect(
          ctx,
          barX,
          barY,
          barWidthPhysical,
          barHeightPhysical,
          cornerRadiusPhysical,
        );
      }
    }

    if (isRecording) {
      animationFrameIdRef.current = requestAnimationFrame(drawLiveWaveformBars);
    }
  }, [isRecording, analyserNode, drawRoundedRect]);

  // Waveform drawing logic for playback (now using cached waveform and precise overlay)
  const drawPlaybackFrame = useCallback(
    (currentTime: number) => {
      const canvas = liveWaveformCanvasRef.current;
      const cachedCanvas = cachedWaveformCanvasRef.current;
      const bars = waveformHistoryRef.current;
      if (!canvas || !cachedCanvas || !bars || bars.length === 0) {
        console.log('[DEBUG] Missing required refs for drawPlaybackFrame:', {
          canvas: !!canvas,
          cachedCanvas: !!cachedCanvas,
          barsLength: bars?.length,
        });
        return;
      }

      const ctx = canvas.getContext('2d');
      const cachedCtx = cachedCanvas.getContext('2d');
      if (!ctx || !cachedCtx) {
        console.error(
          'RecordingPopupComponent: Could not get 2D context for playback.',
        );
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      // Only resize if necessary to avoid constant re-sizing during animation
      if (
        canvas.width !== Math.floor(canvas.offsetWidth * dpr) ||
        canvas.height !== Math.floor(canvas.offsetHeight * dpr)
      ) {
        canvas.width = Math.floor(canvas.offsetWidth * dpr);
        canvas.height = Math.floor(canvas.offsetHeight * dpr);
        console.log('[DEBUG] Canvas dimensions updated:', {
          width: canvas.width,
          height: canvas.height,
        });
      }

      const physicalWidth = canvas.width;
      const physicalHeight = canvas.height;

      // Clear the visible canvas
      ctx.clearRect(0, 0, physicalWidth, physicalHeight);

      const fixedBarWidth = 3; // Logical pixels
      const fixedGap = 2.3; // Logical pixels
      const totalBarAndGapWidth = fixedBarWidth + fixedGap;

      const totalWaveformPhysicalWidth =
        bars.length * totalBarAndGapWidth * dpr;

      // Use the smoothed scroll offset calculated in the animation loop
      const scrollOffset = smoothedScrollOffsetRef.current;

      // Draw the cached waveform onto the visible canvas
      ctx.drawImage(
        cachedCanvas,
        scrollOffset,
        0,
        physicalWidth,
        physicalHeight,
        0,
        0,
        physicalWidth,
        physicalHeight,
      );

      // Calculate the playback progress position
      const playbackProgressFullWaveform =
        recordedDuration > 0
          ? (currentTime / recordedDuration) * totalWaveformPhysicalWidth
          : 0;

      // Calculate the overlay end point on the visible canvas
      const overlayEndPointOnVisibleCanvas =
        playbackProgressFullWaveform - scrollOffset;

      // Draw the overlay with a semi-transparent color
      ctx.fillStyle = 'rgba(132,137,145,0.8)'; // Updated overlay color

      // Save the current context state
      ctx.save();

      // Set composite operation to draw only where pixels exist (on the bars)
      ctx.globalCompositeOperation = 'source-atop';

      // Draw the overlay rectangle. Ensure it has a positive width.
      ctx.fillRect(
        0,
        0,
        Math.max(0, overlayEndPointOnVisibleCanvas),
        physicalHeight,
      );

      // Restore the context state
      ctx.restore();

      // Debug logging
      if (isPlayingRecordedAudio) {
        console.log('[DEBUG] Playback frame drawn:', {
          currentTime: currentTime,
          duration: recordedDuration,
          scrollOffset: scrollOffset,
          overlayEndPoint: overlayEndPointOnVisibleCanvas,
          totalWaveformPhysicalWidth: totalWaveformPhysicalWidth,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
        });
      }
    },
    [recordedDuration, isPlayingRecordedAudio, drawRoundedRect],
  );

  // Effect to start/stop live visualization and set up canvas
  useEffect(() => {
    const canvas = liveWaveformCanvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;

    if (isRecording && analyserNode) {
      if (canvas.offsetWidth > 0 && canvas.offsetHeight > 0) {
        const newWidth = Math.floor(canvas.offsetWidth * dpr);
        const newHeight = Math.floor(canvas.offsetHeight * dpr);
        if (canvas.width !== newWidth || canvas.height !== newHeight) {
          canvas.width = newWidth;
          canvas.height = newHeight;
        }
      } else {
        console.warn(
          'RecordingPopupComponent: Canvas offsetWidth or offsetHeight is 0. Cannot set canvas dimensions for live waveform.',
        );
        if (animationFrameIdRef.current) {
          cancelAnimationFrame(animationFrameIdRef.current);
          animationFrameIdRef.current = null;
        }
        return;
      }

      waveformHistoryRef.current = []; // Clear history for new recording
      animationFrameIdRef.current = requestAnimationFrame(drawLiveWaveformBars);
    } else {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      // When not recording, draw the static waveform to cache if data exists
      if (recordedAudioUrl && waveformHistoryRef.current.length > 0) {
        drawStaticWaveformToCache();
      }
    }

    // Cleanup function for live recording animation
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [
    isRecording,
    analyserNode,
    drawLiveWaveformBars,
    drawStaticWaveformToCache, // Add as dependency
    recordedAudioUrl, // Add as dependency
    recordedDuration, // Add recordedDuration as dependency to re-cache if duration changes
  ]);

  // Effect for handling playback animation
  useEffect(() => {
    // The animation loop function (defined inside useEffect to capture latest props/state)
    const animationLoop = (timestamp: number) => {
      // If playback is no longer active or component unmounted, stop the loop
      if (!isPlayingRecordedAudio || !liveWaveformCanvasRef.current) {
        playbackAnimationFrameIdRef.current = null; // Clear ID
        playbackStartTimeRef.current = null; // Reset for next play
        lastFrameTimeRef.current = null; // Reset for next play
        drawPlaybackFrame(currentPlaybackTime); // Draw a final frame in the stopped state
        return; // Stop the loop
      }

      // Initialize start time for continuous playback
      if (playbackStartTimeRef.current === null) {
        // Set start time so that 'elapsed' begins from currentPlaybackTime
        playbackStartTimeRef.current = timestamp - currentPlaybackTime * 1000;
        lastFrameTimeRef.current = timestamp; // Ensure lastFrameTime is also initialized
        console.log('[DEBUG] Playback animation initialized:', {
          timestamp,
          currentPlaybackTime,
          calculatedStartTime: playbackStartTimeRef.current,
        });
      }

      // Ensure lastFrameTimeRef.current is always set before calculating deltaTime
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = timestamp;
      }

      const deltaTime = timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;

      // Calculate elapsed time based on animation start time
      const elapsed = (timestamp - playbackStartTimeRef.current) / 1000;

      // Update internal playback time (clamped to duration)
      const newInternalPlaybackTime = Math.min(elapsed, recordedDuration);
      setInternalPlaybackTime(newInternalPlaybackTime); // This state update will trigger re-render and re-execution of drawPlaybackFrame

      // Calculate target scroll offset
      const canvas = liveWaveformCanvasRef.current;
      const physicalWidth = canvas.width;
      const dpr = window.devicePixelRatio || 1;
      const fixedBarWidth = 3;
      const fixedGap = 2.3;
      const totalBarAndGapWidth = fixedBarWidth + fixedGap;
      const totalWaveformPhysicalWidth =
        waveformHistoryRef.current.length * totalBarAndGapWidth * dpr;

      const playbackProgressPhysical =
        recordedDuration > 0
          ? (newInternalPlaybackTime / recordedDuration) *
            totalWaveformPhysicalWidth
          : 0;

      const playheadCanvasPosition = physicalWidth * 0.2; // Playhead at 20% from left edge

      let targetScrollOffset = 0;
      if (totalWaveformPhysicalWidth > physicalWidth) {
        targetScrollOffset = playbackProgressPhysical - playheadCanvasPosition;
        targetScrollOffset = Math.max(
          0,
          Math.min(
            targetScrollOffset,
            totalWaveformPhysicalWidth - physicalWidth,
          ),
        );
      }
      console.log('[DEBUG] AnimationLoop values:', {
        totalWaveformPhysicalWidth,
        physicalWidth,
        targetScrollOffset,
        smoothedScrollOffset: smoothedScrollOffsetRef.current,
        newInternalPlaybackTime,
        recordedDuration,
      });

      // Apply smooth scrolling with easing
      const easingFactor = 1 - Math.exp((-1.8 * deltaTime) / 1000); // Increased constant from 0.1 to 0.8 for faster waveform movement
      smoothedScrollOffsetRef.current = lerp(
        smoothedScrollOffsetRef.current,
        targetScrollOffset,
        easingFactor,
      );

      // Explicitly trigger drawing for the current frame
      drawPlaybackFrame(newInternalPlaybackTime);

      // Check for completion
      if (newInternalPlaybackTime >= recordedDuration) {
        console.log(
          '[DEBUG] Playback complete. newInternalPlaybackTime:',
          newInternalPlaybackTime,
          'recordedDuration:',
          recordedDuration,
        );
        onPauseRecording(); // Signal parent to update its playing state
        setInternalPlaybackTime(recordedDuration); // Ensure final time is exact duration
        playbackAnimationFrameIdRef.current = null; // Stop the animation frame request
        playbackStartTimeRef.current = null; // Reset for next play
        lastFrameTimeRef.current = null; // Reset for next play
        return; // Stop the loop
      }

      // Request next animation frame if still playing
      playbackAnimationFrameIdRef.current =
        requestAnimationFrame(animationLoop);
    };

    // Main logic for starting/stopping the animation loop
    if (isPlayingRecordedAudio) {
      // Only start if not already running a loop
      if (playbackAnimationFrameIdRef.current === null) {
        console.log('[DEBUG] Starting playback animation loop from useEffect.');
        // Initial call to start the animation loop
        playbackAnimationFrameIdRef.current =
          requestAnimationFrame(animationLoop);
      }
    } else {
      // When playback is stopped or paused, cancel any active animation frame
      if (playbackAnimationFrameIdRef.current) {
        cancelAnimationFrame(playbackAnimationFrameIdRef.current);
        playbackAnimationFrameIdRef.current = null;
        console.log(
          '[DEBUG] Cancelled playback animation frame from useEffect.',
        );
      }
      // Sync internal time with parent's currentPlaybackTime when not playing
      setInternalPlaybackTime(currentPlaybackTime);
      playbackStartTimeRef.current = null; // Clear start time
      lastFrameTimeRef.current = null; // Clear last frame time
      drawPlaybackFrame(currentPlaybackTime); // Pass currentPlaybackTime when drawing static frame
    }

    // Cleanup function on component unmount or dependencies change
    return () => {
      if (playbackAnimationFrameIdRef.current) {
        console.log(
          '[DEBUG] Cleanup useEffect: Cancelling playback animation frame.',
        );
        cancelAnimationFrame(playbackAnimationFrameIdRef.current);
        playbackAnimationFrameIdRef.current = null;
      }
      playbackStartTimeRef.current = null;
      lastFrameTimeRef.current = null;
    };
  }, [
    isPlayingRecordedAudio,
    currentPlaybackTime, // Keep this to re-trigger if parent seeks/pauses
    recordedDuration,
    drawPlaybackFrame, // Crucial: ensure this is stable via useCallback
    onPauseRecording,
    resetTrigger, // To re-initialize animation on external reset
  ]);

  // New useEffect to explicitly reset internal playback state when triggered by parent
  useEffect(() => {
    console.log(
      '[DEBUG] Reset trigger changed, resetting internal playback state.',
    );
    setInternalPlaybackTime(0);
    smoothedScrollOffsetRef.current = 0; // Ensure scroll is also reset
    playbackStartTimeRef.current = null; // Clear start time so it re-initializes on next play
    lastFrameTimeRef.current = null; // Clear last frame time
  }, [resetTrigger]); // Dependency on resetTrigger

  useEffect(() => {
    // Handles Esc key to close popup
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!isRecording && !recordedAudioUrl) {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, isRecording, recordedAudioUrl, onClose]);

  // New useEffect to clear waveformHistoryRef when recordedAudioUrl changes to null (e.g., on re-record)
  useEffect(() => {
    if (recordedAudioUrl === null) {
      console.log(
        '[RecordingPopupComponent] recordedAudioUrl is null, clearing waveformHistoryRef.',
      );
      waveformHistoryRef.current = [];
      setInternalPlaybackTime(0); // Reset internal time
      smoothedScrollOffsetRef.current = 0; // Reset scroll offset
      // Also ensure canvas is cleared visually if it was showing a previous waveform
      const canvas = liveWaveformCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          ctx.clearRect(
            0,
            0,
            canvas.offsetWidth * dpr,
            canvas.offsetHeight * dpr,
          );
        }
      }
    }
  }, [recordedAudioUrl]);

  return createPortal(
    <div className="fixed inset-0 bg-[rgba(0,0,0,0.7)] flex items-center justify-center z-50">
      <div className="w-full max-w-xs sm:max-w-md md:max-w-lg lg:max-w-[768px] h-auto md:h-[348px] min-h-[320px] py-4 sm:py-6 md:py-8 px-2 sm:px-6 md:px-12 flex flex-col justify-center items-center gap-3 sm:gap-4 flex-shrink-0 rounded-[24px] border-2 border-[#483B5A] bg-[#1D1136] shadow-xl relative">
        {/* Close Button */}
        <div
          role="button"
          tabIndex={0}
          onClick={onClose}
          className="absolute top-2 right-2 sm:top-3 sm:right-3 text-gray-400 hover:text-white"
          aria-label="Close recording popup"
        >
          <svg
            className="h-5 w-5 sm:h-6 sm:w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>

        <h3 className="text-lg sm:text-xl font-semibold text-white mb-2 sm:mb-4 text-center">
          {recordedAudioUrl ? 'Review Recording' : 'Record Audio'}
        </h3>

        {/* Waveform and Play Button Container */}
        <div className="flex items-center w-full h-16 sm:h-[72px] bg-[#2C2049] rounded-full p-2 sm:p-4 gap-1 sm:gap-2 self-stretch">
          {/* Play/Pause Button - visible only in review state */}
          {recordedAudioUrl && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                console.log(
                  '[RecordingPopup] Play/Pause button clicked. isPlayingRecordedAudio:',
                  isPlayingRecordedAudio,
                );
                if (isPlayingRecordedAudio) {
                  console.log('[RecordingPopup] Calling onPauseRecording.');
                  onPauseRecording();
                } else {
                  console.log('[RecordingPopup] Calling onPlayRecording.');
                  onPlayRecordedAudio();
                }
              }}
              className="flex items-center justify-center rounded-full w-10 h-10 sm:w-12 sm:h-12 md:w-[48px] md:h-[48px] flex-shrink-0 shadow-md focus:outline-none"
              style={{
                background:
                  'linear-gradient(0deg, rgba(255, 20, 20, 0.20) 0%, rgba(255, 20, 20, 0.20) 100%), linear-gradient(90deg, #FC6337 0%, #C516E1 100%)',
                boxShadow: '0px 8px 24px 0px rgba(238, 33, 122, 0.40)', // Pink/Red to Orange gradient
              }}
              aria-label={
                isPlayingRecordedAudio ? 'Pause recording' : 'Play recording'
              }
            >
              {isPlayingRecordedAudio ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="white" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 15 15"
                  fill="none"
                >
                  <path
                    d="M11.6016 5.96276C12.4766 6.46794 12.4766 7.73089 11.6016 8.23607L5.03906 12.0249C4.16406 12.5301 3.07031 11.8986 3.07031 10.8883L3.07031 3.31055C3.07031 2.30019 4.16406 1.66871 5.03906 2.17389L11.6016 5.96276Z"
                    fill="white"
                  />
                </svg>
              )}
            </div>
          )}
          {/* Canvas for waveform - takes remaining space */}
          <div
            className={`flex-grow h-full ${recordedAudioUrl ? '' : 'w-full'}`}
          >
            {' '}
            {/* Ensure canvas takes full width if button not present */}
            <canvas
              ref={liveWaveformCanvasRef}
              className="w-full h-full rounded-full"
            ></canvas>
          </div>
        </div>

        {/* Timer / Duration */}
        <div className="flex justify-center items-center text-center text-white my-2 sm:my-3 text-sm sm:text-base">
          {isRecording && (
            <span
              className="w-2 h-2 sm:w-3 sm:h-3 bg-red-500 rounded-full mr-1 sm:mr-2 animate-pulse"
              style={{ animationDuration: '1s' }}
            ></span>
          )}
          {isRecording
            ? `${formatRecordingTime(recordingTime)} / ${formatRecordingTime(maxDuration)}`
            : recordedAudioUrl
              ? `${formatRecordingTime(internalPlaybackTime > 0 ? internalPlaybackTime : 0)} / ${formatRecordingTime(recordedDuration)}`
              : `00:00 / ${formatRecordingTime(maxDuration)}`}
        </div>

        {/* Controls */}
        <div className="flex justify-center items-center gap-2 sm:gap-4 mt-3 sm:mt-4 flex-wrap">
          {!isRecording && recordedAudioUrl ? (
            // Reviewing state
            <>
              <div
                role="button"
                tabIndex={0}
                onClick={onReRecord}
                className="px-4 sm:px-6 py-2 sm:py-3 rounded-[11px] text-white font-medium bg-[#3B2D5C] hover:bg-[#4C3F6D] transition-colors text-sm sm:text-base cursor-pointer"
              >
                Re-record
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={onProceed}
                className="px-4 sm:px-6 py-2 sm:py-3 rounded-[11px] text-white font-medium transition-opacity hover:opacity-90 text-sm sm:text-base cursor-pointer"
                style={{
                  background:
                    'linear-gradient(0deg, rgba(255, 20, 20, 0.20) 0%, rgba(255, 20, 20, 0.20) 100%), linear-gradient(90deg, #FC6337 0%, #C516E1 100%)',
                  boxShadow: '0px 8px 24px 0px rgba(238, 33, 122, 0.40)',
                }}
              >
                Proceed with Recording
              </div>
            </>
          ) : isRecording ? (
            // Recording state
            <div
              role="button"
              tabIndex={0}
              onClick={onStopRecording}
              className="flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-[11px] bg-[rgba(255,255,255,0.1)] 
                   rounded-[11px] text-white hover:bg-[rgba(255,255,255,0.15)] transition-colors text-sm sm:text-base cursor-pointer"
            >
              Stop Recording
            </div>
          ) : (
            // Initial state
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                console.log(
                  '[RecordingPopupComponent] Start Recording button clicked',
                );
                onStartRecording();
              }}
              className="flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-[11px] bg-[rgba(255,255,255,0.1)] 
                   rounded-[11px] text-white hover:bg-[rgba(255,255,255,0.15)] transition-colors text-sm sm:text-base cursor-pointer"
            >
              Start Recording
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default RecordingPopupComponent;
