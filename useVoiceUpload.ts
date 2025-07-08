import { useRef } from 'preact/hooks';
import ResourceManager from '../utils/ResourceManager';
import type { ToastProps } from '../types/Toast';

const API_BASE_URL = 'https://api.murf.ai';
const UPLOAD_API_URL = `${API_BASE_URL}/v1/speech-to-speech/anonymous`;
const MAX_UPLOAD_RETRIES = 3;
const RETRY_DELAY = 2000;
const UPLOAD_TIMEOUT = 120000;

type UploadAction =
  | { type: 'START_UPLOAD' }
  | { type: 'SET_UPLOAD_PROGRESS'; payload: number }
  | { type: 'START_PROCESSING' }
  | { type: 'SET_PROCESSING_PROGRESS'; payload: number }
  | { type: 'COMPLETE'; payload: string }
  | { type: 'FAIL'; payload: string }
  | { type: 'RESET' }
  | { type: 'SET_JOB_ID'; payload: string };

interface UseVoiceUploadParams {
  selectedFile: File | null;
  selectedVoice: string | null;
  voices: any[];
  selectedLanguageId: string;
  dispatchUpload: (action: UploadAction) => void;
  handleError: (
    error: unknown,
    fallbackMessage?: string,
    updateRecording?: boolean,
  ) => void;
  showToast: (opts: ToastProps) => void;
  handleResetToInitial: () => void;
}

function useVoiceUpload({
  selectedFile,
  selectedVoice,
  voices,
  selectedLanguageId,
  dispatchUpload,
  handleError,
  showToast,
  handleResetToInitial,
}: UseVoiceUploadParams) {
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const animationRefs = useRef<{
    upload: number | null;
    processing: number | null;
  }>({ upload: null, processing: null });

  const animateProcessingProgress = (
    targetProgress: number,
    totalDuration: number,
    onCompleteCallback?: () => void,
  ) => {
    let currentAnimatedProgress = 0;
    dispatchUpload({ type: 'SET_PROCESSING_PROGRESS', payload: 0 });
    const numberOfSteps = Math.ceil(totalDuration / 50);
    const incrementPerStep =
      (targetProgress - currentAnimatedProgress) / numberOfSteps;
    const intervalTime = totalDuration / numberOfSteps;
    if (animationRefs.current.processing) {
      clearInterval(animationRefs.current.processing);
      animationRefs.current.processing = null;
    }
    animationRefs.current.processing = window.setInterval(() => {
      currentAnimatedProgress += incrementPerStep;
      if (currentAnimatedProgress >= targetProgress) {
        dispatchUpload({
          type: 'SET_PROCESSING_PROGRESS',
          payload: targetProgress,
        });
        clearInterval(animationRefs.current.processing!);
        animationRefs.current.processing = null;
        if (onCompleteCallback) onCompleteCallback();
      } else {
        dispatchUpload({
          type: 'SET_PROCESSING_PROGRESS',
          payload: currentAnimatedProgress,
        });
      }
    }, intervalTime) as number;
    ResourceManager.registerInterval(Number(animationRefs.current.processing));
  };

  const startProcessingAnimation = (onApiDoneCallback?: () => void) => {
    dispatchUpload({ type: 'SET_PROCESSING_PROGRESS', payload: 0 });
    animateProcessingProgress(90, 5000, () => {
      if (onApiDoneCallback) onApiDoneCallback();
    });
  };

  const finishProcessingAnimation = (onComplete: () => void) => {
    animateProcessingProgress(100, 2000, onComplete);
  };

  const handleProcessedAudio = async (audioUrl: string): Promise<boolean> => {
    try {
      let audio: HTMLAudioElement;
      try {
        audio = new Audio(audioUrl);
        audio.onloadedmetadata = () => {};
        audio.onended = () => {};
        audio.ontimeupdate = () => {};
        audio.onerror = (e) => handleError(e, 'Audio playback error');
      } catch (error) {
        handleError(error, 'Error setting up processed audio element', true);
        return false;
      }
      await new Promise<void>((resolve, reject) => {
        const onLoad = () => {
          clearTimeout(timeout);
          resolve();
        };
        const onError = (error: Event) => {
          clearTimeout(timeout);
          reject(error);
        };
        audio.addEventListener('loadedmetadata', onLoad, { once: true });
        audio.addEventListener('error', onError, { once: true });
        audio.src = audioUrl;
        audio.load();
        const timeout = setTimeout(() => {
          audio.removeEventListener('loadedmetadata', onLoad);
          audio.removeEventListener('error', onError);
          resolve();
        }, 10000);
      });
      return true;
    } catch (error) {
      handleError(
        error,
        'Error processing final audio file for playback',
        true,
      );
      return false;
    }
  };

  const completeProcessing = (audioFileUrl: string) => {
    dispatchUpload({ type: 'SET_PROCESSING_PROGRESS', payload: 90 });
    finishProcessingAnimation(() => {
      handleProcessedAudio(audioFileUrl).then((success) => {
        if (success) {
          dispatchUpload({ type: 'COMPLETE', payload: audioFileUrl });
        } else {
          handleError(
            'Failed to set up processed audio for playback',
            undefined,
            true,
          );
          dispatchUpload({ type: 'RESET' });
        }
      });
    });
  };

  const handleRetry = (currentRetryCount: number, errorMessage: string) => {
    if (currentRetryCount < MAX_UPLOAD_RETRIES) {
      showToast({
        message: `Upload failed: ${errorMessage}. Retrying...`,
        type: 'error',
        duration: 5000,
      });
      if (xhrRef.current) {
        xhrRef.current.abort();
        xhrRef.current = null;
      }
      setTimeout(() => {
        startUpload(currentRetryCount + 1);
      }, RETRY_DELAY);
    } else {
      showToast({
        message: `Upload failed after ${MAX_UPLOAD_RETRIES} attempts: ${errorMessage}`,
        type: 'error',
        duration: 5000,
      });
      dispatchUpload({
        type: 'FAIL',
        payload: `Upload failed after ${MAX_UPLOAD_RETRIES} attempts: ${errorMessage}`,
      });
    }
  };

  const startUpload = async (retryCount = 0) => {
    dispatchUpload({ type: 'START_UPLOAD' });
    if (!selectedFile) {
      dispatchUpload({ type: 'FAIL', payload: 'No file selected' });
      return;
    }
    try {
      if (!selectedVoice) {
        dispatchUpload({
          type: 'FAIL',
          payload: 'No voice selected. Please select a voice.',
        });
        return;
      }
      const selectedVoiceObj = voices.find((v) => v.apiName === selectedVoice);
      if (!selectedVoiceObj) {
        dispatchUpload({ type: 'FAIL', payload: 'Selected voice not found' });
        return;
      }
      if (!selectedVoiceObj.apiName) {
        dispatchUpload({
          type: 'FAIL',
          payload: 'Invalid voice ID. Please select a different voice.',
        });
        return;
      }
      if (xhrRef.current) {
        xhrRef.current.abort();
        xhrRef.current = null;
      }
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.timeout = UPLOAD_TIMEOUT;
      const formData = new FormData();
      try {
        const fileBlob = new Blob([selectedFile], {
          type: selectedFile.type || 'audio/wav',
        });
        const file = new File([fileBlob], selectedFile.name, {
          type: selectedFile.type || 'audio/wav',
          lastModified: selectedFile.lastModified,
        });
        if (!file || file.size === 0) {
          throw new Error('Invalid file data');
        }
        formData.append('file', file);
        formData.append('voice_id', selectedVoiceObj.apiName);
        formData.append('retain_prosody', 'true');
        formData.append('multi_native_locale', selectedLanguageId);
        formData.append('style', 'natural');
        let uploadProgress = 0;
        const uploadDuration = 5000;
        const uploadStep = 100 / (uploadDuration / 50);
        const uploadInterval = setInterval(() => {
          uploadProgress += uploadStep;
          if (uploadProgress >= 100) {
            uploadProgress = 100;
            dispatchUpload({
              type: 'SET_UPLOAD_PROGRESS',
              payload: uploadProgress,
            });
            clearInterval(uploadInterval);
            dispatchUpload({ type: 'START_PROCESSING' });
            startProcessingAnimation();
          } else {
            dispatchUpload({
              type: 'SET_UPLOAD_PROGRESS',
              payload: uploadProgress,
            });
          }
        }, 50);
        ResourceManager.registerInterval(Number(uploadInterval));
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            clearInterval(uploadInterval);
            if (xhr.status === 200) {
              try {
                const responseData = JSON.parse(xhr.responseText);
                if (
                  responseData.job_id ||
                  responseData.jobId ||
                  responseData.id
                ) {
                  const jobIdFromServer =
                    responseData.job_id ||
                    responseData.jobId ||
                    responseData.id;
                  dispatchUpload({
                    type: 'SET_JOB_ID',
                    payload: jobIdFromServer,
                  });
                  dispatchUpload({ type: 'START_PROCESSING' });
                  startProcessingAnimation();
                } else if (responseData.audio_file) {
                  dispatchUpload({ type: 'START_PROCESSING' });
                  startProcessingAnimation(() =>
                    completeProcessing(responseData.audio_file),
                  );
                } else {
                  throw new Error('Invalid response format from server');
                }
              } catch (error) {
                const errorMessage =
                  error instanceof Error
                    ? error.message
                    : 'Unknown error parsing response';
                handleRetry(
                  retryCount,
                  `Error processing server response: ${errorMessage}`,
                );
              }
            } else {
              const errorText =
                xhr.responseText || `Upload failed with status: ${xhr.status}`;
              handleRetry(retryCount, errorText);
            }
          }
        };
        xhr.onerror = () => {
          handleRetry(retryCount, 'Network error occurred');
        };
        xhr.ontimeout = () => {
          handleRetry(retryCount, 'Request timed out');
        };
        xhr.open('POST', UPLOAD_API_URL);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.send(formData);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        handleRetry(retryCount, `Failed to prepare upload: ${errorMessage}`);
      }
    } catch (error) {
      dispatchUpload({ type: 'FAIL', payload: 'Error validating file' });
    }
  };

  const handleCancelUpload = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    dispatchUpload({ type: 'RESET' });
    if (animationRefs.current.upload) {
      clearInterval(animationRefs.current.upload);
      animationRefs.current.upload = null;
    }
    if (animationRefs.current.processing) {
      clearInterval(animationRefs.current.processing);
      animationRefs.current.processing = null;
    }
    showToast({ message: '', type: 'success', duration: 2000 });
    handleResetToInitial();
  };

  const handleStartOver = () => {
    dispatchUpload({ type: 'RESET' });
    handleCancelUpload();
  };

  return { startUpload, handleCancelUpload, handleStartOver };
}

export default useVoiceUpload;
