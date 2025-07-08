import { FunctionalComponent } from 'preact';

interface FileUploadAreaProps {
  handleDragOver: (event: DragEvent) => void;
  handleDragLeave: (event: DragEvent) => void;
  handleDrop: (event: DragEvent) => void;
  handleFileSelect: (file: File) => void;
  onRecordAudioClick: () => void;
  isDragging: boolean;
}

const FileUploadAreaComponent: FunctionalComponent<FileUploadAreaProps> = ({
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleFileSelect,
  onRecordAudioClick,
  isDragging,
}) => {
  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`w-full max-w-[1000px] h-[382px] relative  
                bg-[rgba(29,17,54,0.40)] backdrop-blur-[20px]
                border-2 border-[rgba(255,255,255,0.15)] rounded-[24px]
                flex flex-col items-center justify-center
                transition-opacity duration-200
                ${isDragging ? 'opacity-100' : ''}`}
    >
      {/* Overlay for drag state */}
      {isDragging && (
        <div className="absolute inset-0 z-20 bg-white/20 backdrop-blur-[2px] transition-all duration-300 rounded-[24px] pointer-events-none" />
      )}
      {/* Main content with smooth scale on drag */}
      <div
        className={`flex flex-col items-center transition-transform duration-300 ${isDragging ? 'scale-110 z-30' : 'scale-100'} relative`}
      >
        <img
          src="https://murf.ai/public-assets/murf-mono-repo/islands/uploadImg.svg"
          alt="Upload"
          className="mb-2"
        />
        <h2 className="text-white text-xl font-medium mb-1">
          Drop your file here
        </h2>
        <p className="text-[rgba(255,255,255,0.6)] text-sm">
          Supported formats: MP3, WAV, AVI, M4A
        </p>
      </div>

      <div className="flex gap-2 my-6">
        <input
          type="file"
          accept=".mp3,.wav,.avi,.m4a"
          className="hidden"
          onChange={(e) => {
            console.log(
              '[FileUploadAreaComponent] <input onChange> event triggered.',
            );
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            if (file) {
              console.log(
                '[FileUploadAreaComponent] <input onChange> File selected:',
                file.name,
                file.type,
                file.size,
              );
              handleFileSelect(file);
            } else {
              console.log(
                '[FileUploadAreaComponent] <input onChange> No file selected from dialog.',
              );
            }
          }}
          id="file-upload-input" // Changed id to avoid potential conflicts if 'file-upload' is used elsewhere
        />
        <label
          htmlFor="file-upload-input"
          className="flex items-center gap-2 px-5 py-[11px] bg-[rgba(255,255,255,0.1)] 
                   rounded-[11px] text-white hover:bg-[rgba(255,255,255,0.15)] transition-colors cursor-pointer"
        >
          <img
            src="https://murf.ai/public-assets/murf-mono-repo/islands/browseImg.svg"
            alt="Browse"
            className="w-4 h-4"
          />
          Upload Files
        </label>

        <div
          role="button"
          tabIndex={0}
          onClick={onRecordAudioClick}
          className="flex items-center gap-2 px-5 py-[11px] bg-[rgba(255,255,255,0.1)] 
                   rounded-[11px] text-white hover:bg-[rgba(255,255,255,0.15)] transition-colors cursor-pointer"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFE3E9"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
          Record Audio
        </div>
      </div>
      {/* Max audio duration paragraph */}
      <p className="text-[rgba(255,255,255,0.5)] text-sm flex items-center gap-1.5">
        <img
          src="https://murf.ai/public-assets/murf-mono-repo/islands/info.svg"
          alt="Info"
          className="w-4 h-4"
        />
        Max audio duration is 1 minute
      </p>
    </div>
  );
};

export default FileUploadAreaComponent;
