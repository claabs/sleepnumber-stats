export interface Rolling30DaysMetrics {
  min: number;
  max: number;
  avg: number;
}
export interface Rolling30DaysSession {
  date: string;
  endDate: string;
  originalEndDate: string;
  originalStartDate: string;
  startDate: string;
  sleepIQScore: Rolling30DaysMetrics | null;
  restfullSleep: Rolling30DaysMetrics | null;
  restlessSleep: Rolling30DaysMetrics | null;
  bedExits: Rolling30DaysMetrics | null;
  heartRate: Rolling30DaysMetrics | null;
  respirationRate: Rolling30DaysMetrics | null;
  timeInBed: Rolling30DaysMetrics | null;
  hrv: Rolling30DaysMetrics | null;
  [key: string]: string | Rolling30DaysMetrics | null;
}
export interface Rolling30Days {
  date: string;
  sessions: Rolling30DaysSession[];
}
export interface Rolling30DaysSleepData {
  sleeperId?: string;
  sleepData: Rolling30Days[];
}
export interface RollingAggregatesMetrics {
  heartRate: Rolling30DaysMetrics;
  hrv: Rolling30DaysMetrics;
  respirationRate: Rolling30DaysMetrics;
}
export interface SleepDataAggregates {
  rolling7Days: RollingAggregatesMetrics;
  rolling30Days: RollingAggregatesMetrics;
}
export interface RollingDataAggregates {
  date: string;
  sleeperId: string;
  sleepDataAggregates: SleepDataAggregates;
}
