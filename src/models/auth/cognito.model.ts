export interface CognitoLoginModel {
  Email: string;
  Password: string;
}

export interface CognitoQuery<T> {
  status: string;
  data: T;
}

// Login models
// in case user was redirected from the mobile
// there will be only AccessToken and IdToken provided
export interface CognitoLoginData {
  AccessToken: string;
  IdToken: string;
  RefreshToken?: string;
  ExpiresIn?: number;
  TokenType?: string;
}

// Refresh token models

export interface CognitoRefreshTokenModel {
  RefreshToken: string;
}

export interface CognitoRefreshToken {
  AccessToken: string;
  IdToken: string;
  ExpiresIn: number;
  TokenType: string;
}

export interface UserInfo {
  userId: string;
  accountId: string;
  sleeperId: string;
  registrationState: number;
  licenseAccepted: boolean;
  privacyPolicyAccepted: boolean;
}
