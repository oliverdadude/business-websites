import { z } from "zod";
import { MAX_QTY } from "./catalog-core";

export const cartLineSchema = z.object({
  itemId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(MAX_QTY),
});

export const quoteRequestSchema = z.object({
  lines: z.array(cartLineSchema).max(100),
});

export const checkoutSchema = z.object({
  lines: z.array(cartLineSchema).min(1, "Your cart is empty").max(100),
  ign: z
    .string()
    .trim()
    .min(2, "Enter your in-game name")
    .max(48, "In-game name is too long")
    .regex(/^[^<>\u0000-\u001f]+$/, "In-game name contains invalid characters"),
  discord: z
    .string()
    .trim()
    .min(2, "Enter your Discord username")
    .max(40, "Discord username is too long")
    .regex(/^@?[a-zA-Z0-9_.]+(#\d{4})?$/, "Use your Discord username, e.g. supplyfan or supplyfan#1234"),
  instructions: z.string().trim().max(1000, "Keep instructions under 1000 characters").default(""),
  idempotencyKey: z.string().uuid("Invalid submission key"),
  expectedTotal: z.number().int().nonnegative().optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
