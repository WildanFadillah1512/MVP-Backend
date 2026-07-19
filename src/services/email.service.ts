import nodemailer from 'nodemailer';

const getBooleanEnv = (value?: string) => ['true', '1', 'yes'].includes((value || '').toLowerCase());

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
};

const createSmtpConfig = (host: string, port: number, secure: boolean, user: string, pass: string): SmtpConfig => ({
  host,
  port,
  secure,
  auth: { user, pass },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

const getSmtpConfigs = () => {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const secure = process.env.SMTP_SECURE ? getBooleanEnv(process.env.SMTP_SECURE) : port === 465;

  if (!user || !pass) return null;

  const configs = [createSmtpConfig(host, port, secure, user, pass)];
  const isGmail = host === 'smtp.gmail.com';

  if (isGmail && port !== 587) {
    configs.push(createSmtpConfig(host, 587, false, user, pass));
  }

  if (isGmail && port !== 465) {
    configs.push(createSmtpConfig(host, 465, true, user, pass));
  }

  return configs;
};

export async function sendLoginOtpEmail(to: string, otpCode: string) {
  const smtpConfigs = getSmtpConfigs();
  const appName = process.env.APP_NAME || 'SikaryaERP';
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.GMAIL_USER;

  if (!smtpConfigs || !from) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV OTP] ${to}: ${otpCode}`);
      return;
    }
    throw new Error('Konfigurasi SMTP OTP belum tersedia');
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

  let lastError: any;
  for (const smtpConfig of smtpConfigs) {
    try {
      const transporter = nodemailer.createTransport(smtpConfig);
      await transporter.sendMail(mailOptions);
      return;
    } catch (error: any) {
      lastError = error;
      console.error(`SMTP send failed on ${smtpConfig.host}:${smtpConfig.port}`, {
        code: error.code,
        command: error.command,
        responseCode: error.responseCode,
        response: error.response,
      });
    }
  }

  throw lastError || new Error('Gagal mengirim email OTP');
}
