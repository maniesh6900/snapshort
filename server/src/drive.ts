import fs from 'fs';
import { google, drive_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { config } from './config';

let authClient: OAuth2Client | null = null;
let driveClient: drive_v3.Drive | null = null;

/** Folder id per uploader name, so we only search/create once. */
const subfolderIds = new Map<string, string>();

/** OAuth2 client using the one-time refresh token (no sign-in at runtime). */
function getDrive(): drive_v3.Drive {
  if (!driveClient) {
    authClient = new google.auth.OAuth2(config.googleClientId, config.googleClientSecret);
    authClient.setCredentials({ refresh_token: config.googleRefreshToken });
    driveClient = google.drive({ version: 'v3', auth: authClient });
  }
  return driveClient;
}

/** Filesystem-safe version of a person's name (used for folder + file names). */
export function safeName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^\w \-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 60) || 'someone';
}

/** yyyymmdd-HHmmss in local time. */
function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes(),
  )}${p(d.getSeconds())}`;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/mp4': 'mp4',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/3gpp': '3gp',
  'video/webm': 'webm',
};

function extensionOf(originalName: string, mimeType: string): string {
  const dot = originalName.lastIndexOf('.');
  const ext = dot > -1 ? originalName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  if (ext) return ext;
  return EXTENSION_BY_MIME[mimeType] ?? 'bin';
}

/** `Alex-20261027-151030.jpg` */
export function buildFileName(uploader: string, originalName: string, mimeType: string): string {
  return `${safeName(uploader)}-${timestamp()}.${extensionOf(originalName, mimeType)}`;
}

function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Find (or create) `DRIVE_FOLDER_ID/<uploader>` and return its id. */
async function findOrCreateSubfolder(uploader: string): Promise<string> {
  const cached = subfolderIds.get(uploader);
  if (cached) return cached;

  const drive = getDrive();
  const query = [
    `name = '${escapeQuery(uploader)}'`,
    `'${config.driveFolderId}' in parents`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    'trashed = false',
  ].join(' and ');

  const found = await drive.files.list({
    q: query,
    fields: 'files(id,name)',
    spaces: 'drive',
    supportsAllDrives: true,
  });

  const existing = found.data.files?.[0]?.id;
  if (existing) {
    subfolderIds.set(uploader, existing);
    return existing;
  }

  const created = await drive.files.create({
    requestBody: {
      name: uploader,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [config.driveFolderId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });

  const id = created.data.id;
  if (!id) throw new Error('Drive did not return an id for the new subfolder');
  subfolderIds.set(uploader, id);
  return id;
}

export interface DriveUploadResult {
  id: string;
  name: string;
  webViewLink?: string | null;
}

/**
 * Streams the local temp file (written by multer) straight into
 * `DRIVE_FOLDER_ID/<uploader>/<name>-yyyymmdd-HHmmss.ext` — never buffered in memory.
 */
export async function uploadFileToDrive(params: {
  filePath: string;
  originalName: string;
  mimeType: string;
  uploader: string;
}): Promise<DriveUploadResult> {
  const uploader = safeName(params.uploader);
  const parentId = await findOrCreateSubfolder(uploader);
  const fileName = buildFileName(uploader, params.originalName, params.mimeType);

  const response = await getDrive().files.create({
    requestBody: {
      name: fileName,
      parents: [parentId],
    },
    media: {
      mimeType: params.mimeType,
      body: fs.createReadStream(params.filePath),
    },
    fields: 'id,name,webViewLink',
    supportsAllDrives: true,
  });

  const data = response.data;
  if (!data.id) {
    throw new Error('Drive did not return a file id');
  }
  return { id: data.id, name: data.name ?? fileName, webViewLink: data.webViewLink };
}
