import nodemailer from 'nodemailer';

const getBooleanEnv = (value?: string) => ['true', '1', 'yes'].includes((value || '').toLowerCase());

const getSmtpConfig = () => {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const secure = process.env.SMTP_SECURE ? getBooleanEnv(process.env.SMTP_SECURE) : port === 465;

  if (!user || !pass) return null;

  return {
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  };
};

export async function sendLoginOtpEmail(to: string, otpCode: string) {
  const smtpConfig = getSmtpConfig();
  const appName = process.env.APP_NAME || 'SikaryaERP';
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.GMAIL_USER;

  if (!smtpConfig || !from) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV OTP] ${to}: ${otpCode}`);
      return;
    }
    throw new Error('Konfigurasi SMTP OTP belum tersedia');
  }

  const transporter = nodemailer.createTransport(smtpConfig);

  await transporter.sendMail({
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
  });
}
