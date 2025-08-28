export interface PracticeSchedule {
  id: string;
  gestureId: string;
  hour: number; // 0-23
  minute: number; // 0-59
  daysOfWeek?: number[]; // 0(Sun)..6(Sat), optional for everyday
  enabled: boolean;
}