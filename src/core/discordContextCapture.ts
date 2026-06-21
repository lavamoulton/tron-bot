import type { Message, TextBasedChannel } from "discord.js"

/**
 * Discord context capture for the @RCL agent.
 *
 * Lets an authorized user pull recent channel history into the agent prompt so
 * it can reason over days of conversation, e.g.:
 *   @RCL /agent /capture days=14 /triage
 *
 * `/capture` fetches the channel transcript over a timeframe; `/triage` asks the
 * agent to extract bugs / requests / decisions / action items from it.
 */

const DEFAULT_DAYS = 7
const MAX_DAYS = 30
const DEFAULT_MAX_MESSAGES = 600
const HARD_MAX_MESSAGES = 1500
const FETCH_PAGE_SIZE = 100
/** Keep the transcript well under the agent prompt budget. */
const MAX_TRANSCRIPT_CHARS = 45_000
const MAX_LINE_CHARS = 600

export type CaptureOptions = {
  /** Lookback window in milliseconds. */
  windowMs: number
  /** Human-readable window label, e.g. "14 days". */
  windowLabel: string
  /** Hard cap on number of messages pulled. */
  maxMessages: number
}

export type ParsedAgentDirectives = {
  capture: CaptureOptions | null
  triage: boolean
  /** The remaining free-text instruction after directives are stripped. */
  residual: string
}

export type CapturedContext = {
  channelName: string
  transcript: string
  messageCount: number
  oldestAt: Date | null
  newestAt: Date | null
  truncated: boolean
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function formatWindowLabel(days: number, hours: number): string {
  const parts: string[] = []
  if (days > 0) parts.push(`${days} day${days === 1 ? "" : "s"}`)
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`)
  return parts.join(" ") || `${DEFAULT_DAYS} days`
}

function parseCaptureOptions(optionText: string): CaptureOptions {
  const text = optionText.toLowerCase()
  const daysMatch = text.match(/\bdays?\s*=\s*(\d+(?:\.\d+)?)/)
  const hoursMatch = text.match(/\bhours?\s*=\s*(\d+(?:\.\d+)?)/)
  const limitMatch = text.match(/\b(?:limit|messages|msgs)\s*=\s*(\d+)/)

  let days = daysMatch ? Number(daysMatch[1]) : NaN
  let hours = hoursMatch ? Number(hoursMatch[1]) : NaN
  if (!Number.isFinite(days) && !Number.isFinite(hours)) {
    days = DEFAULT_DAYS
    hours = 0
  } else {
    days = Number.isFinite(days) ? days : 0
    hours = Number.isFinite(hours) ? hours : 0
  }

  const totalDays = clampNumber(days + hours / 24, 0, MAX_DAYS)
  const windowMs = Math.max(60 * 60 * 1000, totalDays * 24 * 60 * 60 * 1000)
  const cappedDays = Math.floor(totalDays)
  const cappedHours = Math.round((totalDays - cappedDays) * 24)

  const maxMessages = limitMatch
    ? clampNumber(Number(limitMatch[1]), 1, HARD_MAX_MESSAGES)
    : DEFAULT_MAX_MESSAGES

  return {
    windowMs,
    windowLabel: formatWindowLabel(cappedDays, cappedHours),
    maxMessages,
  }
}

/**
 * Pull `/capture` and `/triage` directives out of the question text and return
 * the leftover instruction. Directives may appear anywhere in the message.
 */
export function parseAgentDirectives(text: string): ParsedAgentDirectives {
  let residual = text
  let capture: CaptureOptions | null = null
  let triage = false

  const captureMatch = residual.match(/\/capture\b([^/]*)/i)
  if (captureMatch) {
    capture = parseCaptureOptions(captureMatch[1] || "")
    residual = residual.replace(captureMatch[0], " ")
  }

  if (/\/triage\b/i.test(residual)) {
    triage = true
    residual = residual.replace(/\/triage\b/gi, " ")
  }

  // Triage is meaningless without a transcript — default to a capture window.
  if (triage && !capture) {
    capture = parseCaptureOptions("")
  }

  residual = residual.replace(/\s+/g, " ").trim()
  return { capture, triage, residual }
}

function messageDisplayName(message: Message): string {
  const nickname = message.member?.displayName
  if (nickname && nickname.trim()) return nickname.trim()
  return message.author.username
}

function describeNonText(message: Message): string[] {
  const notes: string[] = []
  for (const attachment of message.attachments.values()) {
    const kind = (attachment.contentType || "file").split("/")[0]
    notes.push(`[${kind}: ${attachment.name || "attachment"}]`)
  }
  for (const embed of message.embeds) {
    const title = embed.title || embed.author?.name || embed.description
    if (title) notes.push(`[embed: ${title.slice(0, 80)}]`)
  }
  if (message.stickers.size > 0) {
    notes.push(`[sticker: ${[...message.stickers.values()].map((s) => s.name).join(", ")}]`)
  }
  return notes
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function formatLine(message: Message): string | null {
  const author = messageDisplayName(message)
  const body = (message.cleanContent || message.content || "").replace(/\s+/g, " ").trim()
  const extras = describeNonText(message)
  const content = [body, extras.join(" ")].filter(Boolean).join(" ").trim()
  if (!content) return null
  const stamp = formatTimestamp(message.createdAt)
  const line = `[${stamp} UTC] ${author}: ${content}`
  return line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS - 1)}…` : line
}

/**
 * Fetch the channel transcript over the capture window, oldest → newest, with
 * caps on message count and total characters.
 */
export async function captureChannelContext(
  channel: TextBasedChannel,
  options: CaptureOptions,
  excludeMessageId?: string,
): Promise<CapturedContext> {
  const cutoff = Date.now() - options.windowMs
  const collected: Message[] = []
  let before: string | undefined

  while (collected.length < options.maxMessages) {
    const batch = await channel.messages.fetch({ limit: FETCH_PAGE_SIZE, before })
    if (batch.size === 0) break

    let reachedCutoff = false
    for (const message of batch.values()) {
      if (message.createdTimestamp < cutoff) {
        reachedCutoff = true
        continue
      }
      if (excludeMessageId && message.id === excludeMessageId) continue
      collected.push(message)
    }

    before = batch.lastKey()
    if (reachedCutoff || batch.size < FETCH_PAGE_SIZE) break
  }

  collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp)

  const lines: string[] = []
  for (const message of collected) {
    const line = formatLine(message)
    if (line) lines.push(line)
  }

  let truncated = false
  while (lines.join("\n").length > MAX_TRANSCRIPT_CHARS && lines.length > 1) {
    lines.shift()
    truncated = true
  }

  const channelName = "name" in channel && channel.name ? `#${channel.name}` : "this channel"
  const oldestAt = lines.length ? new Date(collected[collected.length - lines.length].createdTimestamp) : null
  const newestAt = collected.length ? new Date(collected[collected.length - 1].createdTimestamp) : null

  return {
    channelName,
    transcript: lines.join("\n"),
    messageCount: lines.length,
    oldestAt,
    newestAt,
    truncated,
  }
}

export function buildCaptureContextBlock(context: CapturedContext, options: CaptureOptions): string {
  if (!context.messageCount) {
    return [
      `Captured Discord context — ${context.channelName}, last ${options.windowLabel}:`,
      "(No messages found in that window. Tell the user the channel had nothing to capture in that timeframe.)",
    ].join("\n")
  }

  const range =
    context.oldestAt && context.newestAt
      ? ` (oldest ${formatTimestamp(context.oldestAt)} → newest ${formatTimestamp(context.newestAt)} UTC)`
      : ""
  const truncationNote = context.truncated
    ? " The oldest messages were dropped to fit the size limit — note this if it matters."
    : ""

  return [
    `Captured Discord context — ${context.channelName}, ${context.messageCount} messages over the last ${options.windowLabel}${range}:`,
    "Treat this transcript as the primary source for the request below. Names are Discord display names; one line per message." +
      truncationNote,
    "--- BEGIN TRANSCRIPT ---",
    context.transcript,
    "--- END TRANSCRIPT ---",
  ].join("\n")
}

export function buildTriageInstructionBlock(linearWriteAuthorized: boolean): string {
  const lines = [
    "Triage task — analyze the captured transcript above and produce an organized triage:",
    "• Group findings by theme. For each item give: a one-line summary, who raised it (Discord name), and a suggested priority (P0–P3).",
    "• Categorize into: bugs/regressions, feature requests, decisions made, open questions, and concrete action items.",
    "• Skip pure chatter, queue spam, and greetings. Focus on actionable signal.",
    "• End with a short prioritized 'Top 3 next actions' list.",
  ]
  if (linearWriteAuthorized) {
    lines.push(
      "• You have Linear write access: dedupe each candidate against existing Linear issues first (search before creating). Only create/update issues if the user explicitly asked you to file them; otherwise present them as a checklist of proposed issues for confirmation.",
    )
  } else {
    lines.push(
      "• Present results as a checklist. Do not claim to have filed anything — you do not have write access in this request.",
    )
  }
  return lines.join("\n")
}
