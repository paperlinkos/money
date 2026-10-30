export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET,
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
  paystackPlanPro: process.env.PAYSTACK_PLAN_PRO,
  paystackPlanStudio: process.env.PAYSTACK_PLAN_STUDIO,
}
