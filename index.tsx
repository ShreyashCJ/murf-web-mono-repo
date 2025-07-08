import {
  useState,
  useEffect,
  useRef,
  useReducer,
  useCallback,
} from 'preact/hooks';
import { createPortal } from 'preact/compat';
import RecordingPopupComponent from '../../components/VoiceChangerComp/RecordingPopupComponent';
import FileUploadAreaComponent from '../../components/VoiceChangerComp/FileUploadAreaComponent';
import AudioPlaybackComponent from '../../components/VoiceChangerComp/AudioPlaybackComponent';
import VoiceSelectionComponent from '../../components/VoiceChangerComp/VoiceSelectionComponent';
import UploadingStateComponent from '../../components/VoiceChangerComp/UploadingStateComponent';
import ProcessingStateComponent from '../../components/VoiceChangerComp/ProcessingStateComponent';
import useAudioConverter from '../../hooks/useAudioConverter';
import useToast from '../../hooks/useToast';
import ResourceManager from '../../utils/ResourceManager';
import {
  validateFile,
  drawStaticWaveform,
  formatTime,
  setupAudioVisualization,
  stopAudioVisualization,
  setupAudioElement,
  handleClickOutside,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  drawStaticWaveformOnMainCanvas,
  playAudioElement,
  pauseAudioElement,
  resetAudioElement,
  cleanupRecordedAudio,
  resetRecordingState,
} from './utils';
import useVoiceUpload from '../../hooks/useVoiceUpload';

const VOICES_API_URL = 'https://murf.ai/Prod/ping/common-voices';

export type UploadStateType =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed'
  | null;

interface ApiResponse {
  responseCode: string;
  voiceGroups: any[];
}

const INITIAL_LANGUAGES = [
  {
    id: 'en-US',
    name: 'English - US & Canada',
    flag: 'https://murf.ai/public-assets/countries/us-canada.svg',
  },
  {
    id: 'en-UK',
    name: 'English - UK',
    flag: 'https://murf.ai/public-assets/countries/uk.svg',
  },
  {
    id: 'en-AU',
    name: 'English - Australia',
    flag: 'https://murf.ai/public-assets/countries/australia.svg',
  },
  {
    id: 'en-IN',
    name: 'English - India',
    flag: 'https://murf.ai/public-assets/countries/india.svg',
  },
  {
    id: 'es-ES',
    name: 'Spanish - Spain',
    flag: 'https://murf.ai/public-assets/countries/spain-mexico.svg',
  },
];

const MAX_DURATION = 60; // 1 minute in seconds

// --- Upload State Machine ---
interface UploadState {
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  processingProgress: number;
  error: string | null;
  outputLink: string | null;
  jobId: string | null;
}

type UploadAction =
  | { type: 'START_UPLOAD' }
  | { type: 'SET_UPLOAD_PROGRESS'; payload: number }
  | { type: 'START_PROCESSING' }
  | { type: 'SET_PROCESSING_PROGRESS'; payload: number }
  | { type: 'COMPLETE'; payload: string }
  | { type: 'FAIL'; payload: string }
  | { type: 'RESET' }
  | { type: 'SET_JOB_ID'; payload: string };

const initialUploadState: UploadState = {
  status: 'idle',
  progress: 0,
  processingProgress: 0,
  error: null,
  outputLink: null,
  jobId: null,
};

const uploadReducer = (
  state: UploadState,
  action: UploadAction,
): UploadState => {
  switch (action.type) {
    case 'START_UPLOAD':
      return {
        ...state,
        status: 'uploading',
        progress: 0,
        error: null,
      };
    case 'SET_UPLOAD_PROGRESS':
      return {
        ...state,
        progress: action.payload,
      };
    case 'START_PROCESSING':
      return {
        ...state,
        status: 'processing',
        processingProgress: 0,
      };
    case 'SET_PROCESSING_PROGRESS':
      return {
        ...state,
        processingProgress: action.payload,
      };
    case 'COMPLETE':
      return {
        ...state,
        status: 'completed',
        outputLink: action.payload,
        processingProgress: 100,
      };
    case 'FAIL':
      return {
        ...state,
        status: 'failed',
        error: action.payload,
      };
    case 'RESET':
      return initialUploadState;
    case 'SET_JOB_ID':
      return {
        ...state,
        jobId: action.payload,
      };
    default:
      return state;
  }
};

const Voice_Changer_Component = () => {
  // File Upload State
  const [selectedFile, _setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadState, dispatchUpload] = useReducer(
    uploadReducer,
    initialUploadState,
  );
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // Combined animation refs
  const animationRefs = useRef<{
    upload: number | null;
    processing: number | null;
  }>({
    upload: null,
    processing: null,
  });

  // Consolidated voice selection state
  const [voiceSelectionState, setVoiceSelectionState] = useState({
    selectedLanguage: INITIAL_LANGUAGES[0],
    isLanguageDropdownOpen: false,
    voices: [] as any[],
    selectedVoice: null as string | null,
    isVoicesLoading: false,
  });

  // Audio element refs
  const audioRefs = useRef<{ recorded: HTMLAudioElement | null }>({
    recorded: null,
  });

  // Consolidated recording state
  const [recordingState, setRecordingState] = useState({
    isPopupOpen: false,
    isRecording: false,
    recordingTime: 0,
    recordedAudioUrl: null as string | null,
    recordedDuration: 0,
    playbackTime: 0,
    isPlayingRecordedAudio: false,
  });

  const recordingTimerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const waveformDataRef = useRef<number[][]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // New state for explicitly resetting playback visuals in child component
  const [resetWaveformPlayback, setResetWaveformPlayback] = useState(0);

  // Initialize useAudioConverter hook
  const { convertBlobToWav, conversionError } = useAudioConverter();

  const showToast = useToast();
  // Unified error handler for both generic and specific errors
  const handleError = useCallback(
    (error: unknown, fallbackMessage?: string, updateRecording?: boolean) => {
      let message = fallbackMessage || 'An unexpected error occurred.';
      if (error instanceof Error) {
        message = error.message || message;
      } else if (typeof error === 'string') {
        message = error;
      }
      if (updateRecording) {
        setRecordingState((prev) => ({
          ...prev,
          isRecording: false,
        }));
        dispatchUpload({
          type: 'FAIL',
          payload:
            error instanceof Error
              ? error.message
              : fallbackMessage || 'An error occurred',
        });
      }
      showToast({ message, type: 'error' });
    },
    [showToast],
  );

  const setSelectedFile = (file: File | null) => {
    _setSelectedFile(file);
  };

  // Centralized cleanup for all resources
  const cleanupResources = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    if (animationRefs.current.upload) {
      clearInterval(animationRefs.current.upload);
      animationRefs.current.upload = null;
    }
    if (animationRefs.current.processing) {
      clearInterval(animationRefs.current.processing);
      animationRefs.current.processing = null;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    if (audioRefs.current.recorded) {
      audioRefs.current.recorded.pause();
      audioRefs.current.recorded.currentTime = 0;
      audioRefs.current.recorded.src = '';
      audioRefs.current.recorded = null;
    }
    ResourceManager.cleanupAll();
  };

  const handleResetToInitial = () => {
    cleanupResources();
    dispatchUpload({ type: 'RESET' });
    setSelectedFile(null);
    setVoiceSelectionState((prev) => ({
      ...prev,
      selectedVoice: null,
      isVoicesLoading: false,
    }));
  };

  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const drawStaticWaveformOnMainCanvasCb = useCallback(() => {
    drawStaticWaveformOnMainCanvas(
      canvasRef,
      waveformDataRef,
      drawStaticWaveform,
    );
  }, [canvasRef, waveformDataRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const shouldDraw = selectedFile || recordingState.recordedAudioUrl;
    if (canvas && shouldDraw && waveformDataRef.current?.length > 0) {
      drawStaticWaveformOnMainCanvasCb();
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      resizeObserverRef.current = new ResizeObserver(
        drawStaticWaveformOnMainCanvasCb,
      );
      resizeObserverRef.current.observe(canvas);
      return () => {
        if (resizeObserverRef.current) {
          resizeObserverRef.current.disconnect();
        }
      };
    }
  }, [
    selectedFile,
    recordingState.recordedAudioUrl,
    drawStaticWaveformOnMainCanvasCb,
  ]);

  // Unified audio action handler
  const handleAudioAction = useCallback(
    async (action: string) => {
      switch (action) {
        case 'startRecording': {
          try {
            setRecordingState((prev) => ({
              ...prev,
              isRecording: true,
              recordingTime: 0,
            }));
            dispatchUpload({ type: 'RESET' });
            const stream = await setupAudioVisualizationCb();
            if (!stream) {
              handleError(
                'Failed to get audio stream.',
                'Could not access microphone',
                true,
              );
              return;
            }
            mediaRecorderRef.current = new MediaRecorder(stream);
            recordedChunks.current = [];
            mediaRecorderRef.current.ondataavailable = (e) => {
              if (e.data.size > 0) recordedChunks.current.push(e.data);
            };
            mediaRecorderRef.current.onstop = () => {
              const recordedBlob = new Blob(recordedChunks.current, {
                type: 'audio/webm',
              });
              const url = URL.createObjectURL(recordedBlob);
              setRecordingState((prev) => ({ ...prev, recordedAudioUrl: url }));
            };
            mediaRecorderRef.current.start(100);
            recordingTimerRef.current = window.setInterval(() => {
              setRecordingState((prev) => {
                const newTime = prev.recordingTime + 1;
                if (newTime >= MAX_DURATION) {
                  if (
                    mediaRecorderRef.current &&
                    mediaRecorderRef.current.state === 'recording'
                  ) {
                    mediaRecorderRef.current.stop();
                  }
                  clearInterval(recordingTimerRef.current!);
                  return prev;
                }
                return { ...prev, recordingTime: newTime };
              });
            }, 1000);
          } catch (err) {
            handleError(err, 'Could not access microphone', true);
          }
          break;
        }
        case 'stopRecording': {
          setRecordingState((prev) => ({ ...prev, isRecording: false }));
          if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state === 'recording'
          ) {
            mediaRecorderRef.current.stop();
          }
          stopAudioVisualizationCb();
          if (audioStreamRef.current) {
            audioStreamRef.current.getTracks().forEach((track) => track.stop());
            audioStreamRef.current = null;
          }
          if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
          }
          setRecordingState((prev) => ({
            ...prev,
            recordedDuration: prev.recordingTime,
          }));
          const canvas = canvasRef.current;
          if (canvas && waveformDataRef.current?.length > 0) {
            drawStaticWaveform(canvas, waveformDataRef.current);
          }
          break;
        }
        case 'playAudio':
        case 'pauseAudio': {
          if (action === 'playAudio') {
            if (!recordingState.recordedAudioUrl) return;
            if (
              audioRefs.current.recorded &&
              recordingState.isPlayingRecordedAudio
            ) {
              pauseAudioElement(
                { current: audioRefs.current.recorded },
                setRecordingState,
              );
              return;
            }
            if (!audioRefs.current.recorded) {
              try {
                audioRefs.current.recorded = setupAudioElementCb(
                  recordingState.recordedAudioUrl,
                  () => {
                    if (audioRefs.current.recorded) {
                      resetAudioElement(
                        { current: audioRefs.current.recorded },
                        setRecordingState,
                        setResetWaveformPlayback,
                      );
                    }
                  },
                  (currentTime: number) =>
                    setRecordingState((prev) => ({
                      ...prev,
                      playbackTime: currentTime,
                    })),
                );
              } catch (error) {
                handleError(
                  error,
                  'Error setting up recorded audio element',
                  true,
                );
                setRecordingState((prev) => ({
                  ...prev,
                  isPlayingRecordedAudio: false,
                }));
                return;
              }
            }
            if (
              audioRefs.current.recorded &&
              (audioRefs.current.recorded.ended ||
                audioRefs.current.recorded.currentTime >=
                  audioRefs.current.recorded.duration - 0.05 ||
                recordingState.playbackTime !== 0)
            ) {
              resetAudioElement(
                { current: audioRefs.current.recorded },
                setRecordingState,
                setResetWaveformPlayback,
              );
            }
            await playAudioElement(
              { current: audioRefs.current.recorded },
              setRecordingState,
              handleError,
            );
          } else {
            pauseAudioElement(
              { current: audioRefs.current.recorded },
              setRecordingState,
            );
          }
          break;
        }
        case 'reRecord': {
          cleanupRecordedAudio({ current: audioRefs.current.recorded });
          resetRecordingState(
            setRecordingState,
            waveformDataRef,
            recordedChunks,
            setResetWaveformPlayback,
          );
          break;
        }
        case 'proceedRecording': {
          // Pause recorded audio playback if playing
          if (
            audioRefs.current.recorded &&
            !audioRefs.current.recorded.paused &&
            recordingState.isPlayingRecordedAudio
          ) {
            audioRefs.current.recorded.pause();
            setRecordingState((prev) => ({
              ...prev,
              isPlayingRecordedAudio: false,
            }));
          }
          if (
            !recordingState.recordedAudioUrl ||
            !recordedChunks.current.length
          )
            return;
          const audioBlob = new Blob(recordedChunks.current, {
            type: 'audio/webm',
          });
          let fileToUpload: File | null = null;
          if (audioBlob.type === 'audio/webm') {
            fileToUpload = await convertBlobToWav(
              audioBlob,
              'recorded_audio.wav',
            );
            if (conversionError) {
              handleError(
                conversionError,
                'Failed to prepare recorded audio',
                true,
              );
              return;
            }
          } else if (audioBlob.type === 'audio/wav') {
            fileToUpload = new File([audioBlob], 'recorded_audio.wav', {
              type: 'audio/wav',
            });
          } else {
            fileToUpload = new File([audioBlob], 'recorded_audio.webm', {
              type: audioBlob.type,
            });
          }
          if (fileToUpload) {
            setSelectedFile(fileToUpload);
            dispatchUpload({ type: 'RESET' });
            setRecordingState((prev) => ({
              ...prev,
              isRecording: false,
              recordedAudioUrl: null,
            }));
          } else {
            handleError(
              'Failed to prepare recorded audio for upload.',
              undefined,
              true,
            );
          }
          break;
        }
        default:
          break;
      }
    },
    [handleError, recordingState, convertBlobToWav, conversionError],
  );

  // Use imported utility functions for audio, drag, and click handling
  const handleClickOutsideCb = useCallback(
    (event: MouseEvent) => {
      handleClickOutside(event, setVoiceSelectionState);
    },
    [setVoiceSelectionState],
  );

  const handleDragOverCb = (e: DragEvent) => handleDragOver(e, setIsDragging);
  const handleDragLeaveCb = (e: DragEvent) => handleDragLeave(e, setIsDragging);
  const handleDropCb = async (e: DragEvent) =>
    handleDrop(e, setIsDragging, handleFileSelect);

  // For setupAudioVisualization and stopAudioVisualization, pass refs and error handler
  const setupAudioVisualizationCb = async () =>
    await setupAudioVisualization({
      audioContextRef,
      analyserRef,
      audioStreamRef,
      mediaStreamSourceRef,
      handleError,
    });
  const stopAudioVisualizationCb = () =>
    stopAudioVisualization({
      mediaStreamSourceRef,
      analyserRef,
      handleError,
    });
  const setupAudioElementCb = (
    url: string,
    onEnded: () => void,
    onTimeUpdate: (currentTime: number) => void,
  ): HTMLAudioElement =>
    setupAudioElement(url, onEnded, onTimeUpdate, handleError);

  // Cache for voices per language
  const voicesCacheRef = useRef<{ [languageId: string]: any[] }>({});

  // Combined useEffect for voices fetching and click outside handling
  const hasFetchedAllVoicesRef = useRef(false);
  useEffect(() => {
    // Click outside handling
    if (voiceSelectionState.isLanguageDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutsideCb);
    }

    // Voices fetching/caching
    const langId = voiceSelectionState.selectedLanguage.id;
    if (langId) {
      const cachedVoices = voicesCacheRef.current[langId];
      if (cachedVoices) {
        setVoiceSelectionState((prev) => ({
          ...prev,
          voices: cachedVoices,
          isVoicesLoading: false,
        }));
        if (!voiceSelectionState.selectedVoice && cachedVoices.length > 0) {
          handleVoiceSelect(cachedVoices[0]);
        }
      } else if (!hasFetchedAllVoicesRef.current) {
        setVoiceSelectionState((prev) => ({
          ...prev,
          isVoicesLoading: true,
        }));
        const fetchAllVoices = async () => {
          try {
            const response = await fetch(VOICES_API_URL);
            const data: ApiResponse = await response.json();
            for (const group of data.voiceGroups) {
              const processedVoices = group.voices
                .map((voice: any) => {
                  if (!voice.apiName) return null;
                  return {
                    id: parseInt(voice.voiceId.replace(/[^\d]/g, '')),
                    apiName: voice.apiName,
                    name: voice.voiceName.split(' ')[0],
                    description: voice.description,
                    age: voice.description.includes('Young')
                      ? 'Young Adult'
                      : 'Middle Aged',
                    rawVoiceId: voice.voiceId,
                  };
                })
                .filter(
                  (voice: any): voice is any =>
                    voice !== null && Boolean(voice.apiName),
                );
              voicesCacheRef.current[group.locale.replace('_', '-')] =
                processedVoices;
            }
            hasFetchedAllVoicesRef.current = true;
            const currentVoices = voicesCacheRef.current[langId] || [];
            setVoiceSelectionState((prev) => ({
              ...prev,
              voices: currentVoices,
            }));
            if (
              !voiceSelectionState.selectedVoice &&
              currentVoices.length > 0
            ) {
              handleVoiceSelect(currentVoices[0]);
            }
          } catch (error) {
            handleError(error, 'Failed to load voices', true);
            setVoiceSelectionState((prev) => ({
              ...prev,
              voices: [],
            }));
          } finally {
            setVoiceSelectionState((prev) => ({
              ...prev,
              isVoicesLoading: false,
            }));
          }
        };
        fetchAllVoices();
      }
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutsideCb);
    };
  }, [
    voiceSelectionState.selectedLanguage,
    voiceSelectionState.isLanguageDropdownOpen,
    handleClickOutsideCb,
    handleError,
  ]);

  const handleFileSelect = useCallback(
    async (file: File) => {
      const validation = await validateFile(file);
      if (!validation.isValid) {
        handleError(validation.error, 'Error validating file', true);
        return;
      }
      dispatchUpload({ type: 'RESET' });
      setSelectedFile(file);
    },
    [handleError],
  );

  const handleVoiceSelect = (voice: any) => {
    setVoiceSelectionState((prev) => ({
      ...prev,
      selectedVoice: voice.apiName,
    }));
    if (selectedFile) {
      dispatchUpload({ type: 'SET_UPLOAD_PROGRESS', payload: 2 });
    }
  };

  // Use the extracted upload hook
  const { startUpload, handleCancelUpload, handleStartOver } = useVoiceUpload({
    selectedFile,
    selectedVoice: voiceSelectionState.selectedVoice,
    voices: voiceSelectionState.voices,
    selectedLanguageId: voiceSelectionState.selectedLanguage.id,
    dispatchUpload,
    handleError,
    showToast,
    handleResetToInitial,
  });

  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, []);

  const handleStartVoiceChange = useCallback(() => {
    // Pause recorded audio playback if playing
    if (
      audioRefs.current.recorded &&
      !audioRefs.current.recorded.paused &&
      recordingState.isPlayingRecordedAudio
    ) {
      audioRefs.current.recorded.pause();
      setRecordingState((prev) => ({ ...prev, isPlayingRecordedAudio: false }));
    }
    if (!selectedFile || !voiceSelectionState.selectedVoice) {
      handleError(
        'Please select a file and a voice.',
        'Error starting voice change',
        true,
      );
      return;
    }
    if (voiceSelectionState.isVoicesLoading) {
      handleError(
        'Please wait until voices are loaded',
        'Error loading voices',
        true,
      );
      return;
    }
    if (voiceSelectionState.voices.length === 0) {
      handleError(
        'No voices available for the selected language',
        'No voices available',
        true,
      );
      return;
    }
    if (!voiceSelectionState.selectedVoice) {
      handleError(
        'Please select a voice before starting',
        'No voice selected',
        true,
      );
      return;
    }
    if (!selectedFile) {
      handleError('No file selected', 'No file uploaded', true);
      return;
    }

    dispatchUpload({ type: 'RESET' });
    dispatchUpload({ type: 'SET_UPLOAD_PROGRESS', payload: 0 });
    startUpload();
  }, [
    selectedFile,
    voiceSelectionState.selectedVoice,
    voiceSelectionState.isVoicesLoading,
    voiceSelectionState.voices,
    handleError,
    recordingState.isPlayingRecordedAudio,
  ]);

  const renderContent = () => {
    // Recording popup portal (always rendered if open, outside status logic)
    const recordingPopup =
      recordingState.isPopupOpen && document.body
        ? createPortal(
            <RecordingPopupComponent
              isOpen={true}
              onClose={() =>
                setRecordingState((prev) => ({ ...prev, isPopupOpen: false }))
              }
              onStartRecording={() => handleAudioAction('startRecording')}
              onStopRecording={() => handleAudioAction('stopRecording')}
              onPlayRecordedAudio={() => handleAudioAction('playAudio')}
              onPauseRecording={() => handleAudioAction('pauseAudio')}
              isPlayingRecordedAudio={recordingState.isPlayingRecordedAudio}
              onReRecord={() => handleAudioAction('reRecord')}
              onProceed={() => handleAudioAction('proceedRecording')}
              isRecording={recordingState.isRecording}
              recordingTime={recordingState.recordingTime}
              recordedDuration={recordingState.recordedDuration}
              recordedAudioUrl={recordingState.recordedAudioUrl}
              maxDuration={MAX_DURATION}
              analyserNode={analyserRef.current}
              currentPlaybackTime={recordingState.playbackTime}
              resetTrigger={resetWaveformPlayback}
            />,
            document.body,
          )
        : null;

    if (!selectedFile) {
      return (
        <div className="w-full min-h-screen flex items-center justify-center relative">
          {recordingPopup}
          <FileUploadAreaComponent
            handleDragOver={handleDragOverCb}
            handleDragLeave={handleDragLeaveCb}
            handleDrop={handleDropCb}
            handleFileSelect={handleFileSelect}
            onRecordAudioClick={() =>
              setRecordingState((prev) => ({ ...prev, isPopupOpen: true }))
            }
            isDragging={isDragging}
          />
        </div>
      );
    }

    // Map status to component
    const statusMap: Record<string, JSX.Element | undefined> = {
      uploading: (
        <UploadingStateComponent
          selectedFile={selectedFile}
          progress={uploadState.progress}
          uploadError={uploadState.error || ''}
          handleCancelUpload={handleCancelUpload}
        />
      ),
      processing: (
        <ProcessingStateComponent
          uploadError={uploadState.error || ''}
          handleResetToInitial={handleResetToInitial}
        />
      ),
      completed: uploadState.outputLink ? (
        <AudioPlaybackComponent
          selectedFile={selectedFile}
          outputLink={uploadState.outputLink}
          formatTime={formatTime}
          handleStartOver={handleStartOver}
        />
      ) : undefined,
    };

    // If status is handled, return mapped component
    if (uploadState.status && statusMap[uploadState.status]) {
      return statusMap[uploadState.status]!;
    }

    // Default: Voice selection view
    return (
      <VoiceSelectionComponent
        selectedFile={selectedFile}
        voices={voiceSelectionState.voices}
        selectedVoice={voiceSelectionState.selectedVoice}
        isVoicesLoading={voiceSelectionState.isVoicesLoading}
        availableLanguages={INITIAL_LANGUAGES}
        selectedLanguage={voiceSelectionState.selectedLanguage}
        isLanguageDropdownOpen={voiceSelectionState.isLanguageDropdownOpen}
        handleVoiceSelect={handleVoiceSelect}
        handleStartVoiceChange={handleStartVoiceChange}
        setIsLanguageDropdownOpen={(isOpen) =>
          setVoiceSelectionState((prev) => ({
            ...prev,
            isLanguageDropdownOpen: isOpen,
          }))
        }
        setSelectedLanguage={(language) =>
          setVoiceSelectionState((prev) => ({
            ...prev,
            selectedLanguage: language,
          }))
        }
        setSelectedVoice={(voice) =>
          setVoiceSelectionState((prev) => ({ ...prev, selectedVoice: voice }))
        }
      />
    );
  };

  return renderContent();
};

export default Voice_Changer_Component;
