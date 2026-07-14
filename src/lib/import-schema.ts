import { z } from "zod";

export const feedbackModes = ["after_submission", "after_each_question", "none"] as const;

const optionSchema = z.object({
  text: z.string().trim().min(1).max(4_000),
  isCorrect: z.boolean(),
});

const questionSchema = z.object({
  prompt: z.string().trim().min(1).max(10_000),
  randomizeOptions: z.boolean().optional().default(false),
  options: z.array(optionSchema).min(2),
}).superRefine((question, context) => {
  if (question.options.filter((option) => option.isCorrect).length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "exactly one option must be correct" });
  }
});

export const quizImportSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10_000).optional().default(""),
  category: z.string().trim().min(1).max(255),
  feedbackMode: z.enum(feedbackModes),
  timeLimitSeconds: z.number().int().min(0).max(86_400),
  tags: z.array(z.string().trim().min(1).max(255)).max(20).optional().default([]),
  isPrivate: z.boolean().optional().default(false),
  randomizeQuestions: z.boolean().optional().default(false),
  questions: z.array(questionSchema).min(1).max(250),
}).strict();

export type NormalizedImport = z.output<typeof quizImportSchema>;

/** Published to staff so their JSON import files can be validated offline. */
export const importJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  title: "ATCMH quiz import",
  type: "object",
  required: ["title", "category", "feedbackMode", "timeLimitSeconds", "questions"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 255 },
    description: { type: "string" },
    category: { type: "string", minLength: 1 },
    feedbackMode: { enum: feedbackModes },
    timeLimitSeconds: { type: "integer", minimum: 0, maximum: 86400 },
    tags: { type: "array", items: { type: "string" } },
    isPrivate: { type: "boolean" },
    randomizeQuestions: { type: "boolean" },
    questions: {
      type: "array", minItems: 1,
      items: {
        type: "object", required: ["prompt", "options"],
        properties: {
          prompt: { type: "string", minLength: 1 },
          randomizeOptions: { type: "boolean" },
          options: {
            type: "array", minItems: 2,
            items: { type: "object", required: ["text", "isCorrect"], properties: { text: { type: "string", minLength: 1 }, isCorrect: { type: "boolean" } } },
          },
        },
      },
    },
  },
  additionalProperties: false,
} as const;
