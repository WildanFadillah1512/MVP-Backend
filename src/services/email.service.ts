import nodemailer from 'nodemailer';

const getBooleanEnv = (value?: string) => ['true', '1', 'yes'].includes((value || '').toLowerCase());

const getSmtpConfig = () => {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  const secure = process.env.SMTP_SECURE ? getBooleanEnv(process.env.SMTP_SECURE) : port === 465;

  if (!user || !pass) return null;

  return { host, port, secure, auth: { user, pass } };
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
    subject: `Kode OTP Login ${appName}`,
    text: `Kode OTP login ${appName}: ${otpCode}. Kode berlaku 10 menit.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937">
        <h2 style="margin:0 0 12px">${appName}</h2>
        <p>Kode OTP login Anda:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${otpCode}</p>
        <p>Kode berlaku 10 menit. Abaikan email ini jika Anda tidak mencoba login.</p>
      </div>
    `
  });
}
