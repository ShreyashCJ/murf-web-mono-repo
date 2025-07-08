import { FunctionalComponent } from 'preact';

interface UploadingStateProps {
  selectedFile: File | null;
  progress: number;
  uploadError: string | null;
  handleCancelUpload: () => void;
}

const UploadingStateComponent: FunctionalComponent<UploadingStateProps> = ({
  selectedFile,
  progress,
  uploadError,
  handleCancelUpload,
}: UploadingStateProps) => {
  return (
    <div className="w-full min-h-screen flex items-center justify-center">
      <div
        className="w-full max-w-[1000px] h-[382px] relative 
                bg-[rgba(29,17,54,0.40)] backdrop-blur-[20px]
                border-2 border-[rgba(255,255,255,0.15)] rounded-[24px]
                flex items-center justify-center"
      >
        <div
          className="w-[290px] sm:w-[600px] h-[140px] p-6 
                  flex flex-col justify-center items-start gap-2
                  rounded-2xl border-2 border-[rgba(255,255,255,0.15)]
                  bg-[rgba(29,17,54,0.40)] backdrop-blur-[20px]"
        >
          <div className="flex flex-col gap-1 self-stretch">
            <span className="text-white font-medium">Uploading file</span>
            <span className="text-[rgba(255,255,255,0.65)]">
              {selectedFile?.name}
            </span>
          </div>

          <div className="flex items-center gap-6 self-stretch">
            <div className="flex-1">
              <div className="w-full h-[6px] bg-[rgba(255,255,255,0.10)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(to right, #735DFF, #DAABFF)',
                  }}
                />
              </div>
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={handleCancelUpload}
              className="text-[#FF4E4E] hover:text-[#FF6B6B] transition-colors whitespace-nowrap cursor-default"
            >
              Cancel
            </div>
          </div>

          {uploadError && (
            <div className="text-[#FF4E4E] text-sm mt-2">{uploadError}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UploadingStateComponent;
