import fs from 'fs';
import os from 'os';
import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { config, MAX_UPLOAD_BYTES } from './config';
import { AuthedRequest, requireAuth, signToken } from './auth';
import { uploadFileToDrive } from './drive';

const app = express();
app.disable('x-powered-by');

// Let the app's origins call the API (Expo web runs on another port).
// Preflight is answered here; native clients ignore CORS entirely.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const removeTemp = (path: string | undefined) => {
  if (!path) return;
  fs.unlink(path, (err) => {
    if (err && err.code !== 'ENOENT') console.error('[upload] temp cleanup failed:', err);
  });
};

/** POST /login — check the shared team passcode, return a JWT with the user's name. */
app.post('/login', (req: Request, res: Response) => {
  const { name, passcode } = (req.body ?? {}) as { name?: unknown; passcode?: unknown };

  if (typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (typeof passcode !== 'string' || passcode !== config.teamPasscode) {
    res.status(401).json({ error: 'Wrong team passcode' });
    return;
  }

  const trimmedName = name.trim().slice(0, 60);
  res.json({ token: signToken(trimmedName), name: trimmedName });
});

/** POST /upload — JWT required, images/videos up to 500 MB, temp file -> Drive -> delete temp. */
app.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  async (req: AuthedRequest, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Expected multipart field "file"' });
      return;
    }

    const mimeType = file.mimetype || '';
    if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) {
      removeTemp(file.path);
      res.status(415).json({ error: 'Only image/* and video/* files are allowed' });
      return;
    }

    try {
      const result = await uploadFileToDrive({
        filePath: file.path,
        originalName: file.originalname || `capture-${Date.now()}.bin`,
        mimeType,
        uploader: req.user?.name ?? 'someone',
      });

      res.status(201).json({
        id: result.id,
        name: result.name,
        webViewLink: result.webViewLink,
        uploadedBy: req.user?.name,
      });
    } catch (err) {
      console.error('[upload] Drive upload failed:', err);
      res.status(502).json({ error: 'Failed to upload to Google Drive' });
    } finally {
      // Always clean up the temp file, success or failure.
      removeTemp(file.path);
    }
  },
);

app.use("/api/health", async(req, res) =>{
  res.json({status : "online"})
})


// JSON errors (multer rejects anything over 500 MB while streaming).
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const multerLike = err as { code?: string; message?: string };
  if (multerLike?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'File is too large (max 500 MB)' });
    return;
  }
  console.error('[error]', err);
  res.status(500).json({ error: multerLike?.message ?? 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`SnapDrive server listening on http://localhost:${config.port}`);
});
