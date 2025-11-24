/**
 * Visual overlay rendering for gesture detection
 * Handles canvas drawing and visual feedback
 */

import { HAND_CONNECTIONS } from '../../constants/hand';

export class OverlayRenderer {
  private overlay: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private overlayWidth = 0;
  private overlayHeight = 0;
  private overlayDpr = 1;

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
  resizeOverlay(videoRect: DOMRect): void {
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
   */
  drawHandLandmarks(landmarks: number[][][], mirrorOverlay: boolean): void {
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

    // Set common styles once
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = 'rgba(0, 255, 180, 0.9)';
    this.ctx.fillStyle = 'rgba(0, 255, 180, 0.9)';

    // Batch drawing operations for better performance
    for (const hand of landmarks) {
      if (!hand || hand.length === 0) continue;

      // Draw connections in batches
      this.drawConnections(hand);

      // Draw points in batches
      this.drawPoints(hand);
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

      const x1 = pa[0] * this.overlayWidth;
      const y1 = pa[1] * this.overlayHeight;
      const x2 = pb[0] * this.overlayWidth;
      const y2 = pb[1] * this.overlayHeight;

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
        lm[0] * this.overlayWidth,
        lm[1] * this.overlayHeight,
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
