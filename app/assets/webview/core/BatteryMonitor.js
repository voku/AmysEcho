/**
 * Battery monitoring system for emergency mode activation
 * Tracks battery level and triggers emergency protocols when critical
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class BatteryMonitor {
    constructor() {
        this.batteryLevel = 1.0;
        this.isMonitoring = false;
        this.emergencyMode = false;
        this.lastBatteryCheck = 0;
        this.BATTERY_CHECK_INTERVAL = 30000; // Check every 30 seconds
        this.EMERGENCY_BATTERY_THRESHOLD = 0.05; // 5% battery triggers emergency mode
        this.emergencyBatteryThreshold = this.EMERGENCY_BATTERY_THRESHOLD;
    }
    /**
     * Start battery monitoring for emergency mode activation
     */
    startMonitoring() {
        if (this.isMonitoring)
            return;
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
    checkBatteryLevel() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Use navigator.getBattery() if available (older API)
                if ('getBattery' in navigator) {
                    const battery = yield navigator.getBattery();
                    this.batteryLevel = battery.level;
                    this.handleBatteryLevel(this.batteryLevel);
                }
                else if ('battery' in navigator) {
                    // Fallback for some mobile browsers
                    this.batteryLevel = navigator.battery.level;
                    this.handleBatteryLevel(this.batteryLevel);
                }
                else {
                    // Fallback: assume adequate battery if we can't detect
                    this.batteryLevel = 0.5;
                }
            }
            catch (error) {
                console.warn('Battery monitoring failed:', error);
                // Assume adequate battery on monitoring failure
                this.batteryLevel = 0.5;
            }
            this.lastBatteryCheck = Date.now();
        });
    }
    /**
     * Handle battery level changes and emergency mode activation
     */
    handleBatteryLevel(level) {
        const wasEmergency = this.emergencyMode;
        this.emergencyMode = level <= this.EMERGENCY_BATTERY_THRESHOLD;
        if (this.emergencyMode && !wasEmergency) {
            console.warn(`🔋 CRITICAL BATTERY: ${Math.round(level * 100)}% - Activating emergency mode`);
            this.activateEmergencyMode();
        }
        else if (!this.emergencyMode && wasEmergency) {
            console.log(`🔋 Battery recovered: ${Math.round(level * 100)}% - Deactivating emergency mode`);
            this.deactivateEmergencyMode();
        }
    }
    /**
     * Activate emergency mode for critical battery situations
     */
    activateEmergencyMode() {
        var _a, _b;
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                type: 'emergency_mode_activated',
                reason: 'critical_battery',
                batteryLevel: this.batteryLevel,
                timestamp: Date.now()
            }));
        }
        catch (error) {
            console.error('Failed to send emergency mode activation:', error);
        }
    }
    /**
     * Deactivate emergency mode when battery recovers
     */
    deactivateEmergencyMode() {
        var _a, _b;
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                type: 'emergency_mode_deactivated',
                reason: 'battery_recovered',
                batteryLevel: this.batteryLevel,
                timestamp: Date.now()
            }));
        }
        catch (error) {
            console.error('Failed to send emergency mode deactivation:', error);
        }
    }
    /**
     * Get current battery status
     */
    getStatus() {
        return {
            level: this.batteryLevel,
            emergencyMode: this.emergencyMode,
            lastCheck: this.lastBatteryCheck
        };
    }
    /**
     * Force emergency mode for testing
     */
    forceEmergencyMode() {
        this.emergencyMode = true;
        this.activateEmergencyMode();
    }
    /**
     * Reset emergency mode for testing
     */
    resetEmergencyMode() {
        this.emergencyMode = false;
        this.deactivateEmergencyMode();
    }
    /**
     * Stop battery monitoring
     */
    stopMonitoring() {
        this.isMonitoring = false;
    }
    /**
     * Set emergency battery threshold
     */
    setEmergencyThreshold(threshold) {
        this.emergencyBatteryThreshold = Math.max(0.01, Math.min(0.2, threshold));
    }
}
