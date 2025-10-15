import { serve } from '@hono/node-server';
import { Hono } from 'hono';

import { config } from './config.ts';
import { getFitbitAccessToken } from './fitbit.ts';
import { logger } from './logger.ts';
import { SleepNumberAPI } from './sleepnumber-api.ts';
import { setFitbitRefreshToken } from './token-store.ts';

import type { Sleeper } from './models/sleeper/sleeper.model.ts';

const FITBIT_AUTHORIZE_URL = 'https://www.fitbit.com/oauth2/authorize';

const clientId = config.fitbitClientId;
const clientSecret = config.fitbitClientSecret;
const redirectUri = config.fitbitRedirectUri;

if (!clientId || !clientSecret || !redirectUri) {
  throw new Error('Fitbit client ID, client secret, and redirect URI must be set in config.json');
}

const sleepApi = new SleepNumberAPI({
  email: config.sleepNumberEmail,
  password: config.sleepNumberPassword,
  logger,
});

let sleepers: Sleeper[];
try {
  const sleeperResp = await sleepApi.getSleeper();
  sleepers = sleeperResp.sleepers;
} catch (err) {
  logger.error({ err }, 'Error fetching sleepers from SleepNumber API');
  throw err;
}

const registerHtml = `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Register Fitbit Sleeper</title>
    </head>
    <body>
      <h1>Select a Sleeper to Register with Fitbit</h1>
      <ul>
        ${sleepers
          .map(
            (s: Sleeper) =>
              `<li><a href="/register/${encodeURIComponent(s.sleeperId)}">${s.firstName}</a></li>`,
          )
          .join('')}
      </ul>
    </body>
    </html>`;

const fitbitApp = new Hono();

fitbitApp.get('/register', (c) => {
  return c.html(registerHtml);
});

fitbitApp.get('/register/:sleeperId', (c) => {
  const sleeperId = c.req.param('sleeperId');
  const url = new URL(FITBIT_AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'sleep profile');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', sleeperId);
  return c.redirect(url.toString());
});

fitbitApp.get('/callback', async (c) => {
  const sleeperId = c.req.query('state');
  const code = c.req.query('code');
  if (!code) return c.text('Missing code', 400);
  if (!sleeperId) return c.text('Missing state', 400);

  try {
    const resp = await getFitbitAccessToken({
      client_id: clientId,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    });

    await setFitbitRefreshToken(sleeperId, resp.refresh_token);

    return c.text('Fitbit authorization successful!');
  } catch (err) {
    logger.error({ err }, 'Error exchanging code for tokens');
    return c.text('Error exchanging code', 500);
  }
});

serve({ fetch: fitbitApp.fetch, port: config.port });
