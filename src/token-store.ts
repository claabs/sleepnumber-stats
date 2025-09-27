import fs from 'node:fs/promises';
import path from 'node:path';

import { configPath } from './config.ts';

const TOKENS_FILE = path.resolve(configPath, 'tokens.json');

interface TokenStore {
  sleepNumber?: Record<string, string>; // email -> refreshToken
  fitbit?: Record<string, string>; // sleeperId -> refreshToken
}

async function readTokens(): Promise<TokenStore> {
  try {
    const file = await fs.readFile(TOKENS_FILE, 'utf-8');
    return JSON.parse(file) as TokenStore;
  } catch {
    return {};
  }
}

async function writeTokens(tokens: TokenStore): Promise<void> {
  await fs.writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

export async function getSleepNumberRefreshToken(email: string): Promise<string | undefined> {
  const tokens = await readTokens();
  return tokens.sleepNumber?.[email];
}

export async function setSleepNumberRefreshToken(
  email: string,
  refreshToken: string,
): Promise<void> {
  const tokens = await readTokens();
  tokens.sleepNumber ??= {};
  tokens.sleepNumber[email] = refreshToken;
  await writeTokens(tokens);
}

export async function getFitbitRefreshToken(sleeperId: string): Promise<string | undefined> {
  const tokens = await readTokens();
  return tokens.fitbit?.[sleeperId];
}

export async function setFitbitRefreshToken(
  sleeperId: string,
  refreshToken: string,
): Promise<void> {
  const tokens = await readTokens();
  tokens.fitbit ??= {};
  tokens.fitbit[sleeperId] = refreshToken;
  await writeTokens(tokens);
}
