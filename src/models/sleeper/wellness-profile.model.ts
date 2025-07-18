export enum QuestionType {
  Dropdown,
  Checkbox,
  RadioButton,
}

export enum Category {
  Sleeper = 1,
  Home = 2,
  Habits = 3,
  SleepHealth = 4,
}

export enum AnswersType {
  text = 0,
  id = 1,
}

export interface WellnessProfileResponse {
  wellnessProfile: WellnessProfile;
}

export interface WellnessProfile {
  bedroomLightSetting: number | null;
  bodyTemperatureWhileAsleep: number | null;
  caffeineTime: number | null;
  childrenInBed: number | null;
  chronicHealthIssues: string | null;
  consumeAlcohol: number | null;
  consumeCaffeine: number | null;
  exercise: number | null;
  exerciseTime: number | null;
  exerciseType: number | null;
  haveChildren: number | null;
  havePets: number | null;
  mealBeforeBed: number | null;
  morningWakeUp: number | null;
  noiseWhileAsleep: number | null;
  petsInBed: number | null;
  sleepEnvironment: number | null;
  sleepGoals: string | null;
  sleepIssues: number | null;
  smoker: number | null;
  stressLevel: number | null;
  takeNaps: number | null;
  temporaryHealthIssues: string | null;
  troubleFallingOrStayingAsleep: number | null;
  workSchedule: number | null;
  uniqueRhythm: number | null;
  sleepDisruptions: number[];
  sleepProblems: RadioButtonQuestion[];
  diagnosis: number[];
  cpapMachineUsages: number | null;
  sleepAidsUsages: RadioButtonQuestion[];
  sleepPosition: number | null;
  [key: string]: number | string | null | number[] | RadioButtonQuestion[];
}

export type RadioButtonQuestion = Record<string, number | null>;

export interface WellnessCategory {
  id: number;
  name: string;
  description: string;
  questions: QuestionProperties[];
}

export type Question = Record<string, QuestionProperties>;

export interface QuestionProperties {
  index: number;
  category: number;
  text: string;
  info_text: string;
  type: QuestionType;
  answers?: Answer[];
  subquestions?: SubQuestionsAnswer[];
  name: string;
}

export interface Answer {
  id: number;
  text: string;
}

export interface SubQuestionsAnswer {
  id: string;
  text: string;
  answers: Answer[];
}

export interface SleeperWellnessQuestion {
  property: string;
  dropdownOptions: string[];
  dropdownValues: number[];
  text: string;
  infoText: string;
  value: string | number;
  type?: number; // defaults to dropdown question type
}
