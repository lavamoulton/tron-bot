import { GatewayIntentBits, Partials, type ClientOptions } from "discord.js";

import "dotenv/config";

const ENVIRONMENT = process.env.environment;
const VALID_QUEUE_SCOPES = new Set(["open", "beginner", "pro"]);

export type QueueChannelPolicy = {
  channelId: string;
  scope: "open" | "beginner" | "pro";
};

function parseQueueChannelPolicies(rawValue?: string): QueueChannelPolicy[] {
  if (!rawValue) return [];
  const policies: QueueChannelPolicy[] = [];
  for (const item of rawValue.split(",")) {
    const [channelIdRaw, scopeRaw] = item.split(":");
    const channelId = (channelIdRaw || "").trim();
    const scope = (scopeRaw || "").trim().toLowerCase();
    if (!channelId || !VALID_QUEUE_SCOPES.has(scope)) continue;
    policies.push({ channelId, scope: scope as QueueChannelPolicy["scope"] });
  }
  const deduped = new Map<string, QueueChannelPolicy>();
  for (const policy of policies) deduped.set(policy.channelId, policy);
  return [...deduped.values()];
}

function parseIdList(rawValue?: string): string[] {
  if (!rawValue) return [];
  return Array.from(
    new Set(
      rawValue
        .split(",")
        .map((item) => item.trim())
        .filter((item) => /^\d{17,20}$/.test(item)),
    ),
  );
}

export const config = {
  TOKEN: ENVIRONMENT === "development" ? process.env.TOKEN_DEV : process.env.TOKEN,
  CLIENT_ID:
    ENVIRONMENT === "development" ? process.env.CLIENT_ID_DEV : process.env.CLIENT_ID,
  GUILD_ID:
    ENVIRONMENT === "development" ? process.env.GUILD_ID_DEV : process.env.GUILD_ID,
  ENVIRONMENT,
  INTENT_OPTIONS: ["GUILDS"],
  PREFIX: "!",
  ALLOWED_CHANNELS: ["bot-experiments", "pickup"],
  OUTPUT_CHANNEL:
    ENVIRONMENT === "development"
      ? process.env.OUTPUT_CHANNEL_DEV_ID
      : process.env.OUTPUT_CHANNEL_ID,
  EXPIRE_AFTER_TIME_IN_MINUTES: process.env.EXPIRE_AFTER_TIME_IN_MINUTES
    ? parseInt(process.env.EXPIRE_AFTER_TIME_IN_MINUTES, 10)
    : 60,
  WARN_AFTER_TIME_IN_MINUTES: process.env.WARN_AFTER_TIME_IN_MINUTES
    ? parseInt(process.env.WARN_AFTER_TIME_IN_MINUTES, 10)
    : 60,
  DATA_PATH: process.env.DATA_PATH,
  BUILD_PATH: process.env.BUILD_PATH,
  LOGGING_LEVEL: process.env.LOGGING_LEVEL
    ? parseInt(process.env.LOGGING_LEVEL, 10)
    : 10,
  RCL_API_URL: process.env.RCL_API_URL,
  RCL_API_KEY: process.env.RCL_API_KEY,
  QUEUE_THREAD_IDS: process.env.QUEUE_THREAD_IDS,
  QUEUE_THREAD_POLL_MS: process.env.QUEUE_THREAD_POLL_MS
    ? parseInt(process.env.QUEUE_THREAD_POLL_MS, 10)
    : 3000,
  QUEUE_THREAD_POP_LIMIT: process.env.QUEUE_THREAD_POP_LIMIT
    ? parseInt(process.env.QUEUE_THREAD_POP_LIMIT, 10)
    : 20,
  QUEUE_CHANNEL_POLICIES: parseQueueChannelPolicies(
    ENVIRONMENT === "development"
      ? process.env.QUEUE_CHANNEL_POLICIES_DEV || process.env.QUEUE_CHANNEL_POLICIES
      : process.env.QUEUE_CHANNEL_POLICIES,
  ),
  FORT_TIER_SHEET_URL:
    process.env.FORT_TIER_SHEET_URL ||
    "https://docs.google.com/spreadsheets/d/1u4Mbw7bwneDtldaFERgXK6CdV5B830jKWTXs2tTzi2o/edit?gid=0#gid=0",
  FORT_TIER_WORKSHEET_NAME: process.env.FORT_TIER_WORKSHEET_NAME || "Sheet1",
  FORT_TIER_GOOGLE_CREDENTIALS_PATH: process.env.FORT_TIER_GOOGLE_CREDENTIALS_PATH,
  FORT_TIER_GOOGLE_CREDENTIALS_JSON: process.env.FORT_TIER_GOOGLE_CREDENTIALS_JSON,
  FORT_TIER_ADMIN_IDS: parseIdList(
    process.env.FORT_TIER_ADMIN_IDS ||
      "257093496891113482,397820413545152524,219502124709445633",
  ),
  AGENT_ASK_ROLE_NAMES: (process.env.AGENT_ASK_ROLE_NAMES || "rcl-internal,rcl-dev,rcl-founder")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  AGENT_ASK_ROLE_IDS: parseIdList(
    process.env.AGENT_ASK_ROLE_IDS ||
      "1471583957647753397,1471568313019666442,1510679062828290078",
  ),
  /** Full agent (write) mode without confirmation. */
  AGENT_WRITE_ROLE_IDS: parseIdList(
    process.env.AGENT_WRITE_ROLE_IDS || "1510679062828290078",
  ),
  /** May use agent mode after confirming — defaults to ask mode otherwise. */
  AGENT_WRITE_CONFIRM_ROLE_IDS: parseIdList(
    process.env.AGENT_WRITE_CONFIRM_ROLE_IDS ||
      "1471583957647753397,1471568313019666442",
  ),
};

export const CLIENT_OPTIONS: ClientOptions = {
  allowedMentions: { parse: ["roles", "users"], repliedUser: true },
  caseInsensitiveCommands: true,
  caseInsensitivePrefixes: true,
  defaultPrefix: config.PREFIX,
  disableMentionPrefix: true,
  intents: [
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
    Partials.User,
  ],
  loadDefaultErrorListeners: true,
  loadMessageCommandListeners: true,
  logger: {
    level: config.LOGGING_LEVEL,
  },
};
