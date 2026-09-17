import { Hands, Results } from '@mediapipe/hands';

export class HandTracker {
  private hands: Hands;
  private results: Results | null = null;
  private isProcessing: boolean = false;
  private isClosed: boolean = false;
  private wasFistClosed: boolean = false; // Must see a closed fist first
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;

  constructor(onResults: (results: Results) => void) {
    const tryLocateFile = (file: string) => {
      // Try multiple CDNs for maximum reliability
      // unpkg, jsdelivr, and gstatic
      const version = '0.4.1675469240';
      return `https://unpkg.com/@mediapipe/hands@${version}/${file}`;
    };

    this.hands = new Hands({
      locateFile: tryLocateFile,
    });

    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });

    this.hands.onResults((results) => {
      this.results = results;
      
      // Update state for gesture detection
      // We only set wasFistClosed to true if we actually see a closed fist
      if (this.isFistClosed()) {
        this.wasFistClosed = true;
      }
      
      onResults(results);
    });

    // Create a small offscreen canvas for resizing input
    if (typeof document !== 'undefined') {
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCanvas.width = 640;
      this.offscreenCanvas.height = 480;
      this.offscreenCtx = this.offscreenCanvas.getContext('2d', { alpha: false, desynchronized: true });
    }
  }

  async send(image: HTMLVideoElement) {
    if (this.isProcessing || this.isClosed || !this.offscreenCanvas || !this.offscreenCtx) return;
    
    // Ensure video is ready and has dimensions
    if (image.readyState < 2 || image.videoWidth === 0 || image.videoHeight === 0) return;

    // Update offscreen canvas size to match aspect ratio if needed
    const targetWidth = 512;
    const aspect = image.videoWidth / image.videoHeight;
    const targetHeight = Math.round(targetWidth / aspect);
    
    if (this.offscreenCanvas.width !== targetWidth || this.offscreenCanvas.height !== targetHeight) {
      this.offscreenCanvas.width = targetWidth;
      this.offscreenCanvas.height = targetHeight;
    }

    this.isProcessing = true;
    try {
      this.offscreenCtx.drawImage(image, 0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
      await this.hands.send({ image: this.offscreenCanvas });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("HandTracker send error:", errorMsg);
      
      // If it's a fetch error, we might want to try re-initializing or just log it
      if (errorMsg.includes("Failed to fetch")) {
        console.warn("HandTracker: Network error detected. Please check your internet connection or if CDNs are blocked.");
      }
      
      // If it's a fatal WASM error, we might want to stop processing
      if (errorMsg.includes("Aborted") || errorMsg.includes("memory access out of bounds")) {
        this.isClosed = true;
        console.warn("HandTracker encountered a fatal error and has been disabled to prevent further crashes.");
      }
    } finally {
      this.isProcessing = false;
    }
  }

  getResults() {
    return this.results;
  }

  isClosedState() {
    return this.isClosed;
  }

  isFistOpening(): boolean {
    const currentOpen = this.isFistOpen();
    if (this.wasFistClosed && currentOpen) {
      this.wasFistClosed = false; // Reset so it only triggers once per open
      return true;
    }
    return false;
  }

  isFistClosed(): boolean {
    if (!this.results?.multiHandLandmarks?.[0]) return false;
    const landmarks = this.results.multiHandLandmarks[0];
    
    // Reference distance: wrist (0) to middle finger base (9)
    const dxRef = landmarks[9].x - landmarks[0].x;
    const dyRef = landmarks[9].y - landmarks[0].y;
    const handScale = Math.sqrt(dxRef * dxRef + dyRef * dyRef);
    
    if (handScale < 0.01) return false;

    const tips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
    const palmBase = landmarks[0];
    
    // A closed fist has finger tips close to the palm base
    const closedFingers = tips.filter(tip => {
      const dx = tip.x - palmBase.x;
      const dy = tip.y - palmBase.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist < handScale * 1.3; // Threshold for "closed"
    }).length;

    return closedFingers >= 3;
  }

  isFistOpen(): boolean {
    if (!this.results?.multiHandLandmarks?.[0]) return false;
    const landmarks = this.results.multiHandLandmarks[0];
    
    // Reference distance: wrist (0) to middle finger base (9)
    const dxRef = landmarks[9].x - landmarks[0].x;
    const dyRef = landmarks[9].y - landmarks[0].y;
    const handScale = Math.sqrt(dxRef * dxRef + dyRef * dyRef);
    
    if (handScale < 0.01) return false; // Hand too small/invalid

    const tips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
    const palmBase = landmarks[0];
    
    // An open hand has finger tips significantly further from the wrist than the finger bases (MCP joints)
    // We check if at least 3 fingers are extended
    const extendedFingers = tips.filter(tip => {
      const dx = tip.x - palmBase.x;
      const dy = tip.y - palmBase.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist > handScale * 2.0; // Increased threshold for "extended"
    }).length;

    return extendedFingers >= 3;
  }

  close() {
    this.isClosed = true;
    this.hands.close();
    this.offscreenCanvas = null;
    this.offscreenCtx = null;
  }
}
