import { FunctionalComponent } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';

// Assuming Voice and Language interfaces are defined elsewhere and imported
// For now, defining them inline for clarity, but they should be shared
interface Voice {
  id: number;
  apiName: string;
  name: string;
  description: string;
  age: string;
  previewUrl?: string;
  rawVoiceId: string;
}

interface Language {
  id: string;
  name: string;
  flag: string;
}

interface VoiceSelectionComponentProps {
  selectedFile: File | null;
  voices: Voice[];
  selectedVoice: string | null;
  isVoicesLoading: boolean;
  availableLanguages: Language[];
  selectedLanguage: Language;
  isLanguageDropdownOpen: boolean;
  handleVoiceSelect: (voice: Voice) => void;
  handleStartVoiceChange: () => void;
  setIsLanguageDropdownOpen: (isOpen: boolean) => void;
  setSelectedLanguage: (language: Language) => void;
  setSelectedVoice: (voiceApiName: string | null) => void;
}

const VoiceSelectionComponent: FunctionalComponent<
  VoiceSelectionComponentProps
> = (props) => {
  const {
    voices,
    selectedVoice,
    isVoicesLoading,
    availableLanguages,
    selectedLanguage,
    isLanguageDropdownOpen,
    handleVoiceSelect,
    handleStartVoiceChange,
    setIsLanguageDropdownOpen,
    setSelectedLanguage,
    setSelectedVoice,
  } = props;

  // Track if the main container is hovered
  const [isContainerHovered, setIsContainerHovered] = useState(false);

  // Always show overlay and play button on mobile/tablet (below lg)
  const isMobileOrTablet =
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 1023px)').matches;

  // On mount, set isContainerHovered to true for mobile/tablet
  // and keep hover logic for desktop
  // This effect will run only once on mount
  useEffect(() => {
    if (isMobileOrTablet) {
      setIsContainerHovered(true);
    }
  }, [isMobileOrTablet]);

  // Local state for sample voice playback
  const [playingSample, setPlayingSample] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Wrap handleStartVoiceChange to pause sample audio if playing
  const handleStartVoiceChangeWithPause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingSample(null);
    }
    handleStartVoiceChange();
  };

  const handlePlayVoice = (voice: Voice) => {
    // If clicking the voice that is currently playing, stop it.
    if (audioRef.current && playingSample === voice.apiName) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingSample(null);
      return;
    }

    // If a different voice was playing, stop it before starting the new one.
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setSelectedVoice(voice.apiName);

    const audioElement = new Audio(
      `https://murf.ai/public-assets/voice/${voice.name}.mp3`,
    );
    audioRef.current = audioElement;
    setPlayingSample(voice.apiName);

    audioElement.play().catch(() => {
      // Optionally show a toast if you want
      setPlayingSample(null);
      audioRef.current = null;
    });

    audioElement.onended = () => {
      setPlayingSample(null);
      audioRef.current = null;
    };
  };

  return (
    <div className="w-full min-h-screen flex items-center justify-center relative">
      <div
        className="w-full max-w-[1000px] h-[382px] relative 
                  bg-[rgba(29,17,54,0.40)] backdrop-blur-[20px]
                  border-2 border-[rgba(255,255,255,0.15)] rounded-[24px]
                  flex flex-col items-center px-4 sm:px-6 lg:px-12 py-6"
        onMouseEnter={() => {
          if (!isMobileOrTablet) setIsContainerHovered(true);
        }}
        onMouseLeave={() => {
          if (!isMobileOrTablet) setIsContainerHovered(false);
        }}
      >
        <div className="w-full max-w-[360px] mb-4 text-center">
          <h2 className="text-white text-xl font-medium mb-2">
            Select Language
          </h2>
          <div className="relative language-dropdown-container">
            <button
              className="w-full flex items-center justify-between px-4 py-3 
                       bg-[rgba(255,255,255,0.1)] rounded-[11px] text-white"
              onClick={() => setIsLanguageDropdownOpen(!isLanguageDropdownOpen)}
            >
              <div className="flex items-center gap-2">
                <img
                  src={selectedLanguage.flag}
                  alt={selectedLanguage.name}
                  className="w-6 h-6"
                />
                <span>{selectedLanguage.name}</span>
              </div>
              <svg
                className={`w-5 h-5 transition-transform ${isLanguageDropdownOpen ? 'rotate-180' : ''}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {isLanguageDropdownOpen && (
              <div
                className="absolute w-full mt-2 bg-[rgba(29,17,54,0.95)] border border-white/15 rounded-[11px] py-2 z-[100]
                         shadow-lg backdrop-blur-lg"
              >
                {availableLanguages.map((language) => (
                  <div
                    key={language.id}
                    className={`w-full flex items-center gap-2 px-4 py-2 hover:bg-white/10 text-white text-left transition-colors cursor-pointer
                              ${
                                selectedLanguage.id === language.id
                                  ? 'bg-white/10'
                                  : ''
                              }`}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedLanguage(language);
                      setIsLanguageDropdownOpen(false);
                      setSelectedVoice(null); // Reset selected voice when language changes
                      if (audioRef.current) {
                        audioRef.current.pause();
                        audioRef.current = null;
                        setPlayingSample(null);
                      }
                    }}
                  >
                    <img
                      src={language.flag}
                      alt={language.name}
                      className="w-6 h-6"
                    />
                    {language.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="w-full flex-1 overflow-hidden">
          <h2 className="text-white text-xl font-medium mb-2 text-center">
            Source a Voice
          </h2>
          {isVoicesLoading ? (
            <div className="text-white text-center">Loading voices...</div>
          ) : voices.length === 0 ? (
            <div className="text-white text-center">
              No voices available for this language
            </div>
          ) : (
            <div className="w-full overflow-x-scroll no-scrollbar">
              <div className="flex gap-2 px-12">
                {voices.map((voice) => (
                  <div
                    key={voice.apiName}
                    onClick={() => handleVoiceSelect(voice)}
                    className={`relative flex-shrink-0 w-[104px] p-1 transition-all cursor-pointer rounded-[8px]
                               ${
                                 selectedVoice === voice.apiName
                                   ? 'bg-[rgba(255,255,255,0.14)]'
                                   : 'hover:bg-[rgba(255,255,255,0.02)]'
                               }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <div className="relative">
                        <div className="w-20 h-20 rounded-full overflow-hidden bg-[rgba(255,255,255,0.1)] relative">
                          <img
                            src={`https://murf.ai/public-assets/home/avatars/${voice.name}.jpg`}
                            alt={voice.name}
                            className="w-full h-full object-cover"
                          />
                          {/* Overlay and play button only when container is hovered */}
                          <div
                            className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${isContainerHovered ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                          />
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlayVoice(voice);
                            }}
                            className={`absolute inset-0 flex items-center justify-center z-10 transition-opacity duration-200 ${isContainerHovered ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                          >
                            {playingSample === voice.apiName ? (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="22"
                                height="22"
                                viewBox="0 0 22 22"
                                fill="none"
                              >
                                <path
                                  d="M6.15993 3.38184C4.88074 3.38184 3.84375 4.41882 3.84375 5.69801V16.948C3.84375 18.2272 4.88074 19.2642 6.15993 19.2642C7.43912 19.2642 8.4761 18.2272 8.4761 16.948V5.69801C8.4761 4.41882 7.43912 3.38184 6.15993 3.38184Z"
                                  fill="white"
                                />
                                <path
                                  d="M16.0864 3.38184C14.8072 3.38184 13.7702 4.41882 13.7702 5.69801V16.948C13.7702 18.2272 14.8072 19.2642 16.0864 19.2642C17.3656 19.2642 18.4026 18.2272 18.4026 16.948V5.69801C18.4026 4.41882 17.3656 3.38184 16.0864 3.38184Z"
                                  fill="white"
                                />
                              </svg>
                            ) : (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="22"
                                height="22"
                                viewBox="0 0 22 22"
                                fill="none"
                              >
                                <path
                                  d="M17.4103 9.60351C18.7338 10.3676 18.7338 12.278 17.4103 13.0421L7.4838 18.7732C6.16027 19.5373 4.50586 18.5822 4.50586 17.0539L4.50586 5.59177C4.50586 4.06349 6.16027 3.10832 7.4838 3.87246L17.4103 9.60351Z"
                                  fill="white"
                                />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-white font-medium text-sm">
                          {voice.name}
                        </span>
                        <span className="text-white/60 text-xs">
                          {voice.age}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div
          onClick={
            selectedVoice && !isVoicesLoading && voices.length > 0
              ? handleStartVoiceChangeWithPause
              : undefined
          }
          role="button"
          tabIndex={0}
          aria-disabled={
            !selectedVoice || isVoicesLoading || voices.length === 0
          }
          className={`mt-4 px-5 py-[11px] rounded-[11px] text-white font-medium
            ${
              selectedVoice && !isVoicesLoading && voices.length > 0
                ? 'cursor-default bg-gradient-to-r from-[#FC6337] to-[#C516E1] hover:opacity-90'
                : 'cursor-not-allowed bg-white/10'
            }`}
        >
          Start Changing Voice
        </div>
      </div>
    </div>
  );
};

export default VoiceSelectionComponent;
