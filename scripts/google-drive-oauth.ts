import { google } from 'googleapis';
import http from 'http';

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const port = Number(process.env.GOOGLE_OAUTH_PORT || 53682);
const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${port}/oauth2callback`;

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before running this script.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/gmail.send',
  ],
});

console.log('\nOpen this URL and approve Google Drive + Gmail Send access:\n');
console.log(authUrl);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', redirectUri);
  if (url.pathname !== '/oauth2callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400);
    res.end('Missing authorization code.');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Google OAuth berhasil. Silakan kembali ke terminal.');
    console.log('\nGOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Failed to exchange code. Check terminal.');
    console.error('Failed to exchange code:', error);
  } finally {
    server.close();
  }
});

server.listen(port, () => {
  console.log(`\nWaiting for Google callback on ${redirectUri}\n`);
});
