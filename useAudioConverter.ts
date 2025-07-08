import { useState, useCallback, useRef } from 'preact/hooks';

interface UseAudioConverterResult {
  convertBlobToWav: (blob: Blob, fileName: string) => Promise<File | null>;
  isConverting: boolean;
  conversionError: string | null;
}

const useAudioConverter = (): UseAudioConverterResult => {
  const [isConverting, setIsConverting] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const convertBlobToWav = useCallback(
    async (blob: Blob, fileName: string): Promise<File | null> => {
      setIsConverting(true);
      setConversionError(null);

      try {
        if (blob.type === 'audio/wav') {
          console.log(
            '[useAudioConverter] Blob is already WAV, no conversion needed.',
          );
          return new File([blob], fileName, {
            type: 'audio/wav',
            lastModified: Date.now(),
          });
        }

        console.log(`[useAudioConverter] Converting ${blob.type} to WAV...`);
        const arrayBuffer = await blob.arrayBuffer();
        const audioContext = getAudioContext();

        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const numOfChan = audioBuffer.numberOfChannels;
        const rate = audioBuffer.sampleRate;
        const len = audioBuffer.length * numOfChan * 2 + 44; // 2 bytes per sample, + 44 for WAV header
        const buffer = new ArrayBuffer(len);
        const view = new DataView(buffer);

        const writeString = (
          view: DataView,
          offset: number,
          string: string,
        ) => {
          for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
          }
        };

        let offset = 0;
        /* RIFF identifier */
        writeString(view, offset, 'RIFF');
        offset += 4;
        /* file length */
        view.setUint32(offset, len - 8, true);
        offset += 4;
        /* RIFF type */
        writeString(view, offset, 'WAVE');
        offset += 4;
        /* format chunk identifier */
        writeString(view, offset, 'fmt ');
        offset += 4;
        /* format chunk length */
        view.setUint32(offset, 16, true);
        offset += 4;
        /* sample format (raw) */
        view.setUint16(offset, 1, true);
        offset += 2;
        /* channel count */
        view.setUint16(offset, numOfChan, true);
        offset += 2;
        /* sample rate */
        view.setUint32(offset, rate, true);
        offset += 4;
        /* byte rate (sample rate * block align) */
        view.setUint32(offset, rate * numOfChan * 2, true);
        offset += 4;
        /* block align (channels * bytes per sample) */
        view.setUint16(offset, numOfChan * 2, true);
        offset += 2;
        /* bits per sample */
        view.setUint16(offset, 16, true);
        offset += 2;
        /* data chunk identifier */
        writeString(view, offset, 'data');
        offset += 4;
        /* data chunk length */
        view.setUint32(offset, len - offset - 4, true);
        offset += 4;

        // Write PCM data
        const floatTo16BitPCM = (
          output: DataView,
          offset: number,
          input: Float32Array,
        ) => {
          for (let i = 0; i < input.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
          }
        };

        for (let i = 0; i < numOfChan; i++) {
          floatTo16BitPCM(
            view,
            44 + i * (audioBuffer.length * 2),
            audioBuffer.getChannelData(i),
          );
        }

        // If stereo, interleave samples (this basic WAV writer assumes interleaved for multiple channels)
        // The current loop writes channels sequentially, which is not interleaved.
        // Need to adjust for interleaved stereo output if numOfChan > 1.
        // For now, assume mono or handle basic non-interleaved (which might not play correctly in some players for stereo)
        // A more robust solution would involve explicit interleaving:
        const pcm16 = new Int16Array(audioBuffer.length * numOfChan);
        for (let i = 0; i < audioBuffer.length; i++) {
          for (let channel = 0; channel < numOfChan; channel++) {
            const s = Math.max(
              -1,
              Math.min(1, audioBuffer.getChannelData(channel)[i]),
            );
            pcm16[i * numOfChan + channel] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
        }

        // Write interleaved PCM data
        let dataOffset = 44;
        for (let i = 0; i < pcm16.length; i++) {
          view.setInt16(dataOffset, pcm16[i], true);
          dataOffset += 2;
        }

        const wavBlob = new Blob([view], { type: 'audio/wav' });
        console.log(
          '[useAudioConverter] Conversion complete. New WAV blob:',
          wavBlob,
        );
        return new File([wavBlob], fileName.replace(/\.[^.\/]+$/, '.wav'), {
          type: 'audio/wav',
          lastModified: Date.now(),
        });
      } catch (error) {
        console.error('[useAudioConverter] Error during conversion:', error);
        setConversionError(
          `Failed to convert audio: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      } finally {
        setIsConverting(false);
      }
    },
    [getAudioContext],
  );

  return { convertBlobToWav, isConverting, conversionError };
};

export default useAudioConverter;
