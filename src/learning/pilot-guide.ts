export type PilotGuideChapter = {
  id: string;
  title: string;
  html: string;
};

export type PilotGuide = {
  title: string;
  introduction: string;
  lastUpdated: string;
  revision: number;
  updatedAt: string | null;
  chapters: PilotGuideChapter[];
};

export type PilotGuideResponse = {guide: PilotGuide};

export type PilotGuideUpdate = Pick<PilotGuide, "title" | "introduction" | "lastUpdated" | "chapters">;
