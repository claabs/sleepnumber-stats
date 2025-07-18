export type SleepIQAvgBySN = Record<string, number>;

export interface SleeperProfile {
  bedExitAvg: number;
  bedExitMax: number;
  bedFirstOnline: string;
  heartRateAvg: number;
  heartRateMax: number;
  hrvAvg: number;
  hrvMax: number;
  hrvMin: number;
  inBedAvg: number;
  inBedForSleepIQMax: number;
  inBedMax: number;
  inBedTotal: number;
  outOfBedAvg: number;
  outOfBedMax: number;
  respirationRateAvg: number;
  respirationRateMax: number;
  restfulAvg: number;
  restfulMax: number;
  restlessAvg: number;
  restlessMax: number;
  restlessMin: number;
  sleepIQAvg: number;
  sleepIQAvgBySN: SleepIQAvgBySN[];
  sleepIQMax: number;
  sleepSessionCount: number;
  sleepSessionTotal: number;
  sleeperId: string;
}
