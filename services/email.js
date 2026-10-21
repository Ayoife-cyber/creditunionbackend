import nodemailer from 'nodemailer';

// Build the transporter once at module load (reused across all calls)
const transporter =
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      })
    : null;

export async function sendEmail(to, subject, text, html) {
  const from = process.env.FROM_EMAIL || 'no-reply@example.com';

  if (transporter) {
    const info = await transporter.sendMail({ from, to, subject, text, html });
    return { success: true, messageId: info.messageId };
  }

  // Fallback for development/testing: log the message
  console.log('Email send (simulated)');
  console.log('From:', from);
  console.log('To:', to);
  console.log('Subject:', subject);
  console.log('Text:', text);
  if (html) console.log('HTML:', html);
  return { success: true, simulated: true };
}
