/**
 * Visual overlay rendering for gesture detection
 * Handles canvas drawing and visual feedback
 */

import { HAND_CONNECTIONS } from '../../constants/hand';

const POSE_CONNECTIONS: Array<[number, number]> = [
  [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 12], [23, 24], [11, 23], [12, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
];

const FACE_MESH_LITE_POINTS = [
  33, 133, // eyes
  362, 263,
  1, // nose tip
  13, 14, // lips
  61, 291, // mouth corners
];

// Primary hand indicator positioning (offset from wrist landmark)
const PRIMARY_INDICATOR_OFFSET_X = -20;
const PRIMARY_INDICATOR_OFFSET_Y = -20;
const PRIMARY_INDICATOR_RADIUS = 12;

export class OverlayRenderer {
  private overlay: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private overlayWidth = 0;
  private overlayHeight = 0;
  private overlayDpr = 1;
  private drawWidth = 0;
  private drawHeight = 0;
  private drawOffsetX = 0;
  private drawOffsetY = 0;

  constructor(overlay: HTMLCanvasElement) {
    this.overlay = overlay;
    try {
      this.ctx = overlay.getContext('2d');
    } catch (e) {
      // In test environments (jsdom), canvas context may be unavailable
      this.ctx = null;
      try {
        console.error(e);
      } catch {}
    }
  }

  /**
   * Resize overlay to match video dimensions
   */
  resizeOverlay(videoRect: DOMRect, videoDimensions?: { width: number; height: number }): void {
    const w = (videoRect.width || 0) | 0;
    const h = (videoRect.height || 0) | 0;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const sizeChanged = this.overlayWidth !== w || this.overlayHeight !== h;
    const dprChanged = dpr !== this.overlayDpr;

    if (sizeChanged || dprChanged) {
      if (sizeChanged) {
        this.overlay.style.width = w + 'px';
        this.overlay.style.height = h + 'px';
      }
      this.overlay.width = Math.round(w * dpr);
      this.overlay.height = Math.round(h * dpr);
      this.overlayWidth = w;
      this.overlayHeight = h;
      this.overlayDpr = dpr;
    }

    const intrinsicWidth = videoDimensions?.width ?? w;
    const intrinsicHeight = videoDimensions?.height ?? h;

    if (intrinsicWidth > 0 && intrinsicHeight > 0 && w > 0 && h > 0) {
      const scale = Math.max(w / intrinsicWidth, h / intrinsicHeight);
      this.drawWidth = intrinsicWidth * scale;
      this.drawHeight = intrinsicHeight * scale;
      this.drawOffsetX = (w - this.drawWidth) / 2;
      this.drawOffsetY = (h - this.drawHeight) / 2;
    } else {
      this.drawWidth = w;
      this.drawHeight = h;
      this.drawOffsetX = 0;
      this.drawOffsetY = 0;
    }
  }

  /**
   * Clear the overlay
   */
  clear(): void {
    if (this.ctx && this.overlayWidth && this.overlayHeight) {
      this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    }
  }

  /**
   * Draw hand landmarks and connections with performance optimizations
   * @param landmarks Array of hand landmarks
   * @param mirrorOverlay Whether to mirror the overlay horizontally
   * @param handedness Optional array of handedness labels ('Left', 'Right')
   * @param handFocus Optional hand focus setting
   */
  drawHandLandmarks(
    landmarks: number[][][],
    mirrorOverlay: boolean,
    handedness?: ReadonlyArray<string>,
    handFocus?: 'dominant_only' | 'both_equal' | 'both_asymmetric' | 'either_hand',
  ): void {
    if (!this.ctx || !this.overlayWidth || !this.overlayHeight) return;

    this.ctx.save();

    // Draw in CSS pixels while canvas is scaled for HiDPI
    this.ctx.scale(this.overlayDpr, this.overlayDpr);

    // Mirror horizontally if needed. The translation must remain in CSS pixels,
    // so apply it using the visual overlay width before flipping the context.
    if (mirrorOverlay) {
      this.ctx.translate(this.overlayWidth, 0);
      this.ctx.scale(-1, 1);
    }

    // Batch drawing operations for better performance
    for (let i = 0; i < landmarks.length; i++) {
      const hand = landmarks[i];
      if (!hand || hand.length === 0) continue;

      // Determine if this hand is the "primary" (focused) hand
      const handLabel = handedness?.[i];
      const isPrimary = this.isHandPrimary(handLabel, handFocus, handedness);
      const isDimmed = this.isHandDimmed(handLabel, handFocus, handedness);

      // Set styles based on whether hand is primary
      if (isPrimary) {
        // Primary hand: bright cyan with glow effect
        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = 'rgba(0, 255, 220, 1.0)';
        this.ctx.fillStyle = 'rgba(0, 255, 220, 1.0)';
      } else if (isDimmed) {
        // Dimmed hand: reduced opacity to indicate it's not important
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = 'rgba(150, 150, 150, 0.5)';
        this.ctx.fillStyle = 'rgba(150, 150, 150, 0.5)';
      } else {
        // Default styles when no hand focus is set
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = 'rgba(0, 255, 180, 0.9)';
        this.ctx.fillStyle = 'rgba(0, 255, 180, 0.9)';
      }

      // Draw connections in batches
      this.drawConnections(hand);

      // Draw points in batches
      this.drawPoints(hand);

      // Draw primary hand indicator
      if (isPrimary && hand.length > 0) {
        this.drawPrimaryHandIndicator(hand);
      }
    }

    this.ctx.restore();
  }

  /**
   * Check if a hand should be highlighted as primary based on hand focus
   */
  private isHandPrimary(
    handLabel: string | undefined,
    handFocus?: 'dominant_only' | 'both_equal' | 'both_asymmetric' | 'either_hand',
    allHandedness?: ReadonlyArray<string>,
  ): boolean {
    // No focus or equal focus means no primary highlighting
    if (!handFocus || handFocus === 'both_equal' || handFocus === 'either_hand') {
      return false;
    }
    if (!handLabel) return false;
    
    const normalizedLabel = handLabel.toLowerCase();
    
    // For dominant_only and both_asymmetric, determine dominant hand
    // Default to right hand being dominant, unless only left is detected
    if (handFocus === 'dominant_only' || handFocus === 'both_asymmetric') {
      const hasRight = allHandedness?.some(h => /right/i.test(h)) ?? false;
      const hasLeft = allHandedness?.some(h => /left/i.test(h)) ?? false;
      
      // Determine dominant: right if present, else left
      const dominantIsRight = hasRight || !hasLeft;
      
      // Primary hand is the dominant one
      if (dominantIsRight) {
        return normalizedLabel === 'right';
      } else {
        return normalizedLabel === 'left';
      }
    }
    
    return false;
  }

  /**
   * Check if a hand should be dimmed (not important) based on hand focus
   */
  private isHandDimmed(
    handLabel: string | undefined,
    handFocus?: 'dominant_only' | 'both_equal' | 'both_asymmetric' | 'either_hand',
    allHandedness?: ReadonlyArray<string>,
  ): boolean {
    // No focus or equal focus means no dimming
    if (!handFocus || handFocus === 'both_equal' || handFocus === 'either_hand') {
      return false;
    }
    if (!handLabel) return false;
    
    const normalizedLabel = handLabel.toLowerCase();
    
    // For dominant_only and both_asymmetric, dim the non-dominant hand
    if (handFocus === 'dominant_only' || handFocus === 'both_asymmetric') {
      const hasRight = allHandedness?.some(h => /right/i.test(h)) ?? false;
      const hasLeft = allHandedness?.some(h => /left/i.test(h)) ?? false;
      
      // Determine dominant: right if present, else left
      const dominantIsRight = hasRight || !hasLeft;
      
      // Dimmed hand is the non-dominant one
      if (dominantIsRight) {
        return normalizedLabel === 'left';
      } else {
        return normalizedLabel === 'right';
      }
    }
    
    return false;
  }

  /**
   * Draw a visual indicator for the primary hand (small star/marker at wrist)
   */
  private drawPrimaryHandIndicator(hand: number[][]): void {
    if (!this.ctx || hand.length === 0) return;

    // Use wrist position (landmark 0) for the indicator
    const wrist = hand[0];
    if (!wrist || wrist[0] === undefined || wrist[1] === undefined) return;

    const x = this.drawOffsetX + wrist[0] * this.drawWidth;
    const y = this.drawOffsetY + wrist[1] * this.drawHeight;

    // Draw a small star/highlight near the wrist
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(255, 215, 0, 0.9)'; // Gold color
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    this.ctx.lineWidth = 2;

    // Draw a small circle with "★" symbol
    const indicatorX = x + PRIMARY_INDICATOR_OFFSET_X;
    const indicatorY = y + PRIMARY_INDICATOR_OFFSET_Y;
    this.ctx.beginPath();
    this.ctx.arc(indicatorX, indicatorY, PRIMARY_INDICATOR_RADIUS, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();

    // Draw star symbol (slightly offset for visual centering)
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.ctx.font = 'bold 14px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('★', indicatorX, indicatorY + 1);

    this.ctx.restore();
  }

  drawPoseLandmarks(poseLandmarks: number[][], mirrorOverlay: boolean): void {
    if (!this.ctx || !this.overlayWidth || !this.overlayHeight || poseLandmarks.length === 0) return;

    this.ctx.save();
    this.ctx.scale(this.overlayDpr, this.overlayDpr);

    if (mirrorOverlay) {
      this.ctx.translate(this.overlayWidth, 0);
      this.ctx.scale(-1, 1);
    }

    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = 'rgba(86, 166, 255, 0.9)';
    this.ctx.fillStyle = 'rgba(86, 166, 255, 0.9)';

    this.ctx.beginPath();
    for (const [a, b] of POSE_CONNECTIONS) {
      const pa = poseLandmarks[a];
      const pb = poseLandmarks[b];
      if (!pa || !pb || pa[0] === undefined || pa[1] === undefined || pb[0] === undefined || pb[1] === undefined) continue;

      this.ctx.moveTo(
        this.drawOffsetX + pa[0] * this.drawWidth,
        this.drawOffsetY + pa[1] * this.drawHeight,
      );
      this.ctx.lineTo(
        this.drawOffsetX + pb[0] * this.drawWidth,
        this.drawOffsetY + pb[1] * this.drawHeight,
      );
    }
    this.ctx.stroke();

    for (const lm of poseLandmarks) {
      if (!lm || lm[0] === undefined || lm[1] === undefined) continue;
      this.ctx.beginPath();
      this.ctx.arc(
        this.drawOffsetX + lm[0] * this.drawWidth,
        this.drawOffsetY + lm[1] * this.drawHeight,
        3,
        0,
        Math.PI * 2,
      );
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  drawFaceLandmarks(faceLandmarks: number[][], mirrorOverlay: boolean): void {
    if (!this.ctx || !this.overlayWidth || !this.overlayHeight || faceLandmarks.length === 0) return;

    this.ctx.save();
    this.ctx.scale(this.overlayDpr, this.overlayDpr);

    if (mirrorOverlay) {
      this.ctx.translate(this.overlayWidth, 0);
      this.ctx.scale(-1, 1);
    }

    this.ctx.fillStyle = 'rgba(255, 210, 86, 0.9)';

    const indices = FACE_MESH_LITE_POINTS.filter((index) => index < faceLandmarks.length);
    for (const idx of indices) {
      const lm = faceLandmarks[idx];
      if (!lm || lm[0] === undefined || lm[1] === undefined) continue;
      this.ctx.beginPath();
      this.ctx.arc(
        this.drawOffsetX + lm[0] * this.drawWidth,
        this.drawOffsetY + lm[1] * this.drawHeight,
        3,
        0,
        Math.PI * 2,
      );
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  /**
   * Draw hand connections efficiently
   */
  private drawConnections(hand: number[][]): void {
    if (!this.ctx) return;

    this.ctx.beginPath();
    let hasMoves = false;

    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = hand[a];
      const pb = hand[b];
      if (!pa || !pb || pa[0] === undefined || pa[1] === undefined || 
          pb[0] === undefined || pb[1] === undefined) continue;

      const x1 = this.drawOffsetX + pa[0] * this.drawWidth;
      const y1 = this.drawOffsetY + pa[1] * this.drawHeight;
      const x2 = this.drawOffsetX + pb[0] * this.drawWidth;
      const y2 = this.drawOffsetY + pb[1] * this.drawHeight;

      if (!hasMoves) {
        this.ctx.moveTo(x1, y1);
        hasMoves = true;
      } else {
        this.ctx.moveTo(x1, y1);
      }
      this.ctx.lineTo(x2, y2);
    }

    if (hasMoves) {
      this.ctx.stroke();
    }
  }

  /**
   * Draw landmark points efficiently
   */
  private drawPoints(hand: number[][]): void {
    if (!this.ctx) return;

    for (const lm of hand) {
      if (!lm || lm.length < 2 || lm[0] === undefined || lm[1] === undefined) continue;

      this.ctx.beginPath();
      this.ctx.arc(
        this.drawOffsetX + lm[0] * this.drawWidth,
        this.drawOffsetY + lm[1] * this.drawHeight,
        4, 0, Math.PI * 2
      );
      this.ctx.fill();
    }
  }

  /**
   * Draw stability guide circle
   */
  drawStabilityGuide(_isStable: boolean, stabilityScore: number): void {
    if (!this.ctx || !this.overlayWidth || !this.overlayHeight) return;

    this.ctx.save();
    this.ctx.scale(this.overlayDpr, this.overlayDpr);

    const centerX = this.overlayWidth / 2;
    const centerY = this.overlayHeight / 2;
    const radius = Math.min(this.overlayWidth, this.overlayHeight) * 0.15;

    this.ctx.strokeStyle = stabilityScore > 0.3 ? 'rgba(255, 165, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)';
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([10, 5]);
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Draw crosshairs
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - radius * 0.7, centerY);
    this.ctx.lineTo(centerX + radius * 0.7, centerY);
    this.ctx.moveTo(centerX, centerY - radius * 0.7);
    this.ctx.lineTo(centerX, centerY + radius * 0.7);
    this.ctx.stroke();

    this.ctx.restore();
  }

  /**
   * Get overlay dimensions
   */
  getDimensions(): { width: number; height: number; dpr: number } {
    return {
      width: this.overlayWidth,
      height: this.overlayHeight,
      dpr: this.overlayDpr
    };
  }
}
