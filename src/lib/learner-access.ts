export interface LearnerAccessContext {
  discordId: string;
  canAccessPrivateQuizzes: boolean;
  /** Set only when the learner opened the quiz from a verified published course. */
  courseId?: string;
}

const discordSnowflake = /^\d{17,20}$/;

function ordinaryAccess(discordId: string): LearnerAccessContext {
  return { discordId, canAccessPrivateQuizzes: false };
}

export async function resolveLearnerAccess(discordId: string): Promise<LearnerAccessContext> {
  const ordinary = ordinaryAccess(discordId);
  if (!discordSnowflake.test(discordId)) return ordinary;

  const dashboardApiUrl = process.env.DASHBOARD_API_URL?.replace(/\/$/, "");
  const authKey = process.env.EXAMS_AUTH_KEY;
  if (!dashboardApiUrl || !authKey) return ordinary;

  try {
    const response = await fetch(
      `${dashboardApiUrl}/internal/auth/discord/exams-access`,
      {
        method: "POST",
        headers: {"Content-Type": "application/json", "X-Exams-Auth-Key": authKey},
        body: JSON.stringify({discordId}),
        cache: "no-store",
      },
    );
    if (!response.ok) return ordinary;

    const result: unknown = await response.json();
    const canAccessPrivateQuizzes = typeof result === "object" && result !== null
      && "canAccessPrivateQuizzes" in result && result.canAccessPrivateQuizzes === true;
    return { discordId, canAccessPrivateQuizzes };
  } catch {
    return ordinary;
  }
}
