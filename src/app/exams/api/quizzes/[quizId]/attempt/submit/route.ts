import { submitLearnerAttempt } from "@/src/app/exams/(attempt)/quizzes/[quizId]/attempt/actions";
import { authorizeLearnerMutation } from "@/src/lib/browser-session";

import { errorResponse, submitKeepaliveAttempt } from "./submit-keepalive";

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
