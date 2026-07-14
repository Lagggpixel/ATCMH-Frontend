import test from "node:test";
import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import type {ExamManagementActor} from "../../types/Exam.ts";
import {
    canAccessExamCenterView,
    canManageExamWebsite,
    isCurrentExamQuiz,
    quizVisibilityReason,
} from "./ExamCenterAccess.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(currentDir, "../../route-map.ts"), "utf8");
const centerSource = readFileSync(join(currentDir, "ExamCenter.tsx"), "utf8");
const examsApiSource = readFileSync(join(currentDir, "../../utils/ExamsApiUtils.ts"), "utf8");
const dashboardRouteSource = readFileSync(join(currentDir, "../../DashboardRoute.tsx"), "utf8");
const centerCss = readFileSync(join(currentDir, "ExamCenter.module.css"), "utf8");
const unlockManagerSource = readFileSync(join(currentDir, "ExamUnlockManager.tsx"), "utf8");
const catalogPath = join(currentDir, "ExamCatalog.tsx");
const catalogSource = existsSync(catalogPath) ? readFileSync(catalogPath, "utf8") : "";
const catalogCss = readFileSync(join(currentDir, "ExamCatalog.module.css"), "utf8");
const editorCss = readFileSync(join(currentDir, "ExamEditor.module.css"), "utf8");
const editorSource = readFileSync(join(currentDir, "ExamEditor.tsx"), "utf8");
const importCss = readFileSync(join(currentDir, "ExamImportCenter.module.css"), "utf8");
const importSource = readFileSync(join(currentDir, "ExamImportCenter.tsx"), "utf8");
const websiteCss = readFileSync(join(currentDir, "ExamWebsiteManager.module.css"), "utf8");
const websiteSource = readFileSync(join(currentDir, "ExamWebsiteManager.tsx"), "utf8");
const attemptManagerSource = readFileSync(join(currentDir, "ExamAttemptManager.tsx"), "utf8");
const attemptReviewSource = readFileSync(join(currentDir, "ExamAttemptReview.tsx"), "utf8");

test("exam management uses dedicated catalog, editor, import, and website routes", () => {
    for (const view of ["catalog", "create", "edit", "import", "unlocks", "website", "attempts", "attempt-review"]) {
        assert.match(appSource, new RegExp(`view: "${view}"`));
    }
    assert.match(appSource, /params: \{examId:/);
    assert.match(appSource, /params: \{attemptId:/);
});

test("exam center receives the shared global Dashboard navigation once", () => {
    assert.doesNotMatch(centerSource, /<AdminNav/);
    assert.match(dashboardRouteSource, /<DashboardWorkspace adminUser=\{state\.loaded \? state\.adminUser : undefined\}/);
});

test("a Dashboard-to-Exams handoff failure remains retryable without sending staff to Exams sign-in", () => {
    assert.match(examsApiSource, /export class ExamsSessionHandoffError extends Error/);
    assert.match(examsApiSource, /export const isExamsSessionHandoffFailure = \(reason: unknown\): reason is ExamsSessionHandoffError/);
    assert.match(centerSource, /isExamsSessionHandoffFailure\(reason\)/);
    assert.match(centerSource, /Could not connect Dashboard to Exams/);
    assert.match(centerSource, /examsAuthRequired && !examsHandoffFailed \? "Retry after signing in" : "Try again"/);
    assert.match(centerSource, /examsAuthRequired && !examsHandoffFailed \? <a href=\{EXAMS_LOGIN_URL\}/);
});

test("exam center removes redundant identity and permission copy", () => {
    for (const copy of [
        "Staff workspace",
        "<h1>Exam Center</h1>",
        "Manage quizzes and imports",
        "Logged in with Discord as",
        "You can see all exams while this permission is active",
    ]) assert.doesNotMatch(centerSource, new RegExp(copy));
});

test("exam navigation stays scrollable without showing a scrollbar", () => {
    assert.match(centerCss, /\.examNav\s*\{[\s\S]*?overflow-x: auto;[\s\S]*?scrollbar-width: none;/);
    assert.match(centerCss, /\.examNav::-webkit-scrollbar\s*\{[\s\S]*?display: none;/);
});

test("the catalog does not render import or website forms inline", () => {
    assert.doesNotMatch(centerSource, /view === "catalog"[\s\S]{0,500}<ExamImportCenter/);
    assert.doesNotMatch(centerSource, /view === "catalog"[\s\S]{0,500}<ExamWebsiteManager/);
});

test("direct editor routes require the loaded actor to manage exams", () => {
    assert.match(centerSource, /const canManageExams = data \? hasCapability\(data\.actor, "manage-exams"\) : false/);
    assert.match(centerSource, /view !== "edit"\s*\|\| !examId \|\| !token \|\| !canManageExams/);
    assert.match(centerSource, /canAccessView && view === "create" \?\s*<ExamEditor/);
    assert.match(centerSource, /canAccessView && view === "edit" && editorRequestIsCurrent/);
});

test("the editor only renders a quiz loaded for the current route", () => {
    assert.equal(isCurrentExamQuiz("tower", "tower"), true);
    assert.equal(isCurrentExamQuiz("ground", "tower"), false);
    assert.equal(isCurrentExamQuiz("ground", null), false);
    assert.match(centerSource, /aria-live="polite"[^>]*><p>Loading exam editor/);
});

test("direct exam workspaces centralize authorization and show access denied locally", () => {
    const mentor: ExamManagementActor = {discordId: "mentor", canManageAll: false, capabilities: ["manage-exams", "unlock-learners"]};
    const importer: ExamManagementActor = {discordId: "importer", canManageAll: false, capabilities: ["import-exams"]};
    const viewer: ExamManagementActor = {discordId: "viewer", canManageAll: false, capabilities: []};
    const reviewer: ExamManagementActor = {discordId: "reviewer", canManageAll: false, capabilities: ["review-attempts"]};
    const admin: ExamManagementActor = {discordId: "admin", canManageAll: true, capabilities: ["manage-system"]};
    assert.equal(canAccessExamCenterView("create", mentor), true);
    assert.equal(canAccessExamCenterView("edit", importer), false);
    assert.equal(canAccessExamCenterView("import", importer), true);
    assert.equal(canAccessExamCenterView("unlocks", mentor), true);
    assert.equal(canAccessExamCenterView("unlocks", viewer), false);
    assert.equal(canAccessExamCenterView("website", mentor), false);
    assert.equal(canAccessExamCenterView("website", admin), true);
    assert.equal(canAccessExamCenterView("attempts", reviewer), true);
    assert.equal(canAccessExamCenterView("attempt-review", reviewer), true);
    assert.equal(canAccessExamCenterView("attempts", viewer), false);
    assert.equal(canAccessExamCenterView("attempt-review", viewer), false);
    assert.match(centerSource, /You do not have access to this\s+Exam Center workspace\./);
    assert.match(centerSource, /to="\/dashboard\/exams"/);
});

test("only an Exams administrator can open the website-content workspace", () => {
    assert.equal(canManageExamWebsite({discordId: "mentor", canManageAll: false, capabilities: ["manage-exams"]}), false);
    assert.equal(canManageExamWebsite({discordId: "admin", canManageAll: true, capabilities: ["manage-exams", "manage-system"]}), true);
});

test("quiz-management access explains why every quiz is visible", () => {
    assert.equal(
        quizVisibilityReason({discordId: "mentor", canManageAll: false, capabilities: ["manage-exams"]}),
        "Visible through your Discord mentor quiz-management permission."
    );
    assert.equal(
        quizVisibilityReason({discordId: "admin", canManageAll: true, capabilities: ["manage-exams", "manage-system"]}),
        "Visible through your Discord administrator quiz-management permission."
    );
});

test("exam catalog renders filtered quizzes in collapsible mentor folders", () => {
    assert.match(catalogSource, /groupExamQuizzes/);
    assert.match(catalogSource, /aria-expanded=\{isExpanded\}/);
    assert.match(catalogSource, /folder\.quizzes\.map/);
    assert.doesNotMatch(catalogSource, /usePagination|useTableSort|<table/);
});

test("exam catalog controls use the approved soft corner radius", () => {
    assert.match(catalogCss, /\.toolbar input,[\s\S]*?border-radius: 9px;/);
    assert.match(catalogCss, /\.editButton\s*\{[\s\S]*?border-radius: 9px;/);
});

test("exam sub-navigation sends secondary tools to dedicated routes", () => {
    assert.doesNotMatch(centerSource, /<NavLink to="\/dashboard\/exams\/import"/);
    assert.match(centerSource, /to="\/dashboard\/exams\/unlocks"/);
    assert.match(centerSource, /to="\/dashboard\/exams\/website"/);
    assert.match(centerSource, /to="\/dashboard\/exams\/attempts"/);
    assert.match(centerSource, /hasCapability\(data\.actor, "unlock-learners"\)[^\n]+to="\/dashboard\/exams\/unlocks"/);
    assert.match(centerSource, /<ExamUnlockManager/);
});

test("attempt reviews open on a dedicated subpage rather than inside the list", () => {
    assert.match(attemptManagerSource, /navigate\(`\/dashboard\/exams\/attempts\/\$\{attempt\.id\}`\)/);
    assert.match(centerSource, /view === "attempts"\s*\?\s*<ExamAttemptManager/);
    assert.match(centerSource, /view === "attempt-review"\s*\?\s*<ExamAttemptReview/);
});

test("attempt views resolve current Dashboard usernames while preserving historical fallbacks", () => {
    assert.match(centerSource, /<ExamAttemptManager token=\{token\} users=\{users\}\/>/);
    assert.match(centerSource, /<ExamAttemptReview actor=\{data\.actor\} token=\{token\} users=\{users\}\/>/);
    assert.match(attemptManagerSource, /getUserNameOrFallback\(attempt\.studentDiscordId, attempt\.studentName\)/);
    assert.match(attemptReviewSource, /getUserNameOrFallback\(attempt\.studentDiscordId, attempt\.studentName\)/);
});

test("attempt deletion is limited to super administrators and names its target", () => {
    assert.match(attemptReviewSource, /actor\.canManageAll\s*\?\s*<button/);
    assert.match(attemptReviewSource, /This permanently removes \{displayName\}’s attempt for \{attempt\.quizTitle\}/);
    assert.match(attemptReviewSource, /role="alert"/);
    assert.match(attemptReviewSource, /navigate\("\/dashboard\/exams\/attempts"\)/);
});

test("attempt review uses the immutable stored review and provides a back route", () => {
    assert.match(attemptReviewSource, /const review = attempt\.review/);
    assert.match(attemptReviewSource, /review\.questions\.map/);
    assert.doesNotMatch(attemptReviewSource, /getQuiz|listQuizzes/);
    assert.match(attemptReviewSource, /to="\/dashboard\/exams\/attempts">← Back to attempts/);
});

test("exam navigation and empty unlock copy use the approved wording", () => {
    assert.match(centerSource, />Quizzes<\/NavLink>/);
    assert.match(unlockManagerSource, /Public quizzes do not require learner unlocks\./);
});

test("manual unlocks reject Discord IDs already present in the confirmed list", () => {
    assert.match(unlockManagerSource, /isAlreadyUnlocked\(unlocks, targetDiscordId\)/);
    assert.match(unlockManagerSource, /This learner is already unlocked for this quiz\./);
});

test("unlock picker groups private quizzes under their mentor folders", () => {
    assert.match(unlockManagerSource, /groupExamQuizzes/);
    assert.match(unlockManagerSource, /<optgroup key=\{folder\.name\} label=\{folder\.name\}>/);
    assert.match(unlockManagerSource, /folder\.quizzes\.map\(quiz => <option/);
});

test("unlock workspace keeps desktop columns at their natural heights", () => {
    const unlockManagerCss = readFileSync(join(currentDir, "ExamUnlockManager.module.css"), "utf8");
    assert.match(unlockManagerCss, /\.workspace\s*\{[\s\S]*?align-items: start;/);
});

test("create and import are quiet catalogue actions rather than persistent destinations", () => {
    assert.doesNotMatch(centerSource, /<NavLink to="\/dashboard\/exams\/import"/);
    assert.match(centerSource, /view === "catalog"[\s\S]{0,900}navigate\("\/dashboard\/exams\/import"\)/);
    assert.match(centerSource, /className=\{styles\.secondaryAction\}>Import/);
    assert.match(centerSource, /className=\{styles\.createButton\}>Create\s+quiz/);
});

test("the active exam tab underline meets the integrated navigation divider", () => {
    assert.match(centerCss, /\.examNav\s*\{[\s\S]*?border-bottom:/);
    assert.match(centerCss, /\.examNav \.activeNavLink::after\s*\{[\s\S]*?bottom: -1px;/);
});

test("exam center view type includes the unlocks workspace", () => {
    const accessSource = readFileSync(join(currentDir, "ExamCenterAccess.ts"), "utf8");
    assert.match(accessSource, /ExamCenterView = [^;]+"unlocks"/);
});

test("unlock mutations cannot update a different selected quiz", () => {
    assert.match(unlockManagerSource, /const selectedQuizIdRef = useRef/);
    assert.match(unlockManagerSource, /const quizId = selectedQuizIdRef\.current/);
    assert.match(unlockManagerSource, /if \(selectedQuizIdRef\.current !== quizId\) return;/);
    assert.match(unlockManagerSource, /listQuizUnlocks\(quizId, token\)/);
    assert.doesNotMatch(unlockManagerSource, /setUnlocks\(current => applyConfirmedUnlockUpdate/);
    assert.match(unlockManagerSource, /const listRequestVersionRef = useRef\(0\)/);
    assert.match(unlockManagerSource, /const requestVersion = \+\+listRequestVersionRef\.current/g);
    assert.match(unlockManagerSource, /isCurrentUnlockListRequest\(/);
    assert.match(unlockManagerSource, /!canUnlock \|\| isLoading \|\| Boolean\(pendingDiscordId\)/);
});

test("unlock workspace uses compatible immutable sorting and truthful server audit records", () => {
    assert.match(unlockManagerSource, /\[\.\.\.quizzes\.filter\(quiz => quiz\.isPrivate\)\]\.sort/);
    assert.doesNotMatch(unlockManagerSource, /toSorted|Current staff member/);
});

test("unlock load errors do not also announce an empty unlock list", () => {
    assert.match(unlockManagerSource, /!isLoading && !error && unlocks\.length === 0/);
});

test("exam editing controls require the manage-exams capability", () => {
    assert.match(catalogSource, /onEdit\?: \(quiz: ExamQuizSummary\) => void/);
    assert.match(catalogSource, /\{onEdit \? <button[^>]+onClick=\{\(\) => onEdit\(quiz\)\}>Edit<\/button> : null\}/);
    assert.match(centerSource, /onEdit=\{canManageExams \? editQuiz : undefined\}/);
});

test("dedicated exam workspaces do not use elevated outer cards", () => {
    assert.doesNotMatch(editorCss, /\.editor\s*\{[^}]*box-shadow/s);
    assert.doesNotMatch(importCss, /\.importCenter\s*\{[^}]*box-shadow/s);
    assert.doesNotMatch(websiteCss, /\.manager\s*\{[^}]*box-shadow/s);
});

test("quiz editor establishes a normalized baseline whenever its quiz changes", () => {
    assert.match(editorSource, /import \{stableExamValue\} from "\.\/ExamUnsavedChanges\.ts"/);
    assert.match(editorSource, /const \[baseline, setBaseline\] = useState<ManagedExamQuiz>\(\(\) => asDraft\(quiz\)\)/);
    assert.match(editorSource, /useEffect\(\(\) => \{\s*setBaseline\(asDraft\(quiz\)\);\s*setDraft\(asDraft\(quiz\)\);/);
    assert.match(editorSource, /const isDirty = stableExamValue\(draft\) !== stableExamValue\(baseline\);/);
});

test("quiz editor confirms before its Back and Cancel controls discard a dirty draft", () => {
    assert.match(editorSource, /const \{confirmAndRun, disarm\} = useExamUnsavedChanges\(\{isDirty}\);/);
    assert.equal((editorSource.match(/onClick=\{\(\) => confirmAndRun\(onCancel\)\}/g) ?? []).length, 2);
});

test("quiz editor disarms only after a successful save", () => {
    assert.match(editorSource, /if \(result\.valid === false\) \{[\s\S]*?return;\s*}\s*disarm\(\);\s*onSaved\(\);/);
    assert.doesNotMatch(editorSource, /try \{\s*disarm\(\);/);
});

test("website content compares edits with its last loaded or saved snapshot", () => {
    assert.match(websiteSource, /import \{stableExamValue\} from "\.\/ExamUnsavedChanges\.ts"/);
    assert.match(websiteSource, /import \{useExamUnsavedChanges\} from "\.\/useExamUnsavedChanges\.ts"/);
    assert.match(websiteSource, /const \[baseline, setBaseline\] = useState<ExamWebsiteContent \| null>\(null\);/);
    assert.match(websiteSource, /const isDirty = content !== null && stableExamValue\(content\) !== stableExamValue\(baseline\);/);
    assert.match(websiteSource, /useExamUnsavedChanges\(\{isDirty}\)/);
    assert.match(websiteSource, /setContent\(next\);\s*setBaseline\(next\);/);
    assert.match(websiteSource, /const savedContent = await ExamsApiUtils\.saveWebsiteContent\(content, token\);\s*setContent\(savedContent\);\s*setBaseline\(savedContent\);/);
});

test("failed website saves leave the last successful baseline intact", () => {
    assert.match(websiteSource, /try \{[\s\S]*?setBaseline\(savedContent\);[\s\S]*?} catch \(reason\) \{[\s\S]*?setError/);
    assert.doesNotMatch(websiteSource, /catch \(reason\) \{[\s\S]{0,250}setBaseline\(/);
});

test("imports stay dirty until a commit succeeds and template downloads stay clean", () => {
    assert.match(importSource, /import \{useExamUnsavedChanges\} from "\.\/useExamUnsavedChanges\.ts"/);
    assert.match(importSource, /const isDirty = file !== null && result\?\.valid !== true;/);
    assert.match(importSource, /const \{disarm\} = useExamUnsavedChanges\(\{isDirty}\);/);
    assert.match(importSource, /setResult\(committed\);\s*if \(!committed\.valid\) \{\s*setPreview\(committed\);\s*return;\s*}\s*disarm\(\);/);
    const downloadTemplate = importSource.slice(importSource.indexOf("const downloadTemplate"));
    assert.doesNotMatch(downloadTemplate, /disarm\(/);
});
