const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const isQuizId = (value: string) => new RegExp(`^${uuid}$`, "i").test(value);
const quizDirective = new RegExp(`^\\{\\{quiz:(${uuid})(?:\\s+(required|optional))?(?:\\s+pass:(\\d{1,3}))?\\}\\}$`, "i");
const quizPassOnlyDirective = new RegExp(`^\\{\\{quiz:(${uuid})\\s+pass:(\\d{1,3})\\}\\}$`, "i");
const mediaDirective = new RegExp(`^\\{\\{(image|video):(${uuid})\\}\\}$`, "i");

export type CourseMarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; items: string[] }
  | { type: "quiz"; quizId: string; required: boolean; passPercentage?: number }
  | { type: "media"; mediaId: string; kind: "image" | "video" };

export type CourseMarkdownReference =
  | { type: "quiz"; quizId: string; required: boolean; passPercentage?: number }
  | { type: "media"; mediaId: string; kind: "image" | "video" };

export class CourseMarkdownValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CourseMarkdownValidationError";
  }
}

function directiveFor(line: string): CourseMarkdownBlock | undefined {
  const quiz = line.match(quizDirective);
  if (quiz) {
    const passPercentage = quiz[3] === undefined ? undefined : Number(quiz[3]);
    return {
      type: "quiz",
      quizId: quiz[1].toLowerCase(),
      required: quiz[2]?.toLowerCase() === "required",
      ...(passPercentage === undefined ? {} : { passPercentage }),
    };
  }
  const quizPassOnly = line.match(quizPassOnlyDirective);
  if (quizPassOnly) return { type: "quiz", quizId: quizPassOnly[1].toLowerCase(), required: false, passPercentage: Number(quizPassOnly[2]) };

  const media = line.match(mediaDirective);
  if (media) return { type: "media", kind: media[1].toLowerCase() as "image" | "video", mediaId: media[2].toLowerCase() };
  return undefined;
}

export function parseCourseMarkdown(markdown: string): CourseMarkdownBlock[] {
  const blocks: CourseMarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", lines: paragraph });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length === 0) return;
    blocks.push({ type: "list", items: list });
    list = [];
  };

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    const directive = directiveFor(line);
    if (directive) {
      flushParagraph();
      flushList();
      blocks.push(directive);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }

    const listItem = line.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1]);
      continue;
    }

    flushList();
    paragraph.push(line.replace(/\s{2,}$/, ""));
  }

  flushParagraph();
  flushList();
  return blocks;
}

export function courseMarkdownReferences(markdown: string): CourseMarkdownReference[] {
  const references: CourseMarkdownReference[] = [];
  for (const block of parseCourseMarkdown(markdown)) {
    if (block.type === "quiz") references.push({
      type: "quiz",
      quizId: block.quizId,
      required: block.required,
      ...(block.passPercentage === undefined ? {} : { passPercentage: block.passPercentage }),
    });
    if (block.type === "media") references.push({ type: "media", mediaId: block.mediaId, kind: block.kind });
  }
  return references;
}

export function validateCourseMarkdown(markdown: string) {
  if (!markdown.trim()) throw new CourseMarkdownValidationError("Section markdown cannot be empty");

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("{{") || !line.endsWith("}}")) continue;
    if (!directiveFor(line)) throw new CourseMarkdownValidationError(`Invalid course directive: ${line}`);
  }

  for (const reference of courseMarkdownReferences(markdown)) {
    if (reference.type === "quiz" && !isQuizId(reference.quizId)) {
      throw new CourseMarkdownValidationError(`Invalid quiz ID: ${reference.quizId}`);
    }
    if (reference.type === "quiz" && reference.passPercentage !== undefined) {
      if (!reference.required) throw new CourseMarkdownValidationError("A passing score can only be set on a required quiz");
      if (!Number.isInteger(reference.passPercentage) || reference.passPercentage < 1 || reference.passPercentage > 100) {
        throw new CourseMarkdownValidationError("Quiz passing scores must be between 1 and 100");
      }
    }
  }
}
