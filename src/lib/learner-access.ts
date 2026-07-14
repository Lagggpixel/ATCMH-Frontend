import { classifyDiscordStaff, parseDiscordIdList } from "./discord-auth";

export interface LearnerAccessContext {
  discordId: string;
  canAccessPrivateQuizzes: boolean;
}

const discordSnowflake = /^\d{17,20}$/;

function ordinaryAccess(discordId: string): LearnerAccessContext {
  return { discordId, canAccessPrivateQuizzes: false };
}

export async function resolveLearnerAccess(discordId: string): Promise<LearnerAccessContext> {
  const ordinary = ordinaryAccess(discordId);
  if (!discordSnowflake.test(discordId)) return ordinary;

  if (parseDiscordIdList(process.env.DISCORD_ADMIN_USER_IDS).has(discordId)) {
    return { discordId, canAccessPrivateQuizzes: true };
  }

  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!guildId || !botToken) return ordinary;

  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`,
      { headers: { authorization: `Bot ${botToken}` }, cache: "no-store" },
    );
    if (!response.ok) return ordinary;

    const member: unknown = await response.json();
    if (typeof member !== "object" || member === null || !("roles" in member)) return ordinary;
    const roles = member.roles;
    if (!Array.isArray(roles) || !roles.every((role) => typeof role === "string")) return ordinary;

    const staff = classifyDiscordStaff(discordId, roles);
    return { discordId, canAccessPrivateQuizzes: staff.isMentor };
  } catch {
    return ordinary;
  }
}
