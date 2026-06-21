import { mkdir, rm, writeFile } from "fs/promises";
import { dirname, join } from "path";
import type { Attachment, Collection } from "discord.js";

const STAGING_ROOT = "/data/rcl/rcl-dashboard/.rcl-data/discord-agent-attachments";
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENT_COUNT = 4;

const ALLOWED_CONTENT_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/webp",
    "image/avif",
]);

export type DiscordAgentAttachment = {
    path: string;
    name: string;
    contentType: string;
};

function sanitizeFilename(name: string): string {
    const trimmed = name.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
    return trimmed.slice(0, 120) || "attachment";
}

function isAllowedAttachment(attachment: Attachment): boolean {
    const contentType = (attachment.contentType || "").toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) return false;
    if (attachment.size <= 0 || attachment.size > MAX_ATTACHMENT_BYTES) return false;
    return true;
}

export async function downloadDiscordAgentAttachments(
    attachments: Collection<string, Attachment>,
    messageId: string,
): Promise<DiscordAgentAttachment[]> {
    const eligible = [...attachments.values()]
        .filter(isAllowedAttachment)
        .slice(0, MAX_ATTACHMENT_COUNT);

    if (!eligible.length) return [];

    const safeMessageId = messageId.replace(/[^0-9]/g, "") || "unknown";
    const stagingDir = join(STAGING_ROOT, safeMessageId);
    await mkdir(stagingDir, { recursive: true });

    const saved: DiscordAgentAttachment[] = [];
    for (const attachment of eligible) {
        const contentType = (attachment.contentType || "").toLowerCase();
        const filename = `${attachment.id}-${sanitizeFilename(attachment.name || "attachment")}`;
        const targetPath = join(stagingDir, filename);

        const response = await fetch(attachment.url);
        if (!response.ok) continue;

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength <= 0 || buffer.byteLength > MAX_ATTACHMENT_BYTES) continue;

        await writeFile(targetPath, buffer);
        saved.push({
            path: targetPath,
            name: attachment.name || filename,
            contentType,
        });
    }

    return saved;
}

export async function cleanupDownloadedDiscordAgentAttachments(
    attachments: DiscordAgentAttachment[],
): Promise<void> {
    const dirs = new Set(
        attachments
            .map((attachment) => dirname(attachment.path))
            .filter((dir) => dir.startsWith(STAGING_ROOT)),
    );
    for (const dir of dirs) {
        try {
            await rm(dir, { recursive: true, force: true });
        } catch {
            // ignore cleanup failures
        }
    }
}
