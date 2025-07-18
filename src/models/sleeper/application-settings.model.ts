export interface AppSetting {
  key: string;
  updatedOn: string;
  value: string;
}

export interface AppSettingEntityModel {
  appSettings: AppSetting[];
}
