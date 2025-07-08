import CanvasPool from '../../utils/CanvasPool';
import type { RefObject } from 'preact';

// File validation constants (imported from constants or defined here)
const MAX_DURATION = 60; // 1 minute in seconds
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB max file size
const MIN_FILE_SIZE = 1024; // 1KB minimum file size
const ALLOWED_FILE_TYPES = [
  'audio/mpeg', // for .mp3
  'audio/wav',
  'audio/x-m4a',
  'video/x-msvideo',
];
const ALLOWED_FILE_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.avi'];

// Waveform configuration interface
export interface WaveformConfig {
  barWidth: number;
  gap: number;
  maxHeight: number;
  canvasWidth: number;
}

// Default waveform configuration
export const DEFAULT_WAVEFORM_CONFIG: WaveformConfig = {
  barWidth: 3,
  gap: 1,
  maxHeight: 0,
  canvasWidth: 0,
};

export const validateFile = async (
  file: File,
): Promise<{ isValid: boolean; error: string }> => {
  if (!file) {
    return { isValid: false, error: 'No file selected' };
  }

  if (file.size === 0) {
    return { isValid: false, error: 'File is empty' };
  }

  if (file.size < MIN_FILE_SIZE) {
    return { isValid: false, error: 'File is too small (minimum 1KB)' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { isValid: false, error: 'File size exceeds 25MB limit' };
  }

  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_FILE_EXTENSIONS.includes(fileExtension)) {
    return {
      isValid: false,
      error: 'Invalid file type. Supported formats: MP3, WAV, AVI, M4A',
    };
  }

  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      isValid: false,
      error: 'Invalid file type. Supported formats: MP3, WAV, AVI, M4A',
    };
  }

  // Check audio duration
  try {
    const duration = await getAudioDuration(file);
    if (duration > MAX_DURATION) {
      return { isValid: false, error: 'Audio duration exceeds 1 minute limit' };
    }
  } catch (error) {
    console.error('Error loading audio file:', error);
    return { isValid: false, error: 'Unable to validate audio duration' };
  }

  return { isValid: true, error: '' };
};

export const getAudioDuration = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();

    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    });

    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error('Error loading audio file'));
    });

    audio.src = url;
  });
};

export const formatTime = (time: number): string => {
  if (!time || isNaN(time) || !isFinite(time)) return '00:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
};

// Simplified static waveform drawing function
export const drawStaticWaveform = (
  canvas: HTMLCanvasElement,
  waveformData: number[][],
  lastDrawTime: number = 0,
): number => {
  if (!canvas || !waveformData || waveformData.length === 0) {
    return lastDrawTime;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn(
      '[VoiceChangerComponent] Canvas context not available for waveform drawing.',
    );
    return lastDrawTime;
  }

  // Setup canvas for high DPI displays
  const dpr = window.devicePixelRatio || 1;
  if (
    canvas.width !== canvas.offsetWidth * dpr ||
    canvas.height !== canvas.offsetHeight * dpr
  ) {
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
  }

  // Create waveform configuration
  const config: WaveformConfig = {
    ...DEFAULT_WAVEFORM_CONFIG,
    canvasWidth: canvas.width,
    maxHeight: canvas.height * 0.8,
  };

  // Process number[][] into a single number[] for display (by averaging)
  const frameCount = waveformData.length;
  const frameLength = waveformData[0].length;
  const displayData = new Array(frameLength).fill(0);

  for (let i = 0; i < frameLength; i++) {
    for (let j = 0; j < frameCount; j++) {
      displayData[i] += waveformData[j][i];
    }
    displayData[i] /= frameCount;
  }

  if (displayData.length > 0) {
    return drawWaveform(
      ctx,
      canvas,
      displayData,
      displayData.length,
      config,
      lastDrawTime,
    );
  }

  return lastDrawTime;
};

// Draw waveform function (with offscreen rendering, pooling, and dirty region update)
export const drawWaveform = (
  canvasCtx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  dataArray: Uint8Array | number[],
  bufferLength: number,
  waveformConfig: WaveformConfig,
  lastDrawTime: number,
  opacity: number = 1,
  dirtyRegion?: { start: number; end: number },
): number => {
  // Throttle to 60fps
  const now = performance.now();
  if (now - lastDrawTime < 16) return lastDrawTime;

  // Use offscreen canvas for heavy drawing
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.width;
  const height = canvas.height;
  const offscreen = CanvasPool.getCanvas(width, height);
  const offCtx =
    (offscreen as HTMLCanvasElement).getContext('2d') ||
    (offscreen as any).getContext('2d');
  if (!offCtx) return now;

  // Only clear and redraw dirty region if specified
  if (dirtyRegion) {
    const barWidth = waveformConfig.barWidth * dpr;
    const gap = waveformConfig.gap * dpr;
    const startX = dirtyRegion.start * (barWidth + gap);
    const endX = dirtyRegion.end * (barWidth + gap);
    offCtx.clearRect(startX, 0, endX - startX, height);
  } else {
    offCtx.clearRect(0, 0, width, height);
  }

  // Draw waveform bars (same as before, but on offscreen)
  const barWidth = waveformConfig.barWidth * dpr;
  const gap = waveformConfig.gap * dpr;
  const barCount = Math.floor(waveformConfig.canvasWidth / (barWidth + gap));
  const samplesPerBar = Math.floor(bufferLength / barCount);
  for (let i = 0; i < barCount; i++) {
    let peak = 0;
    const startSample = i * samplesPerBar;
    const endSample = Math.min(startSample + samplesPerBar, bufferLength);
    for (let j = startSample; j < endSample; j++) {
      const value = Math.abs(dataArray[j] / 128.0 - 1);
      if (value > peak) peak = value;
    }
    const barHeight = peak * waveformConfig.maxHeight;
    const x = i * (barWidth + gap);
    const y = (height - barHeight) / 2;
    offCtx.fillStyle = `rgba(218, 210, 232, ${opacity})`;
    offCtx.fillRect(x, y, barWidth, barHeight);
  }

  // Blit only the dirty region (or all) to the visible canvas
  if (dirtyRegion) {
    const barWidth = waveformConfig.barWidth * dpr;
    const gap = waveformConfig.gap * dpr;
    const startX = dirtyRegion.start * (barWidth + gap);
    const endX = dirtyRegion.end * (barWidth + gap);
    canvasCtx.clearRect(startX, 0, endX - startX, height);
    canvasCtx.drawImage(
      offscreen,
      startX,
      0,
      endX - startX,
      height,
      startX,
      0,
      endX - startX,
      height,
    );
  } else {
    canvasCtx.clearRect(0, 0, width, height);
    canvasCtx.drawImage(offscreen, 0, 0);
  }

  CanvasPool.releaseCanvas(offscreen);
  return now;
};

// Utility functions for Voice_Changer

// setupAudioVisualization: initializes audio context, analyser, and stream
export async function setupAudioVisualization({
  audioContextRef,
  analyserRef,
  audioStreamRef,
  mediaStreamSourceRef,
  handleError,
}: {
  audioContextRef: RefObject<AudioContext | null>;
  analyserRef: RefObject<AnalyserNode | null>;
  audioStreamRef: RefObject<MediaStream | null>;
  mediaStreamSourceRef: RefObject<MediaStreamAudioSourceNode | null>;
  handleError: (
    error: unknown,
    fallbackMessage?: string,
    updateRecording?: boolean,
  ) => void;
}): Promise<MediaStream | null> {
  try {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }
    await audioContextRef.current.resume();

    if (!analyserRef.current) {
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 1024;
      analyserRef.current.smoothingTimeConstant = 0.4;
      analyserRef.current.minDecibels = -65;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        autoGainControl: true,
        noiseSuppression: false,
      },
    });
    audioStreamRef.current = stream;

    if (mediaStreamSourceRef.current) {
      mediaStreamSourceRef.current.disconnect();
    }
    mediaStreamSourceRef.current =
      audioContextRef.current.createMediaStreamSource(stream);
    mediaStreamSourceRef.current.connect(analyserRef.current);

    return stream;
  } catch (err) {
    handleError(
      err,
      'Could not access microphone. Please check permissions.',
      true,
    );
    return null;
  }
}

// stopAudioVisualization: disconnects media stream source from analyser
export function stopAudioVisualization({
  mediaStreamSourceRef,
  analyserRef,
  handleError,
}: {
  mediaStreamSourceRef: RefObject<MediaStreamAudioSourceNode | null>;
  analyserRef: RefObject<AnalyserNode | null>;
  handleError: (
    error: unknown,
    fallbackMessage?: string,
    updateRecording?: boolean,
  ) => void;
}): void {
  if (mediaStreamSourceRef.current && analyserRef.current) {
    try {
      mediaStreamSourceRef.current.disconnect(analyserRef.current);
    } catch (e) {
      handleError(e, 'Error disconnecting media stream source', true);
    }
  }
}

// setupAudioElement: creates and configures an HTMLAudioElement
export function setupAudioElement(
  url: string,
  onEnded: () => void,
  onTimeUpdate: (currentTime: number) => void,
  handleError: (error: unknown, fallbackMessage?: string) => void,
): HTMLAudioElement {
  const audio = new Audio(url);
  audio.onloadedmetadata = () => {};
  audio.onended = onEnded;
  audio.ontimeupdate = () => onTimeUpdate(audio.currentTime);
  audio.onerror = (e) => handleError(e, 'Audio playback error');
  return audio;
}

// handleClickOutside: closes dropdown if click is outside
export function handleClickOutside(
  event: MouseEvent,
  setVoiceSelectionState: (updater: (prev: any) => any) => void,
): void {
  const target = event.target as HTMLElement;
  const dropdown = document.querySelector('.language-dropdown-container');
  if (dropdown && !dropdown.contains(target)) {
    setVoiceSelectionState((prev) => ({
      ...prev,
      isLanguageDropdownOpen: false,
    }));
  }
}

// handleDragOver: sets isDragging to true
export function handleDragOver(
  e: DragEvent,
  setIsDragging: (dragging: boolean) => void,
): void {
  e.preventDefault();
  setIsDragging(true);
}

// handleDragLeave: sets isDragging to false
export function handleDragLeave(
  e: DragEvent,
  setIsDragging: (dragging: boolean) => void,
): void {
  e.preventDefault();
  setIsDragging(false);
}

// handleDrop: handles file drop
export async function handleDrop(
  e: DragEvent,
  setIsDragging: (dragging: boolean) => void,
  handleFileSelect: (file: File) => Promise<void>,
): Promise<void> {
  e.preventDefault();
  setIsDragging(false);
  const file = e.dataTransfer?.files[0];
  if (file) {
    await handleFileSelect(file);
  }
}

// drawStaticWaveformOnMainCanvas: draws waveform on canvas
export function drawStaticWaveformOnMainCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  waveformDataRef: RefObject<number[][]>,
  drawStaticWaveform: (
    canvas: HTMLCanvasElement,
    waveformData: number[][],
  ) => void,
): void {
  const canvas = canvasRef.current;
  if (canvas && waveformDataRef.current) {
    drawStaticWaveform(canvas, waveformDataRef.current);
  }
}

// --- Audio Element Utilities ---

/**
 * Play an audio element and update state accordingly.
 */
export async function playAudioElement(
  audioRef: RefObject<HTMLAudioElement | null>,
  setState: any,
  onError: (
    error: unknown,
    fallbackMessage?: string,
    updateRecording?: boolean,
  ) => void,
  onPlay?: () => void,
): Promise<void> {
  if (!audioRef.current) return;
  try {
    await audioRef.current.play();
    setState((prev: any) => ({ ...prev, isPlayingRecordedAudio: true }));
    if (onPlay) onPlay();
  } catch (error) {
    onError(error, 'Error playing audio element', true);
    setState((prev: any) => ({ ...prev, isPlayingRecordedAudio: false }));
  }
}

/**
 * Pause an audio element and update state accordingly.
 */
export function pauseAudioElement(
  audioRef: RefObject<HTMLAudioElement | null>,
  setState: any,
): void {
  if (audioRef.current) {
    audioRef.current.pause();
    setState((prev: any) => ({ ...prev, isPlayingRecordedAudio: false }));
  } else {
    setState((prev: any) => ({ ...prev, isPlayingRecordedAudio: false }));
  }
}

/**
 * Reset an audio element to the beginning and update state.
 */
export function resetAudioElement(
  audioRef: RefObject<HTMLAudioElement | null>,
  setState: any,
  setResetWaveformPlayback: (updater: (prev: number) => number) => void,
): void {
  if (audioRef.current) {
    audioRef.current.currentTime = 0;
    setState((prev: any) => ({ ...prev, playbackTime: 0 }));
    setResetWaveformPlayback((prev) => prev + 1);
  }
}

/**
 * Clean up and reset the recorded audio element.
 */
export function cleanupRecordedAudio(
  audioRef: RefObject<HTMLAudioElement | null>,
): void {
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    if (audioRef.current.src && audioRef.current.src.startsWith('blob:')) {
      URL.revokeObjectURL(audioRef.current.src);
    }
    audioRef.current.removeAttribute('src');
    audioRef.current.load();
    audioRef.current = null;
  }
}

/**
 * Reset recording state and waveform data.
 */
export function resetRecordingState(
  setState: any,
  waveformDataRef: RefObject<any>,
  recordedChunks: RefObject<any>,
  setResetWaveformPlayback: (updater: (prev: number) => number) => void,
): void {
  setState((prev: any) => ({
    ...prev,
    recordedAudioUrl: null,
    recordedDuration: 0,
    isPlayingRecordedAudio: false,
    playbackTime: 0,
  }));
  waveformDataRef.current = [];
  recordedChunks.current = [];
  setResetWaveformPlayback((prev) => prev + 1);
}
