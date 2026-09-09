// Mock SMS sender for demo/hackathon purposes.
export function sendSMS(phone, message) {
  console.log(`[SMS -> ${phone}] ${message}`);
  return { success: true, phone, message, sentAt: new Date().toISOString() };
}
