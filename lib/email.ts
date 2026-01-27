import nodemailer from 'nodemailer';

type MailerConfig = {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
};

const mailerConfig: MailerConfig = {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.SMTP_FROM,
};

/**
 * Creates a transporter if SMTP envs are present; otherwise returns null
 * so callers can gracefully degrade (e.g., log instead of throwing).
 */
function createTransporter() {
  if (!mailerConfig.host || !mailerConfig.port || !mailerConfig.user || !mailerConfig.pass || !mailerConfig.from) {
    return null;
  }

  return nodemailer.createTransport({
    host: mailerConfig.host,
    port: mailerConfig.port,
    secure: mailerConfig.port === 465,
    auth: {
      user: mailerConfig.user,
      pass: mailerConfig.pass,
    },
  });
}

/**
 * Send a password-reset OTP email. If SMTP is not configured, logs the OTP
 * for visibility in non-prod environments.
 */
export async function sendOtpEmail(to: string, otp: string) {
  const transporter = createTransporter();

  if (!transporter) {
    console.warn('SMTP not configured. OTP (for debugging only):', { to, otp });
    return { success: true, fallback: true };
  }

  const mailOptions = {
    from: mailerConfig.from as string,
    to,
    subject: 'Your password reset code',
    text: `Your password reset code is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your password reset code is <strong>${otp}</strong>.</p><p>The code expires in 10 minutes.</p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true, fallback: false };
  } catch (error) {
    console.error('Failed to send OTP email:', error);
    return { success: false, fallback: false };
  }
}

