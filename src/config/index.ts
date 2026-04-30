import { z } from "zod";

const optionalNonEmpty = z.string().optional().transform((v) => (v && v.length > 0 ? v : undefined));

const schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  LLM_PROVIDER: z.enum(["anthropic", "bedrock"]).default("anthropic"),
  CLAUDE_MODEL: optionalNonEmpty,                  // override default model id
  ANTHROPIC_API_KEY: optionalNonEmpty,             // required only when LLM_PROVIDER=anthropic
  AWS_REGION: optionalNonEmpty,                    // required only when LLM_PROVIDER=bedrock
  DATABASE_URL: optionalNonEmpty,
  SENTRY_DSN: optionalNonEmpty,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
}).superRefine((cfg, ctx) => {
  if (cfg.LLM_PROVIDER === "anthropic" && !cfg.ANTHROPIC_API_KEY) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ANTHROPIC_API_KEY"], message: "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic" });
  }
  if (cfg.LLM_PROVIDER === "bedrock" && !cfg.AWS_REGION) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["AWS_REGION"], message: "AWS_REGION is required when LLM_PROVIDER=bedrock" });
  }
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetConfigForTests(): void {
  cached = null;
}
