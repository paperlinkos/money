export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '::',
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET,
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  adminEmails: (process.env.ADMIN_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean),
  resendApiKey: process.env.RESEND_API_KEY,
  mailFrom: process.env.MAIL_FROM,
  paystackApiUrl: process.env.PAYSTACK_API_URL ?? 'https://api.paystack.co',
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
  paystackPlanPro: process.env.PAYSTACK_PLAN_PRO,
  paystackPlanStudio: process.env.PAYSTACK_PLAN_STUDIO,
}
