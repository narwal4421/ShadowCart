// Configuration for ShadowCart
export const CONFIG = {
  // Production (Vercel) Live URL:
  API_URL: 'https://shadow-cart.vercel.app/api/send-reminder',
  REMINDER_SECRET: import.meta.env.VITE_REMINDER_SECRET || '',
};
