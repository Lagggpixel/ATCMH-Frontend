export const EXAMS_BASE_PATH = "/exams" as const;

export function examsPath(path = ""): string {
  if (path === "" || path === "/") return EXAMS_BASE_PATH;
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Exams paths must be root-relative.");
  return `${EXAMS_BASE_PATH}${path}`;
}

const exactPaths = new Set(["/", "/terms", "/policy", "/leaderboard", "/auth", "/account", "/consent", "/api/health"]);

export function isCanonicalAppPath(path: string): boolean {
  return exactPaths.has(path) || path === "/dashboard" || path.startsWith("/dashboard/") || path === EXAMS_BASE_PATH || path.startsWith(`${EXAMS_BASE_PATH}/`);
}
