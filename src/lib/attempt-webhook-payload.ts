export interface AttemptWebhookInput {
  quizTitle: string;
  discordId: string;
  score: number;
  total: number;
  percentage: number;
  submissionReason: "manual" | "timeout";
  attemptCode: string;
  attemptId: string;
  submittedAt: Date;
  attemptUrl: URL;
}

export interface AttemptWebhookPayload {
  allowed_mentions: { parse: string[]; users: string[] };
  embeds: Array<{
    author: { name: string };
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp: string;
  }>;
}

export function buildAttemptWebhookPayload(input: AttemptWebhookInput): AttemptWebhookPayload {
  const attemptUrl = input.attemptUrl.toString();

  return {
    allowed_mentions: { parse: [], users: [input.discordId] },
    embeds: [{
      author: { name: "ATCMH Exam Center" },
      title: "Quiz Attempt",
      description: input.quizTitle,
      color: 0x22c55e,
      fields: [
        { name: "Student", value: `<@${input.discordId}>`, inline: true },
        { name: "Result", value: `${input.score}/${input.total} (${input.percentage}%)`, inline: true },
        {
          name: "Submission",
          value: input.submissionReason === "manual" ? "Submitted manually" : "Submitted on timeout",
          inline: true,
        },
        { name: "Attempt Code", value: input.attemptCode, inline: true },
        { name: "View Attempt", value: `[Open Attempt](${attemptUrl})` },
      ],
      timestamp: input.submittedAt.toISOString(),
    }],
  };
}
