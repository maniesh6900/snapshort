/**
 * One-time OAuth walkthrough -> GOOGLE_REFRESH_TOKEN.
 *
 *   npm run drive:auth
 *
 * Prints the Google consent URL, has you paste the redirect back, exchanges the
 * code for a refresh token and writes it into ./.env.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { google } from 'googleapis';

const REDIRECT_URI = 'http://localhost';
const SCOPES = ['https://www.googleapis.com/auth/drive'];
const ENV_PATH = path.resolve(process.cwd(), '.env');

dotenv.config({ path: ENV_PATH });

function upsertEnv(key: string, value: string): void {
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  text = pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
  fs.writeFileSync(ENV_PATH, text, 'utf8');
}

async function main(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let clientId = process.env.GOOGLE_CLIENT_ID ?? '';
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';

  if (!clientId || !clientSecret) {
    console.log('\nFound no GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env yet.');
    clientId = (await rl.question('Paste your OAuth client ID: ')).trim();
    clientSecret = (await rl.question('Paste your OAuth client secret: ')).trim();
    upsertEnv('GOOGLE_CLIENT_ID', clientId);
    upsertEnv('GOOGLE_CLIENT_SECRET', clientSecret);
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  console.log('\n1. Open this URL in a browser and approve access:\n\n' + url + '\n');
  console.log(`   (make sure "${REDIRECT_URI}" is listed under Authorized redirect URIs)`);

  const pasted = (await rl.question('\n2. Paste the full redirect URL you landed on: ')).trim();
  rl.close();

  const code = pasted.includes('code=')
    ? new URL(pasted).searchParams.get('code')
    : pasted.trim();

  if (!code) {
    console.error('\nCould not find an authorization code in that input.');
    process.exit(1);
  }

  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    console.error(
      '\nGoogle did not return a refresh token. Re-run with a fresh consent ' +
        '(the script already requests prompt=consent, so revoke access at ' +
        'https://myaccount.google.com/permissions first if needed).',
    );
    process.exit(1);
  }

  upsertEnv('GOOGLE_REFRESH_TOKEN', tokens.refresh_token);
  console.log(`\nDone. Saved GOOGLE_REFRESH_TOKEN to ${ENV_PATH}`);
  console.log('Fill in DRIVE_FOLDER_ID in that file, then start the server:  npm run dev');
}

main().catch((err) => {
  console.error('\nAuth failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
