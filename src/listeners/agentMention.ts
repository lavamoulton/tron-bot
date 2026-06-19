import { Listener } from "@sapphire/framework"
import { Events, type Message, type TextChannel } from "discord.js"

import {
  cleanupDownloadedDiscordAgentAttachments,
  downloadDiscordAgentAttachments,
} from "../core/discordAgentAttachments"
import {
  buildCaptureContextBlock,
  buildTriageInstructionBlock,
  captureChannelContext,
  parseAgentDirectives,
} from "../core/discordContextCapture"
import { askDashboardAgent, AGENT_ASK_TIMEOUT_MS, type DashboardAgentMode } from "../core/rclQueueApi"
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

/** Sessions keyed by user+mode so ask-born sessions never block later /agent writes. */
const sessionsByUserAndMode = new Map<string, SessionEntry>()

function sessionKey(userId: string, mode: DashboardAgentMode): string {
  return `${userId}:${mode}`
}

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

function canUseLinearWriteMode(member: NonNullable<Message["member"]>): boolean {
  if (canUseAgentWriteMode(member)) return true
  const roleIds = memberDiscordRoleIds(member)
  if (config.AGENT_LINEAR_WRITE_ROLE_IDS.some((roleId) => roleIds.includes(roleId))) {
    return true
  }
  return member.roles.cache.some((role) =>
    config.AGENT_LINEAR_WRITE_ROLE_NAMES.some(
      (name) => role.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0,
    ),
  )
}

function resolveEffectiveAgentMode(
  member: NonNullable<Message["member"]>,
  question: string,
  parsedMode: DashboardAgentMode,
): { mode: DashboardAgentMode; linearWriteAuthorized: boolean } {
  if (parsedMode === "agent") {
    return { mode: "agent", linearWriteAuthorized: canUseLinearWriteMode(member) }
  }
  const linearWriteAuthorized = canUseLinearWriteMode(member)
  if (linearWriteAuthorized && isProjectManagementQuestion(question)) {
    return { mode: "linear", linearWriteAuthorized: true }
  }
  return { mode: "ask", linearWriteAuthorized: false }
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
  const linearWriteAuthorized = canUseLinearWriteMode(member)
  const modeLine =
    mode === "agent"
      ? "agent (write — file edits, shell, deploy allowed)"
      : mode === "linear"
        ? "linear (Linear MCP writes — issues, projects, statuses; no repo/deploy)"
        : "ask (read-only Q&A)"

  const lines = [
    "Discord session context (pre-validated at the bot gate — do not re-check permissions):",
    `• Discord user: ${member.user.username} (${member.id})`,
    `• Discord roles: ${roleNames}`,
    `• Role IDs: ${roleIds}`,
    `• Agent mode: ${modeLine}`,
    `• /agent write access granted: ${writeAuthorized ? "yes" : "no"}`,
    `• Linear write access granted: ${linearWriteAuthorized ? "yes" : "no"}`,
  ]

  if (mode === "agent" && writeAuthorized) {
    lines.push(
      "• You have full agent (write) access for this request. Execute it — edit files, run commands, deploy if needed. Do not refuse for lack of permissions.",
    )
  }

  if (mode === "linear" && linearWriteAuthorized) {
    lines.push(
      "• You have Linear write access. Execute PM actions via Linear MCP (create/update issues, projects, comments, statuses, priorities, assignees). Do NOT edit repo files, run deploys, or change infrastructure — use /agent for code/deploy work.",
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

function isProjectManagementQuestion(text: string): boolean {
  return /linear|backlog|sprint|milestone|roadmap priority|project management|what('s| is) next|in progress|blocked|blocker|open issues?|create (an? )?(issue|ticket|task)|file (an? )?(issue|ticket|bug)|project status|who('s| is) working on|priorit(y|ies)|assignee|ticket|task board|kanban|RCL-\d+/i.test(
    text,
  )
}

function buildLinearProjectManagementBlock(mode: DashboardAgentMode): string {
  const lines = [
    "Project management — RCL uses Linear (mandatory):",
    "• Use Linear MCP tools (list_issues, get_issue, create_issue, update_issue, list_projects, etc.) — not GitHub Issues or ROADMAP.md alone.",
    "• ROADMAP.md = vision; DEVLOG.md = changelog; Linear = actionable backlog and status.",
    "• Query Linear first, then answer or act. See docs/LINEAR_MCP.md on the dashboard host.",
  ]
  if (mode === "linear") {
    lines.push(
      "• This request runs in linear write mode — execute create/update/close/seed actions via Linear MCP; do not tell the user to switch to /agent for PM work.",
    )
  }
  return lines.join("\n")
}

function buildAgentReplyInstructions(mode: DashboardAgentMode): string {
  if (mode === "agent" || mode === "linear") {
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

function getSessionForUser(userId: string, mode: DashboardAgentMode): string | undefined {
  const key = sessionKey(userId, mode)
  const entry = sessionsByUserAndMode.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.updatedAt > SESSION_TTL_MS) {
    sessionsByUserAndMode.delete(key)
    return undefined
  }
  return entry.sessionId
}

function rememberSession(userId: string, mode: DashboardAgentMode, sessionId: string): void {
  sessionsByUserAndMode.set(sessionKey(userId, mode), { sessionId, updatedAt: Date.now() })
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
    const attachments = await downloadDiscordAgentAttachments(message.attachments, message.id)
    if (!rawQuestion && !attachments.length) {
      await message.reply(
        "Mention me with a question or attach an image (png/jpg/gif/webp, up to 8 MB).",
      )
      return
    }

    const { mode: parsedMode, message: triggerText } = parseDiscordAgentModeTrigger(rawQuestion || "")
    const directives = parseAgentDirectives(triggerText)

    const channel = message.channel
    if (!channel.isTextBased() || channel.isDMBased()) {
      await cleanupDownloadedDiscordAgentAttachments(attachments)
      return
    }

    let effectiveQuestion = directives.residual
    if (!effectiveQuestion) {
      if (directives.triage) {
        effectiveQuestion = "Triage the captured Discord conversation below."
      } else if (directives.capture) {
        effectiveQuestion =
          "Read and reason over the captured Discord conversation below, then summarize the key points and anything notable."
      } else if (attachments.length) {
        effectiveQuestion =
          "(No text — user sent image attachment(s) only. Use the Read tool on the attached paths and respond to what you see.)"
      }
    }
    if (!effectiveQuestion) {
      await cleanupDownloadedDiscordAgentAttachments(attachments)
      await message.reply(
        "Mention me with a question, or pull channel context with e.g. `/agent /capture days=14 /triage`.",
      )
      return
    }

    if (parsedMode === "agent" && !canUseAgentWriteMode(message.member)) {
      await cleanupDownloadedDiscordAgentAttachments(attachments)
      await message.reply(
        "Full agent mode (file edits + deploy) requires an authorized role. Use default ask mode for read-only Q&A, or prefix with `/agent` only if you have write access.",
      )
      return
    }

    const { mode, linearWriteAuthorized } = resolveEffectiveAgentMode(
      message.member,
      effectiveQuestion,
      parsedMode,
    )

    let captureBlock: string | null = null
    if (directives.capture) {
      try {
        void channel.sendTyping().catch(() => undefined)
        const captured = await captureChannelContext(channel, directives.capture, message.id)
        captureBlock = buildCaptureContextBlock(captured, directives.capture)
        this.container.logger.info(
          `Agent capture user=${message.author.id} msg=${message.id} window=${directives.capture.windowLabel} messages=${captured.messageCount} truncated=${captured.truncated}`,
        )
      } catch (error) {
        this.container.logger.warn(
          `Agent capture failed user=${message.author.id} msg=${message.id}: ${error}`,
        )
        await cleanupDownloadedDiscordAgentAttachments(attachments)
        await message.reply(
          "I couldn't read this channel's history (I may be missing the **Read Message History** permission here, or it timed out). Grant it and try again.",
        )
        return
      }
    }

    const existingSessionId = getSessionForUser(message.author.id, mode)
    const contextBlock = buildDiscordAgentContextBlock(message.member, mode)
    const promptParts = [contextBlock]
    if (captureBlock) {
      promptParts.push("", captureBlock)
    }
    if (isGameplayStatsQuestion(effectiveQuestion)) {
      promptParts.push("", buildGameplayStatsFastPathBlock(message.member, effectiveQuestion))
    }
    if (isProjectManagementQuestion(effectiveQuestion) || (directives.triage && linearWriteAuthorized)) {
      promptParts.push("", buildLinearProjectManagementBlock(mode))
    }
    if (directives.triage) {
      promptParts.push("", buildTriageInstructionBlock(linearWriteAuthorized))
    }
    promptParts.push(
      "",
      `Question from Discord user ${message.author.username} (${message.author.id}):`,
      effectiveQuestion,
      "",
      buildAgentReplyInstructions(mode),
    )
    const prompt = promptParts.join("\n")

    const askStartedAt = Date.now()
    const questionPreview =
      effectiveQuestion.length > 80 ? `${effectiveQuestion.slice(0, 77)}…` : effectiveQuestion
    this.container.logger.info(
      `Agent ask started user=${message.author.id} msg=${message.id} mode=${mode} attachments=${attachments.length} q="${questionPreview}"`,
    )

    try {
      const result = await withTypingIndicator(channel as TextChannel, () =>
        askDashboardAgent({
          message: prompt,
          sessionId: existingSessionId,
          mode,
          discordRoleIds: memberDiscordRoleIds(message.member!),
          linearWriteAuthorized,
          attachments,
        }),
      )
      rememberSession(message.author.id, mode, result.sessionId)
      const answer = result.answer.trim() || "The agent did not return an answer."
      const chunks = splitForDiscord(answer)
      await message.reply(chunks[0])
      for (let i = 1; i < chunks.length; i += 1) {
        await channel.send(chunks[i])
      }
      this.container.logger.info(
        `Agent ask replied user=${message.author.id} msg=${message.id} chunks=${chunks.length} agentMs=${result.durationMs} totalMs=${Date.now() - askStartedAt}`,
      )
    } catch (error) {
      await cleanupDownloadedDiscordAgentAttachments(attachments)
      const elapsedMs = Date.now() - askStartedAt
      const msg = String(error)
      const aborted = msg.includes("AbortError") || msg.includes("aborted")
      this.container.logger.warn(
        `Agent ask failed user=${message.author.id} msg=${message.id} elapsedMs=${elapsedMs} aborted=${aborted}: ${error}`,
      )
      if (aborted && elapsedMs < AGENT_ASK_TIMEOUT_MS - 60_000) {
        await message.reply(
          "The bot restarted while that question was in flight, so the answer never reached Discord. Please mention me again — the agent may have already finished on the server.",
        )
        return
      }
      if (msg.includes("timed out") || aborted) {
        await message.reply(
          "That question took too long (over ~15 minutes). Try a narrower ask — e.g. one match, one mode, or last 3 days — and mention me again.",
        )
        return
      }
      await message.reply("Sorry, the dashboard agent failed to answer that question. Try again in a minute.")
    }
  }
}
