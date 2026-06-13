import { Listener } from "@sapphire/framework"
import { Events, type Message, type TextChannel } from "discord.js"

import { askDashboardAgent, type DashboardAgentMode } from "../core/rclQueueApi"
import { config } from "../config/config"

const DISCORD_MESSAGE_LIMIT = 2000
const SESSION_TTL_MS = 30 * 60 * 1000
const TYPING_REFRESH_MS = 8000

const DISCORD_FORMAT_RULES = [
  "Format for Discord (Discord does NOT render markdown pipe tables):",
  "- Never use | table | syntax — it shows as broken pipes in chat.",
  "- Use bullet lists for stat comparisons: • **K/D** — last 10: **1.17** · season: **1.09**",
  "- Use ``` fenced code blocks for match-by-match lines when alignment helps.",
  "- Use **bold** for key numbers; inline \"X vs Y\" phrasing for comparisons.",
].join("\n")

type SessionEntry = { sessionId: string; updatedAt: number }

const sessionsByUserId = new Map<string, SessionEntry>()

function hasAgentAskAccess(member: NonNullable<Message["member"]>): boolean {
  if (config.AGENT_ASK_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId))) {
    return true
  }
  return member.roles.cache.some((role) =>
    config.AGENT_ASK_ROLE_NAMES.some(
      (name) => role.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0,
    ),
  )
}

function extractQuestion(message: Message, botUserId: string): string {
  const mentionPattern = new RegExp(`<@!?${botUserId}>`, "g")
  return message.content.replace(mentionPattern, "").replace(/\s+/g, " ").trim()
}

function parseDiscordAgentModeTrigger(text: string): {
  mode: DashboardAgentMode
  message: string
} {
  const trimmed = text.trim()
  const triggers: Array<{ pattern: RegExp; mode: DashboardAgentMode }> = [
    { pattern: /^\/agent\s+/i, mode: "agent" },
    { pattern: /^agent:\s*/i, mode: "agent" },
    { pattern: /^\[agent\]\s*/i, mode: "agent" },
    { pattern: /^agent mode[:\s]+/i, mode: "agent" },
  ]

  for (const { pattern, mode } of triggers) {
    if (pattern.test(trimmed)) {
      return { mode, message: trimmed.replace(pattern, "").trim() }
    }
  }

  return { mode: "ask", message: trimmed }
}

function memberDiscordRoleIds(member: NonNullable<Message["member"]>): string[] {
  return [...member.roles.cache.keys()].filter((roleId) => roleId !== member.guild.id)
}

function memberDiscordRoles(member: NonNullable<Message["member"]>): Array<{ id: string; name: string }> {
  return [...member.roles.cache.values()]
    .filter((role) => role.id !== member.guild.id)
    .map((role) => ({ id: role.id, name: role.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function canUseAgentWriteMode(member: NonNullable<Message["member"]>): boolean {
  const roleIds = memberDiscordRoleIds(member)
  const allowed = new Set([
    ...config.AGENT_WRITE_ROLE_IDS,
    ...config.AGENT_WRITE_CONFIRM_ROLE_IDS,
  ])
  return roleIds.some((roleId) => allowed.has(roleId))
}

function isGameplayStatsQuestion(text: string): boolean {
  return /gameplay|my stats|analyze my|how (did|have) i (play|done|perform)|this week|week start|last \d+ days|match history|weekly|performance|my tst|my fort|my sumobar|elo trend|k\/d/i.test(
    text,
  )
}

function inferSinceFromQuestion(question: string): string {
  const text = question.toLowerCase()
  if (/week start|this week|since monday|from monday/.test(text)) return "week"
  if (/this month|month start/.test(text)) return "month"
  const days = text.match(/last (\d+) days?/)
  if (days) return `${days[1]}d`
  if (/today|last 24|past day/.test(text)) return "1d"
  return "week"
}

function buildDiscordAgentContextBlock(
  member: NonNullable<Message["member"]>,
  mode: DashboardAgentMode,
): string {
  const roles = memberDiscordRoles(member)
  const roleNames = roles.map((role) => role.name).join(", ") || "(none)"
  const roleIds = roles.map((role) => role.id).join(", ") || "(none)"
  const writeAuthorized = canUseAgentWriteMode(member)
  const modeLine =
    mode === "agent"
      ? "agent (write — file edits, shell, deploy allowed)"
      : "ask (read-only Q&A)"

  const lines = [
    "Discord session context (pre-validated at the bot gate — do not re-check permissions):",
    `• Discord user: ${member.user.username} (${member.id})`,
    `• Discord roles: ${roleNames}`,
    `• Role IDs: ${roleIds}`,
    `• Agent mode: ${modeLine}`,
    `• /agent write access granted: ${writeAuthorized ? "yes" : "no"}`,
  ]

  if (mode === "agent" && writeAuthorized) {
    lines.push(
      "• You have full agent (write) access for this request. Execute it — edit files, run commands, deploy if needed. Do not refuse for lack of permissions.",
    )
  }

  return lines.join("\n")
}

function buildGameplayStatsFastPathBlock(
  member: NonNullable<Message["member"]>,
  question: string,
): string {
  const since = inferSinceFromQuestion(question)
  const username = encodeURIComponent(member.user.username)
  return [
    "Player stats — mandatory fast path (do this before any codebase search):",
    "1. Active dashboard port: grep server line in /etc/nginx/rcl-upstreams/rcl-dashboard-upstream-active.conf",
    "2. QUEUE_API_KEY: /data/rcl/rcl-dashboard/.env.local",
    `3. ONE curl: GET /api/queue/bot/discord/gameplay-summary?discordUserId=${member.id}&discordUsername=${username}&since=${since}`,
    "4. Analyze JSON (periodTotals, tst.period, hints) and reply — no armanelgtron HTML scraping or ad-hoc psql.",
    "5. Season-wide (not period): GET /api/queue/bot/discord/profile with same discord params.",
  ].join("\n")
}

function buildAgentReplyInstructions(mode: DashboardAgentMode): string {
  if (mode === "agent") {
    return [
      "Reply in Discord-friendly markdown after completing the work.",
      "Summarize what you changed or ran; omit tool narration and wrappers like \"Reply for <user>\".",
      "",
      DISCORD_FORMAT_RULES,
    ].join("\n")
  }

  return [
    "Reply directly in Discord-friendly markdown. Do not include planning, analysis, tool narration, or wrappers like \"Reply for <user>\" — only the final answer the user should see.",
    "",
    DISCORD_FORMAT_RULES,
  ].join("\n")
}

function getSessionForUser(userId: string): string | undefined {
  const entry = sessionsByUserId.get(userId)
  if (!entry) return undefined
  if (Date.now() - entry.updatedAt > SESSION_TTL_MS) {
    sessionsByUserId.delete(userId)
    return undefined
  }
  return entry.sessionId
}

function rememberSession(userId: string, sessionId: string): void {
  sessionsByUserId.set(userId, { sessionId, updatedAt: Date.now() })
}

function splitForDiscord(text: string): string[] {
  if (text.length <= DISCORD_MESSAGE_LIMIT) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > DISCORD_MESSAGE_LIMIT) {
    let splitAt = remaining.lastIndexOf("\n", DISCORD_MESSAGE_LIMIT)
    if (splitAt < DISCORD_MESSAGE_LIMIT / 2) {
      splitAt = remaining.lastIndexOf(" ", DISCORD_MESSAGE_LIMIT)
    }
    if (splitAt < DISCORD_MESSAGE_LIMIT / 2) {
      splitAt = DISCORD_MESSAGE_LIMIT
    }
    chunks.push(remaining.slice(0, splitAt).trim())
    remaining = remaining.slice(splitAt).trim()
  }
  if (remaining) chunks.push(remaining)
  return chunks
}

async function withTypingIndicator<T>(channel: TextChannel, work: () => Promise<T>): Promise<T> {
  const refreshTyping = () => {
    void channel.sendTyping().catch(() => undefined)
  }
  refreshTyping()
  const interval = setInterval(refreshTyping, TYPING_REFRESH_MS)
  try {
    return await work()
  } finally {
    clearInterval(interval)
  }
}

export class AgentMentionListener extends Listener<typeof Events.MessageCreate> {
  public constructor(context: Listener.Context, options: Listener.Options) {
    super(context, { ...options, event: Events.MessageCreate })
  }

  public async run(message: Message): Promise<void> {
    if (message.author.bot || !message.guild || !message.member) return
    if (!message.mentions.users.has(this.container.client.user!.id)) return
    if (message.content.startsWith("!")) return
    if (!hasAgentAskAccess(message.member)) return

    const rawQuestion = extractQuestion(message, this.container.client.user!.id)
    if (!rawQuestion) {
      await message.reply("Mention me with a question, e.g. `@RCL Bot what does the queue API do?`")
      return
    }

    const { mode, message: question } = parseDiscordAgentModeTrigger(rawQuestion)
    if (mode === "agent" && !canUseAgentWriteMode(message.member)) {
      await message.reply(
        "Full agent mode (file edits + deploy) requires an authorized role. Use default ask mode for read-only Q&A, or prefix with `/agent` only if you have write access.",
      )
      return
    }

    const existingSessionId = getSessionForUser(message.author.id)
    const contextBlock = buildDiscordAgentContextBlock(message.member, mode)
    const promptParts = [contextBlock]
    if (isGameplayStatsQuestion(question)) {
      promptParts.push("", buildGameplayStatsFastPathBlock(message.member, question))
    }
    promptParts.push(
      "",
      `Question from Discord user ${message.author.username} (${message.author.id}):`,
      question,
      "",
      buildAgentReplyInstructions(mode),
    )
    const prompt = promptParts.join("\n")

    const channel = message.channel
    if (!channel.isTextBased() || channel.isDMBased()) return

    try {
      const result = await withTypingIndicator(channel as TextChannel, () =>
        askDashboardAgent({
          message: prompt,
          sessionId: existingSessionId,
          mode,
          discordRoleIds: memberDiscordRoleIds(message.member!),
        }),
      )
      rememberSession(message.author.id, result.sessionId)
      const answer = result.answer.trim() || "The agent did not return an answer."
      const chunks = splitForDiscord(answer)
      await message.reply(chunks[0])
      for (let i = 1; i < chunks.length; i += 1) {
        await channel.send(chunks[i])
      }
    } catch (error) {
      this.container.logger.warn(`Agent ask failed for ${message.author.id}: ${error}`)
      const msg = String(error)
      if (msg.includes("timed out") || msg.includes("AbortError")) {
        await message.reply(
          "That question took too long (over ~15 minutes). Try a narrower ask — e.g. one match, one mode, or last 3 days — and mention me again.",
        )
        return
      }
      await message.reply("Sorry, the dashboard agent failed to answer that question. Try again in a minute.")
    }
  }
}
