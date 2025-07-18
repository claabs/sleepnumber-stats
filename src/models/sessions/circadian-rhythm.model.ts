export interface CircadianRhythmParams {
  accountId: string;
  sleeperId: string;
  date: string;
}

export interface CircadianRhythmResponse {
  circadianRhythm: CircadianRhythm[];
  sleeperId: string;
}

export interface CircadianRhythmEntity {
  circadianRhythm: CircadianRhythm;
  sleeperId: string;
}

export interface CircadianRhythm {
  date: string;
  idealBedTime?: Schedule;
  idealWakeTime?: Schedule;
  optimalTimeActivities: OptimalTimeActivities;
  originalSleepSession: Schedule;
  sleepStartDate: string;
  reason?: Reason;
}

export interface Schedule {
  end: string;
  start: string;
}

export interface OptimalTimeActivities {
  dinner?: Schedule;
  mostAlert: Schedule;
  windDown?: Schedule;
  workOut: Schedule;
}

export interface Reason {
  code: number;
  text: string;
}
