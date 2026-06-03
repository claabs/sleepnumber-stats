import google from '@googleapis/health';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';

import { config } from './config.ts';
import { logger } from './logger.ts';
import { SleepNumberAPI } from './sleepnumber-api.ts';
import { setGoogleRefreshToken } from './token-store.ts';

import type { Sleeper } from './models/sleeper/sleeper.model.ts';

const clientId = config.googleClientId;
const clientSecret = config.googleClientSecret;
const redirectUri = config.googleRedirectUri;

if (!clientId || !clientSecret || !redirectUri) {
  throw new Error(
    'Google Health client ID, client secret, and redirect URI must be set in config.json',
  );
}

const oauth2Client = new google.auth.OAuth2({ clientId, clientSecret, redirectUri });

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
      <title>Register Google Health Sleeper</title>
    </head>
    <body>
      <h1>Select a Sleeper to Register with Google Health</h1>
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

const googleHealthApp = new Hono();

googleHealthApp.get('/register', (c) => {
  return c.html(registerHtml);
});

googleHealthApp.get('/register/:sleeperId', (c) => {
  const sleeperId = c.req.param('sleeperId');
  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'profile',
      'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.writeonly',
      'https://www.googleapis.com/auth/googlehealth.sleep.writeonly',
    ],
    state: sleeperId,
  });
  return c.redirect(authorizeUrl);
});

googleHealthApp.get('/callback', async (c) => {
  const sleeperId = c.req.query('state');
  const code = c.req.query('code');
  if (!code) return c.text('Missing code', 400);
  if (!sleeperId) return c.text('Missing state', 400);

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      return c.text('Missing refresh token', 403);
    }
    await setGoogleRefreshToken(sleeperId, tokens.refresh_token);

    return c.text('Google Health authorization successful!');
  } catch (err) {
    logger.error({ err }, 'Error exchanging code for tokens');
    return c.text('Error exchanging code', 500);
  }
});

serve({ fetch: googleHealthApp.fetch, port: config.port });
