import rateLimit from "express-rate-limit";

const isTestEnv = () => process.env.NODE_ENV === "test";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: () => (isTestEnv() ? 1000 : 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again shortly.",
  },
});

export const paymentCreateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: () => (isTestEnv() ? 1000 : 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many payment requests created. Please wait a moment.",
  },
});

export const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: () => (isTestEnv() ? 1000 : 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Webhook rate limit exceeded.",
  },
});

export const downloadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: () => (isTestEnv() ? 1000 : 80),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many download requests. Please try again shortly.",
  },
});
