import { z } from "zod";

export const SimOrderSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  size: z.number().positive(),
  price: z.number().positive().optional(),
  reason: z.string().min(1),
  signals: z.array(z.string()),
});

export const BacktestRequestSchema = z.object({
  symbol: z.string().min(1),
  interval: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]).default("1h"),
  limit: z.number().int().positive().max(500).default(200),
});

export type SimOrderInput = z.infer<typeof SimOrderSchema>;
export type BacktestRequestInput = z.infer<typeof BacktestRequestSchema>;
