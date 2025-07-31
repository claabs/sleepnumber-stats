import type { Component } from './component.model.ts';

export interface Bed {
  bedId: string;
  accountId: string;
  name: string;
  dualSleep: boolean;
  sleeperRightId: string;
  sleeperLeftId: string;
  size: string;
  generation: string;
  generationToExchange: string;
  isKidsBed: boolean;
  hasSnore: boolean;
  fccId: string;
  macAddress: string;
  zipcode: string;
  timezone: string;
  registrationDate: string;
  returnRequestStatus: number;
  status: number;
  components: Component[];
}

export interface BedEntity {
  beds: Bed[];
}
