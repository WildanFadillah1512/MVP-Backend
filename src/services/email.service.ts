import nodemailer from 'nodemailer';
import dns from 'dns';
import { google } from 'googleapis';

const getBooleanEnv = (value?: string) => ['true', '1', 'yes'].includes((value || '').toLowerCase());

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
  family: number;
  tls?: {
    servername: string;
  };
};

const createSmtpConfig = (
  host: string,
  port: number,
  secure: boolean,
  user: string,
  pass: string,
  servername?: string
): SmtpConfig => ({
  host,
  port,
  secure,
  auth: { user, pass },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  family: 4,
  tls: servername ? { servername } : undefined,
});

const resolveConnectionHost = async (host: string) => {
  if (host !== 'smtp.gmail.com') {
    return { host };
  }

  try {
    const address = await dns.promises.lookup(host, { family: 4 });
    return { host: address.address, servername: host };
  } catch (error) {
    console.error('Failed to resolve Gmail SMTP IPv4 address:', error);
    return { host };
  }
};

const getSmtpConfigs = async () => {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const secure = process.env.SMTP_SECURE ? getBooleanEnv(process.env.SMTP_SECURE) : port === 465;

  if (!user || !pass) return null;

  const connection = await resolveConnectionHost(host);
  const configs = [createSmtpConfig(connection.host, port, secure, user, pass, connection.servername)];
  const isGmail = host === 'smtp.gmail.com';

  if (isGmail && port !== 587) {
    configs.push(createSmtpConfig(connection.host, 587, false, user, pass, connection.servername));
  }

  if (isGmail && port !== 465) {
    configs.push(createSmtpConfig(connection.host, 465, true, user, pass, connection.servername));
  }

  return configs;
};

const getGoogleOAuthClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
};

const encodeBase64Url = (value: string) => Buffer.from(value)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

const buildRawEmail = (from: string, to: string, subject: string, text: string, html: string) => {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const boundary = `sikarya_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    html,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return encodeBase64Url(message);
};

const sendWithGmailApi = async (to: string, from: string, subject: string, text: string, html: string) => {
  const auth = getGoogleOAuthClient();
  if (!auth) {
    throw new Error('Google OAuth belum tersedia');
  }

  const accessToken = await auth.getAccessToken();
  const token = accessToken.token;
  if (!token) {
    throw new Error('Gagal mendapatkan access token Google');
  }

  const oauth2 = google.oauth2({ version: 'v2', auth });
  const tokenInfo = await oauth2.tokeninfo({ access_token: token });
  const scopes = (tokenInfo.data.scope || '').split(/\s+/);
  if (!scopes.includes(GMAIL_SEND_SCOPE)) {
    const error: any = new Error('Google OAuth belum memiliki scope Gmail Send');
    error.code = 'MISSING_GMAIL_SEND_SCOPE';
    error.scopes = tokenInfo.data.scope;
    throw error;
  }

  const gmail = google.gmail({ version: 'v1', auth });
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: buildRawEmail(from, to, subject, text, html),
    },
  });
};

export async function sendLoginOtpEmail(to: string, otpCode: string) {
  const smtpConfigs = await getSmtpConfigs();
  const appName = process.env.APP_NAME || 'SikaryaERP';
  const fromEmail = process.env.SMTP_USER || process.env.GMAIL_USER || 'me';
  const from = process.env.SMTP_FROM || fromEmail;

  if (!from) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV OTP] ${to}: ${otpCode}`);
      return;
    }
    throw new Error('Konfigurasi email OTP belum tersedia');
  }

  const mailOptions = {
    from,
    to,
    subject: `Kode masuk ${appName}`,
    text: `Halo,\n\nKode masuk ${appName} Anda adalah ${otpCode}.\n\nKode ini berlaku selama 10 menit. Jika Anda tidak sedang mencoba masuk, abaikan email ini.\n\nTerima kasih.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;max-width:520px">
        <p>Halo,</p>
        <p>Gunakan kode berikut untuk masuk ke ${appName}:</p>
        <p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:18px 0;color:#111827">${otpCode}</p>
        <p>Kode ini berlaku selama 10 menit.</p>
        <p>Jika Anda tidak sedang mencoba masuk, email ini bisa diabaikan.</p>
        <p style="margin-top:24px">Terima kasih.</p>
      </div>
    `
  };

  const emailErrors: any[] = [];
  try {
    await sendWithGmailApi(to, from, mailOptions.subject, mailOptions.text, mailOptions.html);
    return;
  } catch (error: any) {
    emailErrors.push({
      provider: 'gmail_api',
      code: error.code,
      message: error.message,
      scopes: error.scopes,
    });
    console.error('Gmail API send failed', {
      code: error.code,
      message: error.message,
      scopes: error.scopes,
    });
  }

  if (!smtpConfigs || smtpConfigs.length === 0) {
    const error: any = new Error('Konfigurasi SMTP OTP belum tersedia');
    error.emailAttempts = emailErrors;
    throw error;
  }

  let lastError: any;
  const attempts: Array<{
    host: string;
    port: number;
    secure: boolean;
    code?: string;
    command?: string;
    responseCode?: number;
    response?: string;
    message?: string;
  }> = [];
  for (const smtpConfig of smtpConfigs) {
    try {
      const transporter = nodemailer.createTransport(smtpConfig);
      await transporter.sendMail(mailOptions);
      return;
    } catch (error: any) {
      lastError = error;
      attempts.push({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        code: error.code,
        command: error.command,
        responseCode: error.responseCode,
        response: error.response,
        message: error.message,
      });
      console.error(`SMTP send failed on ${smtpConfig.host}:${smtpConfig.port}`, {
        code: error.code,
        command: error.command,
        responseCode: error.responseCode,
        response: error.response,
      });
    }
  }

  const finalError: any = lastError || new Error('Gagal mengirim email OTP');
  finalError.smtpAttempts = attempts;
  finalError.emailAttempts = emailErrors;
  throw finalError;
}
