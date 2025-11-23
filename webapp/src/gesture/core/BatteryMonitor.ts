// @ts-nocheck
/**
 * Battery monitoring system for emergency mode activation
 * Tracks battery level and triggers emergency protocols when critical
 */

export class BatteryMonitor {
  private batteryLevel = 1.0;
  private isMonitoring = false;
  private emergencyMode = false;
  private lastBatteryCheck = 0;
  private readonly BATTERY_CHECK_INTERVAL = 30000; // Check every 30 seconds
  private readonly EMERGENCY_BATTERY_THRESHOLD = 0.05; // 5% battery triggers emergency mode

  /**
   * Start battery monitoring for emergency mode activation
   */
  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.checkBatteryLevel();

    // Set up periodic battery checks
    setInterval(() => {
      this.checkBatteryLevel();
    }, this.BATTERY_CHECK_INTERVAL);
  }

  /**
   * Check current battery level and activate emergency mode if critical
   */
  private async checkBatteryLevel(): Promise<void> {
    try {
      // Use navigator.getBattery() if available (older API)
      if ('getBattery' in navigator) {
        const battery = await (navigator as any).getBattery();
        this.batteryLevel = battery.level;
        this.handleBatteryLevel(this.batteryLevel);
      } else if ('battery' in navigator) {
        // Fallback for some mobile browsers
        this.batteryLevel = (navigator as any).battery.level;
        this.handleBatteryLevel(this.batteryLevel);
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
   * Handle battery level changes and emergency mode activation
   */
  private handleBatteryLevel(level: number): void {
    const wasEmergency = this.emergencyMode;
    this.emergencyMode = level <= this.EMERGENCY_BATTERY_THRESHOLD;

    if (this.emergencyMode && !wasEmergency) {
      console.warn(`🔋 CRITICAL BATTERY: ${Math.round(level * 100)}% - Activating emergency mode`);
      this.activateEmergencyMode();
    } else if (!this.emergencyMode && wasEmergency) {
      console.log(`🔋 Battery recovered: ${Math.round(level * 100)}% - Deactivating emergency mode`);
      this.deactivateEmergencyMode();
    }
  }

  /**
   * Activate emergency mode for critical battery situations
   */
  private activateEmergencyMode(): void {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'emergency_mode_activated',
          reason: 'critical_battery',
          batteryLevel: this.batteryLevel,
          timestamp: Date.now()
        })
      );
    } catch (error) {
      console.error('Failed to send emergency mode activation:', error);
    }
  }

  /**
   * Deactivate emergency mode when battery recovers
   */
  private deactivateEmergencyMode(): void {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'emergency_mode_deactivated',
          reason: 'battery_recovered',
          batteryLevel: this.batteryLevel,
          timestamp: Date.now()
        })
      );
    } catch (error) {
      console.error('Failed to send emergency mode deactivation:', error);
    }
  }

  /**
   * Get current battery status
   */
  getStatus(): {
    level: number;
    emergencyMode: boolean;
    lastCheck: number;
  } {
    return {
      level: this.batteryLevel,
      emergencyMode: this.emergencyMode,
      lastCheck: this.lastBatteryCheck
    };
  }

  /**
   * Force emergency mode for testing
   */
  forceEmergencyMode(): void {
    this.emergencyMode = true;
    this.activateEmergencyMode();
  }

  /**
   * Reset emergency mode for testing
   */
  resetEmergencyMode(): void {
    this.emergencyMode = false;
    this.deactivateEmergencyMode();
  }

  /**
   * Stop battery monitoring
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
  }

  /**
   * Set emergency battery threshold
   */
  setEmergencyThreshold(threshold: number): void {
    this.emergencyBatteryThreshold = Math.max(0.01, Math.min(0.2, threshold));
  }

  private emergencyBatteryThreshold = this.EMERGENCY_BATTERY_THRESHOLD;
}