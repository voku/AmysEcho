/**
 * Battery monitoring system for emergency mode activation
 * Tracks battery level and triggers emergency protocols when critical
 */

export class BatteryMonitor {
  private batteryLevel = 1.0;
  private isMonitoring = false;
  private lastBatteryCheck = 0;
  private readonly BATTERY_CHECK_INTERVAL = 30000; // Check every 30 seconds
  private monitorHandle: number | null = null;

  /**
   * Start battery monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.checkBatteryLevel();

    // Set up periodic battery checks
    this.monitorHandle = window.setInterval(() => {
      this.checkBatteryLevel();
    }, this.BATTERY_CHECK_INTERVAL);
  }

  /**
   * Check current battery level
   */
  private async checkBatteryLevel(): Promise<void> {
    try {
      // Use navigator.getBattery() if available (older API)
      if ('getBattery' in navigator) {
        const battery = await (navigator as any).getBattery();
        this.batteryLevel = battery.level;
      } else if ('battery' in navigator) {
        // Fallback for some mobile browsers
        this.batteryLevel = (navigator as any).battery.level;
      } else {
        // Fallback: assume adequate battery if we can't detect
        this.batteryLevel = 0.5;
      }
    } catch (error) {
      console.warn('Battery monitoring failed:', error);
      // Assume adequate battery on monitoring failure
      this.batteryLevel = 0.5;
    }

    this.lastBatteryCheck = Date.now();
  }

  /**
   * Get current battery status
   */
  getStatus(): {
    level: number;
    lastCheck: number;
  } {
    return {
      level: this.batteryLevel,
      lastCheck: this.lastBatteryCheck
    };
  }

  /**
   * Stop battery monitoring
   */
  stopMonitoring(): void {
    if (this.monitorHandle) {
      clearInterval(this.monitorHandle);
      this.monitorHandle = null;
    }
    this.isMonitoring = false;
  }
}