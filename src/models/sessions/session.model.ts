export interface SleepSessionProps {
  date: string;
  startDate: string;
  endDate: string;
  originalStartDate: string;
  originalEndDate: string;
  avgHeartRate: number;
  avgRespirationRate: number;
  bedExits: BedExit[];
  fallAsleepDate: string;
  fallAsleepPeriod: number;
  hrv: number;
  hrvActionCode: number | null;
  inBed: number;
  isFinalized: boolean;
  isHidden: boolean;
  longest: boolean;
  outOfBed: number;
  restful: number;
  restless: number;
  sleepIQCalculating: false;
  sleepNumber: number;
  sleepQuotient: number;
  sleepGoalDuration: number;
  sliceList: Slice[];
  snoreData: SnoreData;
  snoreSensitivity: number;
  totalSleepSessionTime: number;
  totalSnoreTime: number;
}

export interface SleepSession {
  date: string;
  startDate: string;
  endDate: string;
  originalStartDate: string;
  originalEndDate: string;
  type: string;
}

export interface SessionModel extends SleepSession {
  avgHeartRate: number;
  avgRespirationRate: number;
  bedExits: BedExit[];
  fallAsleepDate: string;
  fallAsleepPeriod: number;
  hrv: number;
  hrvActionCode: number | null;
  inBed: number;
  isFinalized: boolean;
  isHidden: boolean;
  longest: boolean;
  outOfBed: number;
  restful: number;
  restless: number;
  sleepIQCalculating: false;
  sleepNumber: number;
  sleepQuotient: number;
  sleepGoalDuration: number;
  sliceList: Slice[];
  snoreData: SnoreData;
  snoreSensitivity: number;
  totalSleepSessionTime: number;
  totalSnoreTime: number;
  iccMessages: unknown[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface NoDataSession extends SleepSession {}

export interface BedExit {
  bedExitDuration: number;
  bedExitTime: string;
}

export interface Slice {
  outOfBedTime: number;
  restfulTime: number;
  restlessTime: number;
  type: number;
}

export interface SnoreLevelChanges {
  startTime: string;
  intensity: number;
}

export interface SnoreActions {
  actionTime: string;
  actionType: string;
  actionNotTakenReason: string;
}

export interface SnoreSense {
  startTime: string;
  endTime: string;
}

export interface SnoreData {
  levelChanges: SnoreLevelChanges[];
  snoreActions: SnoreActions[];
  snoreSense: SnoreSense[];
}

export interface SleepChartOptions {
  tooltip: boolean;
  editable: boolean;
}

export interface SessionMetrics {
  type: string;
  title: string;
  value: string;
  averageValue: string;
}

export interface SleepDataReqParams {
  date: string;
  interval: string;
  sleeper: string;
  includeSlices: boolean;
}

export interface SleepDataByYearReqParams {
  startDate: string;
  sleeperId: string | undefined;
}

export interface StartEndDateReqParams {
  startDate: string;
  endDate: string;
}

export interface Rolling30DaysReqParams {
  date: string | undefined;
  interval: string | undefined;
}
