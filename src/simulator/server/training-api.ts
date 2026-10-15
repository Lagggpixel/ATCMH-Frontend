import {z} from "zod";
import {scenarioSchema} from "../scenarios";
import {SessionError} from "../sessions";
import {authorizeSessionRequest} from "./session-auth";
import {sessionFailure} from "./session-api";
import {TrainingService} from "./training-service";

const uuid = z.string().uuid(), version = z.number().int().positive();
export type TrainingOperations = Pick<TrainingService, "scenarios" | "scenario" | "save" | "capture" | "publish" | "launchScenario" | "finish" | "restart">;
export function createTrainingApi(service: TrainingOperations = new TrainingService(), authorize = authorizeSessionRequest) {
  return async function trainingApi(request: Request, resource: string, id?: string) {
    try {
      if (!["scenarios", "attempts"].includes(resource)) throw new SessionError("not-found", "Page unavailable.", 404);
      if (id) uuid.parse(id);
      const actor = await authorize(request, true);
      let value;
      if (request.method === "GET") {
        if (resource === "scenarios") value = id ? {scenario: await service.scenario(actor, id)} : {scenarios: await service.scenarios(actor)};
        else throw new SessionError("not-found", "Page unavailable.", 404);
      } else {
        const text = await request.text();
        if (text.length > 2_000_000) throw new SessionError("too-large", "Scenario is too large.", 413);
        const raw = JSON.parse(text) as unknown;
        if (resource === "scenarios") {
          if (!id) {
            const capture = z.object({sessionId: uuid, title: z.string().trim().min(1).max(80)}).safeParse(raw);
            value = {scenario: capture.success ? await service.capture(actor, capture.data.sessionId, capture.data.title) : await service.save(actor, scenarioSchema.parse(z.object({draft: z.unknown()}).parse(raw).draft))};
          } else {
            const action = z.object({action: z.enum(["save", "publish", "launch"])}).parse(raw).action;
            if (action === "save") {const input = z.object({draft: scenarioSchema, version}).parse(raw); value = {scenario: await service.save(actor, input.draft, id, input.version)};}
            else if (action === "publish") value = {scenario: await service.publish(actor, id, z.object({version}).parse(raw).version)};
            else {const input = z.object({action: z.literal("launch"), revision: version}).strict().parse(raw); value = await service.launchScenario(actor, id, input.revision);}
          }
        } else {
          if (!id) throw new SessionError("not-found", "Attempt unavailable.", 404);
          const action = z.object({action: z.enum(["finish", "restart"])}).parse(raw).action;
          const attemptId = z.object({attemptId: uuid}).parse(raw).attemptId;
          value = action === "finish" ? await service.finish(actor, id, z.object({feedback: z.string().trim().max(6000)}).parse(raw).feedback, attemptId) : await service.restart(actor, id, attemptId);
        }
      }
      return Response.json(value, {headers: {"cache-control": "no-store"}});
    } catch (error) {return sessionFailure(error);}
  };
}
export const trainingApi = createTrainingApi();
