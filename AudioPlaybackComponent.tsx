import { FunctionalComponent } from 'preact';
import { useRef, useState, useEffect } from 'preact/hooks';

interface AudioPlaybackComponentProps {
  selectedFile: File | null;
  outputLink: string;
  formatTime: (time: number) => string;
  handleStartOver: () => void;
}

const AudioPlaybackComponent: FunctionalComponent<
  AudioPlaybackComponentProps
> = ({ selectedFile, outputLink, formatTime, handleStartOver }) => {
  // Local refs and state for audio elements and playback
  const originalAudioRef = useRef<HTMLAudioElement | null>(null);
  const processedAudioRef = useRef<HTMLAudioElement | null>(null);

  const [isOriginalPlaying, setIsOriginalPlaying] = useState(false);
  const [originalCurrentTime, setOriginalCurrentTime] = useState(0);
  const [originalDuration, setOriginalDuration] = useState(0);

  const [isProcessedPlaying, setIsProcessedPlaying] = useState(false);
  const [processedCurrentTime, setProcessedCurrentTime] = useState(0);
  const [processedDuration, setProcessedDuration] = useState(0);

  // Blob URL management for original audio
  const [originalAudioUrl, setOriginalAudioUrl] = useState<string | null>(null);

  // Create blob URL for original audio when selectedFile changes
  useEffect(() => {
    if (selectedFile) {
      const blobUrl = URL.createObjectURL(selectedFile);
      setOriginalAudioUrl(blobUrl);

      // Cleanup function to revoke blob URL
      return () => {
        URL.revokeObjectURL(blobUrl);
      };
    } else {
      setOriginalAudioUrl(null);
    }
  }, [selectedFile]);

  // Set up event listeners and src for original audio
  useEffect(() => {
    const audio = originalAudioRef.current;
    if (!audio || !originalAudioUrl) return;

    const handleLoadedMetadata = () => {
      setOriginalDuration(audio.duration);
    };
    const handleTimeUpdate = () => {
      setOriginalCurrentTime(audio.currentTime);
    };
    const handleEnded = () => {
      setIsOriginalPlaying(false);
      setOriginalCurrentTime(0);
    };
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    // Set the src for original audio
    audio.src = originalAudioUrl;
    audio.load();

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [originalAudioUrl]);

  // Set up event listeners and src for processed audio
  useEffect(() => {
    const audio = processedAudioRef.current;
    if (!audio) return;
    const handleLoadedMetadata = () => {
      setProcessedDuration(audio.duration);
    };
    const handleTimeUpdate = () => {
      setProcessedCurrentTime(audio.currentTime);
    };
    const handleEnded = () => {
      setIsProcessedPlaying(false);
      setProcessedCurrentTime(0);
    };
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    // Set the src for processed audio
    audio.src = outputLink;
    audio.load();

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [outputLink]);

  // Toggle play/pause for original audio
  const toggleOriginalAudio = () => {
    const audio = originalAudioRef.current;
    if (!audio) return;
    if (isOriginalPlaying) {
      audio.pause();
      setIsOriginalPlaying(false);
    } else {
      if (isProcessedPlaying && processedAudioRef.current) {
        processedAudioRef.current.pause();
        setIsProcessedPlaying(false);
      }
      audio.play();
      setIsOriginalPlaying(true);
    }
  };

  // Toggle play/pause for processed audio
  const toggleProcessedAudio = () => {
    const audio = processedAudioRef.current;
    if (!audio) return;
    if (isProcessedPlaying) {
      audio.pause();
      setIsProcessedPlaying(false);
    } else {
      if (isOriginalPlaying && originalAudioRef.current) {
        originalAudioRef.current.pause();
        setIsOriginalPlaying(false);
      }
      audio.play();
      setIsProcessedPlaying(true);
    }
  };

  // Handle progress bar click
  const handleProgressBarClick = (
    e: MouseEvent,
    audio: HTMLAudioElement | null,
    duration: number,
  ) => {
    if (!audio || !duration || !isFinite(duration)) return;
    const progressBar = e.currentTarget as HTMLDivElement;
    const bounds = progressBar.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const width = bounds.width;
    const percentage = x / width;
    const seekTime = percentage * duration;
    if (isFinite(seekTime)) {
      audio.currentTime = seekTime;
    }
  };

  return (
    <div className="w-full min-h-screen flex items-center justify-center relative">
      <div
        className="w-full max-w-[1000px] min-h-[382px] relative 
                  bg-[rgba(29,17,54,0.40)] backdrop-blur-[20px]
                  border-2 border-[rgba(255,255,255,0.15)] rounded-[24px]
                  flex items-center p-4 sm:p-6 lg:p-12"
      >
        {/* Background Image */}
        <img
          src="https://cdn.prod.website-files.com/66b3765153a8a0c399c70981/684fe030ee51d71640065edd_Glow%20-%20DEL%201.webp"
          alt="Glow background"
          className="absolute top-0 left-1/2 -translate-x-1/2 lg:-translate-x-[5%] pointer-events-none"
          style={{ width: 'auto', height: '350px', zIndex: -1 }}
        />
        {/* Audio Players Container */}
        <div className="w-full flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-14">
          {/* On mobile/tablet, processed audio player is rendered first (above), original below. On desktop, order is side by side. */}
          {/* Processed (Voice Changed) Audio Player */}
          <div className="w-full flex flex-col flex-1 order-1 md:order-2">
            <h2 className="text-white text-xl font-medium mb-6 flex items-center justify-center gap-2">
              <span>✨</span>
              Made with Voice Changer
            </h2>
            {/* Hidden audio element for control via ref */}
            <audio ref={processedAudioRef} preload="metadata" />
            <div className="p-2 rounded-2xl bg-[rgba(146,146,146,0.10)] backdrop-blur-[20px]">
              <div className="flex h-12 items-center gap-3 p-2 self-stretch">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={toggleProcessedAudio}
                  className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center hover:opacity-90 transition-opacity"
                  style={{
                    background:
                      'linear-gradient(0deg, rgba(255, 20, 20, 0.20) 0%, rgba(255, 20, 20, 0.20) 100%), linear-gradient(90deg, #FC6337 0%, #C516E1 100%)',
                    boxShadow: '0px 8px 24px 0px rgba(238, 33, 122, 0.40)',
                  }}
                >
                  {isProcessedPlaying ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 15 15"
                      fill="none"
                    >
                      <path
                        d="M3.98828 2.17871C3.15985 2.17871 2.48828 2.85028 2.48828 3.67871V10.9644C2.48828 11.7929 3.15985 12.4644 3.98828 12.4644C4.81671 12.4644 5.48828 11.7929 5.48828 10.9644V3.67871C5.48828 2.85028 4.81671 2.17871 3.98828 2.17871Z"
                        fill="white"
                      />
                      <path
                        d="M10.4169 2.17871C9.58843 2.17871 8.91685 2.85028 8.91685 3.67871V10.9644C8.91685 11.7929 9.58843 12.4644 10.4169 12.4644C11.2453 12.4644 11.9169 11.7929 11.9169 10.9644V3.67871C11.9169 2.85028 11.2453 2.17871 10.4169 2.17871Z"
                        fill="white"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 15 15"
                      fill="none"
                    >
                      <path
                        d="M11.2751 6.20895C12.1323 6.70382 12.1323 7.941 11.2751 8.43587L4.84654 12.1474C3.9894 12.6423 2.91797 12.0237 2.91797 11.0339L2.91797 3.61087C2.91797 2.62113 3.9894 2.00254 4.84654 2.49741L11.2751 6.20895Z"
                        fill="white"
                      />
                    </svg>
                  )}
                </div>
                <div
                  className="flex-1 h-2 bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden cursor-pointer"
                  onClick={(e) =>
                    handleProgressBarClick(
                      e,
                      processedAudioRef.current,
                      processedDuration,
                    )
                  }
                >
                  <div
                    className="h-full rounded-full transition-all duration-75 ease-out"
                    style={{
                      width: `${processedDuration > 0 ? (processedCurrentTime / processedDuration) * 100 : 0}%`,
                      background:
                        'linear-gradient(90deg, #735DFF 0%, #DAABFF 100%)',
                      transition: 'width 50ms linear',
                    }}
                  />
                </div>
                <span className="text-[rgba(255,255,255,0.60)] min-w-[80px] text-center font-mono">
                  {formatTime(processedCurrentTime)}/
                  {formatTime(processedDuration)}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 mt-8 justify-center">
              <a
                href={outputLink} // Use the direct outputLink for download
                download={`voice_changed_audio_${Date.now()}.wav`} // Add a unique element to filename
                className="px-6 py-3 hover:opacity-90 transition-opacity rounded-[11px] text-white font-medium cursor-pointer"
                style={{
                  background:
                    'linear-gradient(0deg, rgba(255, 20, 20, 0.20) 0%, rgba(255, 20, 20, 0.20) 100%), linear-gradient(90deg, #FC6337 0%, #C516E1 100%)',
                }}
              >
                Download
              </a>
              <button
                onClick={handleStartOver}
                className="px-6 py-3 text-white font-medium hover:opacity-90 transition-opacity rounded-[11px] bg-[rgba(245,243,249,0.1)] backdrop-blur-[12px] cursor-pointer"
              >
                Start Over
              </button>
            </div>
          </div>

          {/* Original Audio Player (below on mobile/tablet, left on desktop) */}
          <div className="w-full md:w-[300px] flex flex-col shrink-0 order-2 md:order-1">
            <h2 className="text-white text-xl font-medium mb-6 text-center">
              Original
            </h2>
            {/* Hidden audio element for control via ref */}
            <audio ref={originalAudioRef} preload="metadata" />
            <div className="p-2 rounded-2xl border border-[rgba(255,255,255,0.15)] backdrop-blur-[20px]">
              <div className="flex h-12 items-center gap-3 p-2 self-stretch">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={toggleOriginalAudio}
                  className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center hover:opacity-90 transition-opacity"
                  style={{
                    background:
                      'linear-gradient(0deg, rgba(255, 20, 20, 0.20) 0%, rgba(255, 20, 20, 0.20) 100%), linear-gradient(90deg, #FC6337 0%, #C516E1 100%)',
                    boxShadow: '0px 8px 24px 0px rgba(238, 33, 122, 0.40)',
                  }}
                >
                  {isOriginalPlaying ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 15 15"
                      fill="none"
                    >
                      <path
                        d="M3.98828 2.17871C3.15985 2.17871 2.48828 2.85028 2.48828 3.67871V10.9644C2.48828 11.7929 3.15985 12.4644 3.98828 12.4644C4.81671 12.4644 5.48828 11.7929 5.48828 10.9644V3.67871C5.48828 2.85028 4.81671 2.17871 3.98828 2.17871Z"
                        fill="white"
                      />
                      <path
                        d="M10.4169 2.17871C9.58843 2.17871 8.91685 2.85028 8.91685 3.67871V10.9644C8.91685 11.7929 9.58843 12.4644 10.4169 12.4644C11.2453 12.4644 11.9169 11.7929 11.9169 10.9644V3.67871C11.9169 2.85028 11.2453 2.17871 10.4169 2.17871Z"
                        fill="white"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 15 15"
                      fill="none"
                    >
                      <path
                        d="M11.2751 6.20895C12.1323 6.70382 12.1323 7.941 11.2751 8.43587L4.84654 12.1474C3.9894 12.6423 2.91797 12.0237 2.91797 11.0339L2.91797 3.61087C2.91797 2.62113 3.9894 2.00254 4.84654 2.49741L11.2751 6.20895Z"
                        fill="white"
                      />
                    </svg>
                  )}
                </div>
                <div
                  className="flex-1 h-2 bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden cursor-pointer"
                  onClick={(e) =>
                    handleProgressBarClick(
                      e,
                      originalAudioRef.current,
                      originalDuration,
                    )
                  }
                >
                  <div
                    className="h-full rounded-full transition-all duration-75 ease-out"
                    style={{
                      width: `${originalDuration > 0 ? (originalCurrentTime / originalDuration) * 100 : 0}%`,
                      background:
                        'linear-gradient(90deg, #735DFF 0%, #DAABFF 100%)',
                      transition: 'width 50ms linear',
                    }}
                  />
                </div>
                <span className="text-[rgba(255,255,255,0.60)] min-w-[80px] text-center font-mono">
                  {formatTime(originalCurrentTime)}/
                  {formatTime(originalDuration)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioPlaybackComponent;
