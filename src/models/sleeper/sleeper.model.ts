import type { AppSetting } from './application-settings.model.ts';
import type { SleeperProfile } from './sleeper-profile.model.ts';
import type { WellnessCategory, WellnessProfile } from './wellness-profile.model.ts';

export enum Gender {
  MALE = 1,
  FEMALE = 0,
  NON_BINARY = 2,
  PREFER_NOT_TO_SAY = 9,
}

export interface SleeperEntity {
  sleepers: Sleeper[];
}

export type UpdateSleeperProperty = Record<
  string,
  string | number | boolean | number[] | object[] | null
>;

export interface Sleeper {
  sleeperId: string;
  bedId: string;
  accountId: string;
  username: string;
  firstName: string;
  email: string;
  side: number;
  zipCode: string;
  birthYear: string;
  birthMonth: number;
  isChild: boolean;
  duration: number | null;
  gender: Gender;
  isAccountOwner: boolean;
  sleepGoal: number;
  height: number;
  weight: number;
  licenseVersion: number;
  timezone: string;
  active: boolean;
  lastLogin: string;
  emailValidated: boolean;
  firstSessionRecorded: string | null;
  privacyPolicyVersion: number;
  profile?: SleeperProfile;
  appSettings?: AppSetting[];
  wellnessProfile: WellnessProfile;
  wellnessQuestions: WellnessCategory[];
}

export interface UpdateSleeperEmailProp {
  login: string;
  currentPassword: string;
}
export interface UpdateSleeperPasswordProp {
  currentPassword: string | null;
  newPassword: string | null;
}

export interface UpdateSleeperPasswordResponse {
  accountId: string;
  login: string;
  passwordSetInCognito: boolean;
}
export interface ForgotPasswordBody {
  login: string;
}

export interface ResetPasswordData {
  password: string;
  token: string;
}

export interface ResetPasswordResponse {
  login: string;
}
