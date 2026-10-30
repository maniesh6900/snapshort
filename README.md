# SnapDrive

Several people capture photos/videos on their phones; everything lands in **one** shared Google
Drive folder (with a subfolder per uploader) through a small backend.

```
/app     Expo + expo-router + expo-camera mobile app (iOS & Android), TypeScript
/server  Node.js + Express + TypeScript backend
```

---

## 1. Google Cloud setup (one time)

1. Go to <https://console.cloud.google.com/> and create (or pick) a project.
2. **Enable the Drive API:** APIs & Services → Library → "Google Drive API" → Enable.
3. **OAuth consent screen:** APIs & Services → OAuth consent screen →
   *External* → fill in the app name + your email →
   Scopes: add `.../auth/drive` →
   **Test users:** add the Google account you will upload with → Save and back.
   (While the app is in "Testing" status only added test users can sign in.)
4. **OAuth client:** APIs & Services → Credentials → Create credentials → OAuth client ID →
   Application type **Desktop app** → create → copy the **Client ID** and **Client secret**.
   Still on that credential, add `http://localhost` under **Authorized redirect URIs**
   (it is usually added automatically for Desktop apps).

## 2. Get the refresh token (one time)

```bash
cd server
npm install
cp .env.example .env
npm run drive:auth
```

The script prints a Google consent URL → open it, approve with the test-user account, then paste
the full `http://localhost?code=...` URL you land on back into the terminal. It saves
`GOOGLE_REFRESH_TOKEN` (plus the client id/secret if they were missing) into `server/.env`.

> If it says no refresh token came back, revoke the app's access at
> <https://myaccount.google.com/permissions> and run it again (the script already forces consent).

## 3. Configure and run the server

Edit `server/.env`:

| Var | Meaning |
| --- | --- |
| `TEAM_PASSCODE` | shared password typed into the app |
| `JWT_SECRET` | any long random string |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from step 1 |
| `GOOGLE_REFRESH_TOKEN` | from step 2 |
| `DRIVE_FOLDER_ID` | id of the ONE shared folder: `https://drive.google.com/drive/folders/<ID>` |
| `PORT` | default `8787` |

```bash
cd server
npm run dev          # or: npm run build && npm start
```

Endpoints:

- `POST /login` `{name, passcode}` → `{token, name}` — JWT carries the user's name.
- `POST /upload` (Bearer JWT, multipart field `file`) → temp file → streamed into
  `DRIVE_FOLDER_ID/<uploader>/<uploader>-YYYYMMDD-HHmmss.ext` → temp file deleted.
  Only `image/*` and `video/*`; **max 500 MB**; anything else → `415`/`413`.

## 4. Run the app

```bash
cd app
npm install
cp .env.example .env      # set EXPO_PUBLIC_API_URL
npx expo start
```

`EXPO_PUBLIC_API_URL` must reach your machine from the phone — use your computer's LAN IP, e.g.
`http://192.168.1.23:8787` (`localhost` only works in a simulator; Android emulator uses
`http://10.0.2.2:8787`). Phone and computer must be on the same Wi‑Fi.

**On a real device** you have two options:

- **Expo Go** (fastest): install Expo Go from the store, scan the QR from `npx expo start`.
  This prototype has no native Google sign-in — plain camera, SecureStore and file uploads are all
  supported — so Expo Go should work.
- **Dev build** (if Expo Go doesn't fit your needs): `npx expo run:ios` / `npx expo run:android`
  or an EAS dev build, then open the app.

Flow in the app: enter name + team passcode → allow camera (and microphone for video) →
Photo/Video toggle, flip, shutter, recording timer → each capture is queued and uploaded, with
per-item `pending / uploading / done / failed` status and a **Retry** button under *Uploads*.

## 5. Test an upload end to end

1. `server`: `npm run dev` and `app`: `npx expo start`.
2. On the phone: sign in with the passcode, grant permissions, take a photo (or a short video).
3. Watch the **Uploads** screen flip to `Uploading…` → `Uploaded`.
4. In Drive open `DRIVE_FOLDER_ID` → your name's subfolder → you should see
   `YourName-YYYYMMDD-HHmmss.jpg` (a new subfolder is created on your first upload).
5. Quick backend-only check with curl:

   ```bash
   TOKEN=$(curl -s -X POST http://localhost:8787/login \
     -H 'Content-Type: application/json' \
     -d '{"name":"Alex","passcode":"letmein"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
   curl -X POST http://localhost:8787/upload -H "Authorization: Bearer $TOKEN" \
     -F "file=@/path/to/photo.jpg;type=image/jpeg"
   ```

   Expect `201` with the Drive file id. A `.txt` file should return `415`, and anything over
   500 MB `413`.

---

## Notes / limits

- No database: queue state lives in memory (a reload clears it), sessions are stateless JWTs.
- Dependencies kept minimal: server = `express`, `multer`, `jsonwebtoken`, `googleapis`,
  `dotenv`; app = Expo packages only (`expo-camera`, `expo-secure-store`, `expo-file-system`).
- Web preview fallbacks: `expo-secure-store`/`expo-file-system` have no web build, so the web
  target uses `localStorage` and `fetch`; native keeps the SecureStore + `uploadAsync` path.
- Video recording needs a real device — expo-camera's web build cannot record.
