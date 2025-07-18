import type { SessionModel, SleepSession } from './session.model.ts';

export interface GoalEntry {
  goalId: string;
  status: number;
}

export interface SmartAlarmStatus {
  smartAlarmSetTime: number;
  smartAlarmActivationTime: string;
  smartWakeUpPeriod: number;
}

export interface DualTempData {
  targetTemperature: number;
  blowerSetPoint: number;
  dualTempStatus: number;
  acquisitionDate: string;
}

export interface Tag {
  date: string;
  session: SleepSession;
}

export interface SleepDataStructure {
  sleeperId: string;
  date?: string;
  message: string;
  tip: string;
  fallAsleepPeriod: number;
  sleepData: SleepDataDays[];
  smartAlarmStatus: SmartAlarmStatus[];
  dualTempData: DualTempData[];
  bedExitAvg: number;
  bedExitMax: number;
  inBedAvg: number;
  inBedMax: number;
  inBedTotal: number;
  outOfBedAvg: number;
  outOfBedMax: number;
  outOfBedTotal: number;
  respirationRateAvg: number;
  respirationRateMax: number;
  respirationRateMin: number;
  heartRateAvg: number;
  heartRateMin: number;
  heartRateMax: number;
  restfulAvg: number;
  restfulMax: number;
  restfulTotal: number;
  restlessAvg: number;
  restlessMax: number;
  restlessTotal: number;
  sleepIQAvg: number;
  sleepIQMax: number;
  hrvAvg: number | null;
  hrvMax: number | null;
  hrvMin: number | null;
  sleepSessionTotal: number;
  sleepSessionCount: number;
}

export interface SleepDataMetrics {
  sleepIQAvg: number;
  sleepIQMax: number;
  inBedAvg: number;
}

export interface YearHistoryModel {
  date: string;
  sleepers: YearSleepDataEntityModel[];
}

export interface YearHistorySleepData {
  yearSleepData: YearHistoryModel;
}

export interface MonthSleepDataModel {
  date: string;
  heartRateAvg: number;
  inBedAvg: number;
  respirationRateAvg: number;
  sleepIQAvg: number;
}
export interface YearSleepDataEntityModel {
  sleeperId: string;
  date?: string;
  inBedAvg: number;
  monthSleepData: MonthSleepDataModel[];
  sleepIQAvg: number;
  sleepIQMax: number;
  sleepSessionCount: number;
}

export interface HistoryMetrics {
  text: string;
  value: number | string;
}

export interface SleepDataSessions {
  date: string;
  sessions: SessionModel[];
}

export interface SleepData {
  date: string;
  sleepData: SleepDataSessions[];
  sleepIQAvg: number;
  sleepIQMax: number;
  inBedAvg: number;
}

export interface SleepDataEntity {
  sleeperId: string;
  sleepData: SleepData[];
}
export interface SleepDataDays {
  tip: string;
  message: string;
  date: string;
  sessions: SessionModel[];
  goalEntry?: GoalEntry;
  tags: Tag[];
}
export interface SleepHistory {
  date: string;
  sleepData: SleepDataSessions[];
  sleepIQAvg: number;
  sleepIQMax: number;
  inBedAvg: number;
}
