export enum Status {
  Installed = 'INSTALLED',
  NotInstalled = 'NOT_INSTALLED',
  InstalledByExchange = 'INSTALLED_BY_EXCHANGE',
  Removed = 'REMOVED',
  RemovedByExchange = 'REMOVED_BY_EXCHANGE',
  PendingExchange = 'PENDING_EXCHANGE',
}

export enum ComponentSize {
  KingFlex = 'KING-FLEX',
  SplitKing = 'KING-SPLIT',
  TwinXl = 'TWINXL',
}

export enum ComponentSizeCustomerFriendly {
  KingFlex = 'FlexTop King',
  SplitKing = 'Split King',
  TwinXl = 'TwinXL',
}

export enum ProductClassificationExcluded {
  FlexFitC = 'FLEX FIT C',
  Undefined = 'UNDEFINED',
  FlexFit = 'FLEX FIT',
}

export interface Component {
  componentId: string;
  parentId?: string;
  type: string;
  model: string;
  dualSleep: boolean;
  version: string;
  serial: string;
  sku: string;
  size?: string;
  base?: string;
  reference: string;
  purchaseDate: string;
  installDate?: string;
  installer?: string;
  orderNumberToExchange?: string;
  status: string;
  hasPendingReturn: boolean;
  mattressModel: string;
  subgeneration?: string;
  productclassification?: string;
}
