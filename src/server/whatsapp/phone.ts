import { z } from "zod";

const phoneDigitsSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[^\d]/g, ""))
  .refine((digits) => /^\d{8,15}$/.test(digits), {
    message: "Invalid recipient number. Expected 8-15 digits.",
  });

export function toWhatsAppChatId(input: string) {
  const digits = phoneDigitsSchema.parse(input);
  return `${digits}@c.us`;
}
