import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name} (see server/.env.example)`);
  }
  return value;
}

/** Hard cap for one capture: 500 MB. */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export const config = {
  port: Number(process.env.PORT ?? 8787),
  teamPasscode: required('TEAM_PASSCODE'),
  jwtSecret: required('JWT_SECRET'),
  driveFolderId: required('DRIVE_FOLDER_ID'),
  googleClientId: required('GOOGLE_CLIENT_ID'),
  googleClientSecret: required('GOOGLE_CLIENT_SECRET'),
  googleRefreshToken: required('GOOGLE_REFRESH_TOKEN'),
  maxUploadBytes: MAX_UPLOAD_BYTES,
};