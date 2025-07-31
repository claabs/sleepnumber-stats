export enum SleepStageType {
  SLEEP_STAGE_TYPE_UNKNOWN = 0,
  SLEEP_STAGE_TYPE_AWAKE = 1,
  SLEEP_STAGE_TYPE_SLEEPING = 2,
  SLEEP_STAGE_TYPE_OUT_OF_BED = 3,
  SLEEP_STAGE_TYPE_LIGHT = 4,
  SLEEP_STAGE_TYPE_DEEP = 5,
  SLEEP_STAGE_TYPE_REM = 6,
  STAGE_TYPE_AWAKE_IN_BED = 7,
}

export enum DeviceType {
  TYPE_UNKNOWN = 0,
  TYPE_WATCH = 1,
  TYPE_PHONE = 2,
  TYPE_SCALE = 3,
  TYPE_RING = 4,
  TYPE_HEAD_MOUNTED = 5,
  TYPE_FITNESS_BAND = 6,
  TYPE_CHEST_STRAP = 7,
  TYPE_SMART_DISPLAY = 8,
}

export enum RecordingMethod {
  RECORDING_METHOD_UNKNOWN = 0,
  RECORDING_METHOD_ACTIVELY_RECORDED = 1,
  RECORDING_METHOD_AUTOMATICALLY_RECORDED = 2,
  RECORDING_METHOD_MANUAL_ENTRY = 3,
}

export interface Device {
  type: DeviceType;
  manufacturer?: string;
  model?: string;
}

export interface Metadata {
  clientRecordId?: string;
  clientRecordVersion: number;
  device?: Device;
  dataOrigin?: string;
  lastModifiedTime?: string; // ISO 8601 date-time string
  recordingMethod?: RecordingMethod;
}

export interface SleepSessionRecord {
  startTime: string; // ISO 8601 date-time string
  startZoneOffset?: string; // e.g., "+02:00", optional
  endTime: string; // ISO 8601 date-time string
  endZoneOffset?: string; // e.g., "+02:00", optional
  title?: string;
  notes?: string;
  stages?: SleepStage[];
  metadata: Metadata;
}

export interface SleepStage {
  stage: SleepStageType;
  startTime: string; // ISO 8601 date-time string
  endTime: string; // ISO 8601 date-time string
}
