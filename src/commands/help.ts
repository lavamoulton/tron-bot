import { Command, container } from "@sapphire/framework";
import { EmbedBuilder, type Message } from "discord.js";

const COMMAND_ENABLED = true;
const COMMAND_NAME = "help";
const COMMAND_DESCRIPTION = "Show pickup help and etiquette";
const BRAND_ICON_URL = "https://hub.retrocyclesleague.com/icons/icon-192.png";
const LEADERBOARD_LINK = "[Leaderboard](https://hub.retrocyclesleague.com/leaderboard)";
const LANE_SUMMARY =
    "Beginner is for newer/lower-rated players, Pro is for high-rated players, Open is for everyone and extra modes.";

export class HelpCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
            preconditions: ["DMChannel"],
        });
    }

    public async messageRun(message: Message) {
        const { author } = message;
        const content = message.content;
        const embed = new EmbedBuilder()
            .setColor(0x22d3ee)
            .setAuthor({
                name: "RCL Pickup",
                url: "https://hub.retrocyclesleague.com/leaderboard",
                iconURL: BRAND_ICON_URL,
            })
            .setDescription(`${LANE_SUMMARY}\n\n${LEADERBOARD_LINK}`)
            .addFields(
                {
                    name: "Queue",
                    value: [
                        "`!add <mode>` — join",
                        "`!remove [mode]` — leave",
                        "`!who` — queue overview",
                        "`!me` — your profile and stats",
                    ].join("\n"),
                    inline: false,
                },
                {
                    name: "Modes",
                    value: [
                        "`tst` — 2v2v2v2 Team Sumo",
                        "`sumobar` — solo 8-player Sumo",
                    ].join("\n"),
                    inline: false,
                },
                {
                    name: "Open Queue Only",
                    value: [
                        "`fort` — 6v6 Fortress",
                        "`wst` — 3v3 Sumo",
                        "`ctf` — 4v4 Capture-the-Flag",
                        "`4tf` — 4v4v4v4 Fortress",
                    ].join("\n"),
                    inline: false,
                },
                {
                    name: "Etiquette",
                    value: "Only add when you're ready to play and stay for the full match. Do not add while you're already in a match. If you can't make it, find a sub.",
                    inline: false,
                }
            )
            .setTimestamp();

        container.logger.debug(
            `New !help message from ${author.username}: ${content}`
        );
        try {
            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            container.logger.warn(`Failed to send help embed response: ${error}`);
            await message.channel.send(
                [
                    "RCL Pickup",
                    LANE_SUMMARY,
                    "Leaderboard: https://hub.retrocyclesleague.com/leaderboard",
                    "Queue: !add <mode> / !remove [mode] / !who / !me",
                    "Modes: tst (2v2v2v2), sumobar (solo 8P)",
                    "Open queue only: fort (6v6), wst (3v3 sumo), ctf (4v4 Capture-the-Flag), 4tf (4v4v4v4 Fortress)",
                    "Etiquette: only add when you're ready, not while you're already in a match, and stay for the full match.",
                ].join("\n")
            );
        }
    }
}
