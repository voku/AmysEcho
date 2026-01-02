/**
 * Browser-based MFCC (Mel-Frequency Cepstral Coefficients) extraction
 * Used for real-time audio feature extraction during live gesture recognition
 * 
 * This provides the same 13 MFCC coefficients as the Python/librosa backend,
 * ensuring consistent audio features between training and inference.
 */

export interface MFCCExtractionResult {
  mfcc: Float32Array; // 13 coefficients (time-averaged)
  success: boolean;
  error?: string;
}

export class MFCCExtractor {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private readonly fftSize = 2048;
  private readonly numMelFilters = 40;
  private readonly numMFCCCoeffs = 13;
  private readonly sampleRate = 16000; // Match Python preprocessing
  private melFilterBank: Float32Array[] | null = null;
  private dctMatrix: Float32Array[] | null = null;

  /**
   * Initialize the MFCC extractor with Web Audio API
   */
  async initialize(): Promise<boolean> {
    try {
      // Create AudioContext with target sample rate
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.sampleRate
      });

      // Create analyser node for frequency analysis
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0; // No smoothing for accurate feature extraction

      // Precompute mel filter bank
      this.melFilterBank = this._createMelFilterBank();
      
      // Precompute DCT matrix
      this.dctMatrix = this._createDCTMatrix();

      return true;
    } catch (error) {
      console.error('Failed to initialize MFCC extractor:', error);
      return false;
    }
  }

  /**
   * Connect an audio source (e.g., MediaStream) to the extractor
   */
  connectSource(source: MediaStreamAudioSourceNode): void {
    if (!this.analyser) {
      throw new Error('MFCC extractor not initialized');
    }
    source.connect(this.analyser);
  }

  /**
   * Create and connect a MediaStream source from this extractor's AudioContext
   * This ensures the source is from the same AudioContext as the analyser
   */
  connectMediaStream(stream: MediaStream): MediaStreamAudioSourceNode {
    if (!this.audioContext || !this.analyser) {
      throw new Error('MFCC extractor not initialized');
    }
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.analyser);
    return source;
  }

  /**
   * Extract MFCC features from current audio buffer
   * Returns 13 coefficients averaged over recent audio
   */
  extractMFCC(): MFCCExtractionResult {
    try {
      if (!this.analyser || !this.melFilterBank || !this.dctMatrix) {
        return {
          mfcc: new Float32Array(this.numMFCCCoeffs),
          success: false,
          error: 'Extractor not initialized'
        };
      }

      // Get frequency data from analyser
      const frequencyData = new Float32Array(this.analyser.frequencyBinCount);
      this.analyser.getFloatFrequencyData(frequencyData);

      // Check if audio is present (not silent)
      const hasAudio = frequencyData.some(value => value > -100); // -100 dB threshold
      if (!hasAudio) {
        // Return zeros for silent audio (matches Python behavior)
        return {
          mfcc: new Float32Array(this.numMFCCCoeffs),
          success: true
        };
      }

      // Convert to linear magnitude spectrum
      const magnitudeSpectrum = new Float32Array(frequencyData.length);
      for (let i = 0; i < frequencyData.length; i++) {
        // Convert from dB to linear magnitude
        magnitudeSpectrum[i] = Math.pow(10, frequencyData[i]! / 20);
      }

      // Apply mel filter bank
      const melSpectrum = this._applyMelFilters(magnitudeSpectrum);

      // Convert to log scale (dB)
      for (let i = 0; i < melSpectrum.length; i++) {
        melSpectrum[i] = Math.log(melSpectrum[i]! + 1e-10); // Add epsilon to avoid log(0)
      }

      // Apply DCT to get MFCCs
      const mfcc = this._applyDCT(melSpectrum);

      return {
        mfcc,
        success: true
      };
    } catch (error) {
      console.error('MFCC extraction failed:', error);
      return {
        mfcc: new Float32Array(this.numMFCCCoeffs),
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Create mel-scale filter bank
   * Converts linear frequency bins to mel-scale bins
   */
  private _createMelFilterBank(): Float32Array[] {
    const nyquist = this.sampleRate / 2;
    const numBins = this.fftSize / 2 + 1;

    // Helper: Convert Hz to Mel scale
    const hzToMel = (hz: number): number => {
      return 2595 * Math.log10(1 + hz / 700);
    };

    // Helper: Convert Mel to Hz scale
    const melToHz = (mel: number): number => {
      return 700 * (Math.pow(10, mel / 2595) - 1);
    };

    // Create mel-spaced frequencies
    const minMel = hzToMel(0);
    const maxMel = hzToMel(nyquist);
    const melPoints = new Float32Array(this.numMelFilters + 2);
    for (let i = 0; i < this.numMelFilters + 2; i++) {
      melPoints[i] = minMel + (maxMel - minMel) * i / (this.numMelFilters + 1);
    }

    // Convert mel points to Hz
    const hzPoints = new Float32Array(this.numMelFilters + 2);
    for (let i = 0; i < this.numMelFilters + 2; i++) {
      hzPoints[i] = melToHz(melPoints[i]!);
    }

    // Convert Hz to FFT bin indices
    const binPoints = new Float32Array(this.numMelFilters + 2);
    for (let i = 0; i < this.numMelFilters + 2; i++) {
      binPoints[i] = Math.floor((this.fftSize + 1) * hzPoints[i]! / this.sampleRate);
    }

    // Create triangular filters
    const filterBank: Float32Array[] = [];
    for (let i = 0; i < this.numMelFilters; i++) {
      const filter = new Float32Array(numBins);
      const leftBin = binPoints[i]!;
      const centerBin = binPoints[i + 1]!;
      const rightBin = binPoints[i + 2]!;

      for (let j = Math.floor(leftBin); j < Math.floor(rightBin); j++) {
        if (j < centerBin) {
          // Rising slope
          filter[j] = (j - leftBin) / (centerBin - leftBin);
        } else {
          // Falling slope
          filter[j] = (rightBin - j) / (rightBin - centerBin);
        }
      }
      filterBank.push(filter);
    }

    return filterBank;
  }

  /**
   * Apply mel filters to magnitude spectrum
   */
  private _applyMelFilters(magnitudeSpectrum: Float32Array): Float32Array {
    if (!this.melFilterBank) {
      throw new Error('Mel filter bank not initialized');
    }

    const melSpectrum = new Float32Array(this.numMelFilters);
    for (let i = 0; i < this.numMelFilters; i++) {
      const filter = this.melFilterBank[i]!;
      let sum = 0;
      for (let j = 0; j < filter.length; j++) {
        sum += filter[j]! * magnitudeSpectrum[j]!;
      }
      melSpectrum[i] = sum;
    }
    return melSpectrum;
  }

  /**
   * Create DCT (Discrete Cosine Transform) matrix
   */
  private _createDCTMatrix(): Float32Array[] {
    const matrix: Float32Array[] = [];
    for (let i = 0; i < this.numMFCCCoeffs; i++) {
      const row = new Float32Array(this.numMelFilters);
      for (let j = 0; j < this.numMelFilters; j++) {
        row[j] = Math.cos(Math.PI * i * (j + 0.5) / this.numMelFilters);
      }
      matrix.push(row);
    }
    return matrix;
  }

  /**
   * Apply DCT to mel spectrum to get MFCCs
   */
  private _applyDCT(melSpectrum: Float32Array): Float32Array {
    if (!this.dctMatrix) {
      throw new Error('DCT matrix not initialized');
    }

    const mfcc = new Float32Array(this.numMFCCCoeffs);
    for (let i = 0; i < this.numMFCCCoeffs; i++) {
      const row = this.dctMatrix[i]!;
      let sum = 0;
      for (let j = 0; j < this.numMelFilters; j++) {
        sum += row[j]! * melSpectrum[j]!;
      }
      mfcc[i] = sum;
    }
    return mfcc;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(console.error);
      }
      this.audioContext = null;
    }
    this.analyser = null;
    this.melFilterBank = null;
    this.dctMatrix = null;
  }
}

/**
 * Create and initialize a new MFCC extractor
 */
export async function createMFCCExtractor(): Promise<MFCCExtractor | null> {
  const extractor = new MFCCExtractor();
  const success = await extractor.initialize();
  if (!success) {
    extractor.dispose();
    return null;
  }
  return extractor;
}
