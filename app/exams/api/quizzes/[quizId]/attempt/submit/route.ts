import { submitLearnerAttempt } from "@/app/exams/(learner)/quizzes/[quizId]/attempt/actions";
import { authorizeLearnerMutation } from "@/src/lib/browser-session";

const MAX_BODY_BYTES = 65_536;

type SubmissionResult = { attemptId: string } | { error: string };
type SubmitAttempt = (input: {
  quizId: string;
  answers: Record<string, string>;
  submissionReason: "manual";
}) => Promise<SubmissionResult>;

async function readBoundedUtf8Body(request: Request): Promise<{ body?: string; tooLarge: boolean }> {
  if (!request.body) return { tooLarge: false };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) return { tooLarge: true };
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body: new TextDecoder("utf-8", { fatal: true }).decode(body), tooLarge: false };
}

function errorResponse(error: string, status: 400 | 403 | 413 | 503) {
  return Response.json({ error }, { status });
}

export async function submitKeepaliveAttempt(
  request: Request,
  { params }: { params: Promise<{ quizId: string }> },
  submitAttempt: SubmitAttempt,
  trustedOrigin: string,
) {
  if (request.headers.get("Origin") !== trustedOrigin) return errorResponse("Forbidden.", 403);

  let rawBody: { body?: string; tooLarge: boolean };
  try {
    rawBody = await readBoundedUtf8Body(request);
  } catch {
    return errorResponse("Invalid submission.", 400);
  }
  if (rawBody.tooLarge) return errorResponse("Submission too large.", 413);
  if (rawBody.body === undefined) return errorResponse("Invalid submission.", 400);

  let body: unknown;
  try {
    body = JSON.parse(rawBody.body);
  } catch {
    return errorResponse("Invalid submission.", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)
    || !("answers" in body) || !body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
    return errorResponse("Invalid submission.", 400);
  }

  try {
    const result = await submitAttempt({
      quizId: (await params).quizId,
      answers: body.answers as Record<string, string>,
      submissionReason: "manual",
    });
    return Response.json(result, { status: "attemptId" in result ? 200 : 503 });
  } catch {
    return errorResponse("Unable to submit attempt.", 503);
  }
}

export async function POST(request: Request, context: { params: Promise<{ quizId: string }> }) {
  try {
    const { appUrl } = await import("@/src/lib/app-url");
    if (!await authorizeLearnerMutation(request.headers.get("origin"), request.headers.get("cookie"), request.headers.get("X-CSRF-Token"))) {
      return errorResponse("Forbidden.", 403);
    }
    return submitKeepaliveAttempt(request, context, (input) => submitLearnerAttempt({
      ...input,
      csrfToken: request.headers.get("X-CSRF-Token")!,
    }), appUrl("/").origin);
  } catch {
    return errorResponse("Unable to submit attempt.", 503);
  }
}
