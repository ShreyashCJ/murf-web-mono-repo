import { FunctionalComponent } from 'preact';

interface ProcessingStateProps {
  uploadError: string | null;
  handleResetToInitial: () => void;
}

const ProcessingStateComponent: FunctionalComponent<ProcessingStateProps> = ({
  uploadError,
  handleResetToInitial,
}) => {
  return (
    <div className="w-full min-h-screen flex items-center justify-center">
      <div
        className="w-full max-w-[1000px] h-[382px] relative 
                  bg-[rgba(29,17,54,0.40)] backdrop-blur-[20px]
                  border-2 border-[rgba(255,255,255,0.15)] rounded-[24px]
                  flex flex-col items-center justify-center gap-8 p-8"
      >
        {/* Processing Container */}
        <div
          className="w-[290px] sm:w-[600px] h-[140px] p-6 
                    flex flex-col justify-center items-start gap-0
                    rounded-2xl border-2 border-[rgba(255,255,255,0.15)]
                    bg-[rgba(29,17,54,0.40)] backdrop-blur-[20px]"
        >
          <div className="flex flex-col gap-1 self-stretch items-center justify-center w-full">
            <div className="flex gap-10 w-full">
              <span className="text-white font-medium text-xl">Processing</span>
              {/* Loader Circle Animation */}
            </div>
            {/* Indeterminate Progress Bar */}
            <div className="w-full h-[6px] bg-[rgba(255,255,255,0.10)] rounded-full overflow-hidden mt-6 relative">
              <div className="absolute left-0 top-0 h-full rounded-full indeterminate-bar" />
            </div>
            <style>{`
              @keyframes indeterminate-sweep {
                0% { left: -40%; width: 40%; }
                50% { left: 20%; width: 60%; }
                100% { left: 100%; width: 40%; }
              }
              .indeterminate-bar {
                background: linear-gradient(90deg, #735DFF 0%, #DAABFF 100%);
                width: 40%;
                left: -40%;
                animation: indeterminate-sweep 1.2s cubic-bezier(0.4,0,0.2,1) infinite;
              }
            `}</style>
          </div>

          {/* Cancel Button */}
          <div className="flex items-center gap-6 self-stretch mt-4">
            <div className="flex-1" />
            <div
              role="button"
              tabIndex={0}
              onClick={handleResetToInitial}
              className="text-[#FF4E4E] hover:text-[#FF6B6B] transition-colors whitespace-nowrap text-sm cursor-default"
            >
              Cancel
            </div>
          </div>
        </div>

        {/* Email Input Section removed */}

        {uploadError && (
          <div className="text-[#FF4E4E] text-sm mt-2">{uploadError}</div>
        )}
      </div>
    </div>
  );
};

export default ProcessingStateComponent;
