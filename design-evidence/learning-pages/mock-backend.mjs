/**
 * Local visual QA fixtures. This server never calls the deployed API. Identities
 * and courses are invented; the pilot guide uses the supplied source material.
 * Pilot-guide edits persist only in memory. This server is outside the app source.
 *
 * Start: node design-evidence/learning-pages/mock-backend.mjs
 * Next: use DASHBOARD_API_URL=http://localhost:3101,
 *   FRONTEND_PUBLIC_ORIGIN=http://localhost:3100,
 *   EXAMS_AUTH_KEY=learning-preview-only-fake-key, and
 *   EXAMS_CSRF_SECRET=learning-preview-only-fake-csrf-secret-32.
 * Open http://localhost:3101/preview-start to enter the actual course route.
 * Add ?next=/pilot-guide to inspect the guide, or ?next=/dashboard/pilot-guide
 * to edit its local copy. Add &role=staff to inspect management access denial.
 */
import {createServer} from "node:http";
import {initialPilotGuide} from "../../src/learning/pilot-guide-content.ts";
import {sanitizePilotGuideHtml} from "../../src/learning/pilot-guide-html.ts";
import {pilotGuideWriteRequest} from "../../src/lib/pilot-guide-contract.ts";

const port = Number(process.env.LEARNING_PREVIEW_PORT ?? 3101);
const frontend = new URL(process.env.LEARNING_PREVIEW_FRONTEND_ORIGIN ?? "http://localhost:3100");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid preview port");
if (frontend.protocol !== "http:" || frontend.hostname !== "localhost" || frontend.pathname !== "/"
  || frontend.username || frontend.password || frontend.search || frontend.hash) {
  throw new Error("The visual preview frontend must be an exact localhost HTTP origin");
}

const adminToken = "learning-preview-admin-fake-session-0000000000000000000000";
const staffToken = "learning-preview-staff-fake-session-0000000000000000000000";
const csrfToken = "learning-preview-fake-csrf-token";
const accountId = "90001";
const discordId = "900000000000000001";
const expiresAt = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const updatedAt = "2026-10-02T10:00:00.000Z";
let pilotGuide = {...structuredClone(initialPilotGuide), revision: 1, updatedAt};
const courseInputs = [
  ["11111111-1111-4111-8111-111111111111", "ground-tower-fundamentals", "Ground & Tower Fundamentals", "Learn the core concepts of air traffic control, including ground and tower operations, in a clear and structured way.", ["Before you begin", "Traffic at the stand", "Taxiway awareness", "Runway boundaries"]],
  ["22222222-2222-4222-8222-222222222222", "ground-control", "Ground Control", "Build your knowledge of ground control operations, including taxi clearances, surface movement and airport operations.", ["Your ground environment", "Taxi clearances", "Surface movement", "Airport operations"]],
  ["33333333-3333-4333-8333-333333333333", "tower-control", "Tower Control", "Develop your understanding of tower operations, including departures, arrivals and sequencing traffic in the circuit.", ["The tower environment", "Managing departures", "Managing arrivals", "Sequencing traffic"]],
];
const courses = courseInputs.map(([id, slug, title, description, sectionTitles], index) => ({
  id, slug, title, description, isPublished: true, updatedAt,
  sectionCount: sectionTitles.length, sectionGroupCount: 1, navigationMode: "free",
  sectionGroups: [{id: `${id}-group`, courseId: id, title: "Getting started", sortOrder: 1}],
  sections: sectionTitles.map((sectionTitle, sectionIndex) => ({
    id: `${id}-section-${sectionIndex + 1}`, courseId: id, title: sectionTitle,
    sortOrder: sectionIndex + 1, groupId: `${id}-group`, updatedAt,
    markdown: `## ${sectionTitle}\n\nThis is sample course material for reviewing the ATCMH learning-page design. The published course content continues to come from the existing course service.\n\n### A focused learning space\n\nWork through one topic at a time and use the course outline to return to a section. Your progress controls and learning activities retain their existing behavior.\n\n- Read the lesson at your own pace.\n- Use the outline to find the next topic.\n- Mark the section complete when you are ready.\n\n> Visual preview only: this material is invented for interface testing.`,
  })),
  completedSectionIds: index === 0 ? [`${id}-section-1`] : [], takenQuizIds: [], quizProgress: [],
  enrollment: null, quizzes: [], activities: [], activityProgress: [],
}));

function send(response, status, body) {
  response.writeHead(status, {"Content-Type": "application/json", "Cache-Control": "no-store"});
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

function cookieToken(request) {
  const cookie = (request.headers.cookie ?? "").split(";").map(value => value.trim())
    .find(value => value.startsWith("atcmh_session="));
  return cookie?.slice("atcmh_session=".length);
}

function isSampleToken(value) { return value === adminToken || value === staffToken; }

async function readBody(request, limit = 8192) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > limit) throw new Error("Preview request too large");
  }
  return body ? JSON.parse(body) : {};
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/preview-start") {
      const next = url.searchParams.get("next") ?? "/exams/courses";
      const allowed = next === "/pilot-guide" || next === "/dashboard/pilot-guide" || next === "/exams" || next === "/exams/courses"
        || courses.some(course => next === `/exams/courses/${course.id}`);
      if (!allowed) return send(response, 400, {error: "Unsupported local preview destination"});
      const role = url.searchParams.get("role");
      const token = role === "staff" ? staffToken : adminToken;
      response.writeHead(302, {"Set-Cookie": `atcmh_session=${token}; Path=/; HttpOnly; SameSite=Lax`, "Location": new URL(next, frontend).href, "Cache-Control": "no-store"});
      return response.end();
    }
    if (request.method === "GET" && url.pathname === "/preview-stop") {
      response.writeHead(302, {"Set-Cookie": "atcmh_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax", "Location": new URL("/exams/courses", frontend).href, "Cache-Control": "no-store"});
      return response.end();
    }
    if (request.method === "GET" && url.pathname === "/health") return send(response, 200, {status: "sample-preview-ready"});
    if (request.method === "GET" && url.pathname === "/pilot-guide") return send(response, 200, {guide: pilotGuide});
    if (request.method === "GET" && url.pathname === "/users") return send(response, 200, []);
    if (request.method === "POST" && url.pathname === "/internal/auth/request-events") return send(response, 204);
    if (request.method === "POST" && url.pathname === "/internal/auth/sessions/introspect") {
      const {token} = await readBody(request);
      return send(response, 200, isSampleToken(token)
        ? {active: true, accountId, discordId, discordDisplayName: "Sample learner", expiresAt: expiresAt(), impersonating: false}
        : {active: false});
    }
    const token = cookieToken(request);
    if (!isSampleToken(token)) return send(response, 401, {error: "Sample preview session required"});
    if (request.method === "GET" && url.pathname === "/auth/me") {
      return send(response, 200, {accountId, status: "ACTIVE", application: "web", expiresAt: expiresAt(), csrfToken,
        impersonating: false, identities: [{id: "sample-identity", accountId, provider: "discord", subject: discordId, displayName: "Sample learner", active: true}]});
    }
    if (request.method === "GET" && url.pathname === "/admin/me") {
      return send(response, 200, {id: discordId, username: "Sample learner", role: token === staffToken ? "staff" : "admin",
        canManageAllAssignments: false, canViewAuditLogs: false, canViewManual: false,
        canManageAccounts: false, canReviewAltAccounts: false, canViewSensitiveAuditDetails: false, canImpersonate: false,
        canManagePilotGuide: token === adminToken});
    }
    if (request.method === "GET" && ["/admin/users", "/admin/sessions", "/admin/notes", "/admin/mentees", "/admin/assignments"].includes(url.pathname)) {
      return send(response, 200, []);
    }
    if (url.pathname === "/admin/pilot-guide") {
      if (token !== adminToken) return send(response, 403, {error: "Pilot guide management requires an admin."});
      if (request.method === "GET") return send(response, 200, {guide: pilotGuide});
      if (request.method === "PUT") {
        if (request.headers["x-csrf-token"] !== csrfToken) return send(response, 403, {error: "Invalid sample CSRF token."});
        const matchHeader = request.headers["if-match"];
        if (typeof matchHeader !== "string") return send(response, 428, {error: "Guide revision is required."});
        const revision = matchHeader.trim().match(/^(?:"(\d+)"|(\d+))$/);
        if (!revision) return send(response, 400, {error: "Invalid guide revision."});
        if (Number(revision[1] ?? revision[2]) !== pilotGuide.revision) return send(response, 409, {error: "The pilot guide changed since it was opened."});
        const update = pilotGuideWriteRequest(await readBody(request, 500_000));
        pilotGuide = {...update, chapters: update.chapters.map(chapter => ({...chapter, html: sanitizePilotGuideHtml(chapter.html)})),
          revision: pilotGuide.revision + 1, updatedAt: new Date().toISOString()};
        return send(response, 200, {guide: pilotGuide});
      }
    }
    if (request.method === "GET" && url.pathname === "/courses") {
      const summaryFields = ["id", "slug", "title", "description", "isPublished", "updatedAt", "sectionCount", "sectionGroupCount", "navigationMode"];
      return send(response, 200, {courses: courses.map(course => Object.fromEntries(summaryFields.map(field => [field, course[field]])))});
    }
    const courseMatch = url.pathname.match(/^\/courses\/([^/]+)(.*)$/);
    if (courseMatch) {
      const course = courses.find(item => item.id === courseMatch[1]);
      if (!course) return send(response, 404, {error: "Sample course not found"});
      if (request.method === "GET" && !courseMatch[2]) return send(response, 200, {course});
      if (request.method === "POST" && courseMatch[2] === "/view-events") return send(response, 200, {accepted: true});
      const completion = courseMatch[2].match(/^\/sections\/([^/]+)\/complete$/);
      if (request.method === "POST" && completion) {
        if (!course.sections.some(section => section.id === completion[1])) return send(response, 404, {error: "Sample section not found"});
        if (!course.completedSectionIds.includes(completion[1])) course.completedSectionIds.push(completion[1]);
        return send(response, 200, {completed: true});
      }
    }
    return send(response, 404, {error: "No visual QA fixture for this endpoint"});
  } catch {
    return send(response, 400, {error: "Invalid local preview request"});
  }
});

// IPv4 loopback binding prevents the fixture from being exposed to the LAN.
server.listen(port, "127.0.0.1", () => console.log(`Sample-only learning preview API: http://localhost:${port}/preview-start`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
