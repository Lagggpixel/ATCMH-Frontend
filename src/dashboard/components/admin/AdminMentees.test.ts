import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(join(currentDir, "AdminMentees.tsx"), "utf8");
const stylesSource = readFileSync(join(currentDir, "AdminMentees.module.css"), "utf8");
const editorSource = readFileSync(join(currentDir, "MenteeProfileEditor.tsx"), "utf8");
const paginationSource = readFileSync(join(currentDir, "AdminPagination.tsx"), "utf8");

test("mentee index is one table that stacks into rows on phones, separate from the profile route", () => {
    assert.match(componentSource, /const MenteeListPage/);
    assert.match(componentSource, /const MenteeProfilePage/);
    assert.match(componentSource, /<h1 id="mentees-title">Mentees<\/h1>/);
    assert.match(componentSource, /aria-label="Mentee filters"/);
    assert.match(componentSource, /className=\{styles\.menteesTable\}/);
    assert.match(componentSource, /className=\{styles\.profilePage\}/);
    assert.match(componentSource, /className=\{styles\.filterFieldMeta\}/);
    assert.match(componentSource, /const getMentorDisplayName/);
    assert.match(componentSource, /return mentorId \? getUserName\(mentorId\) : "None"/);
    // The table and cards toggle, the subtitle and the attention row were removed in the redesign.
    assert.doesNotMatch(componentSource, /MenteeView|MENTEE_VIEW_PARAM|MenteeCard|menteesCardGrid|viewSwitcher/);
    assert.doesNotMatch(componentSource, /Track the waitlist, your mentees and their mentorship\./);
    assert.doesNotMatch(componentSource, /Needs attention/);
    assert.match(stylesSource, /\.menteesTableWrap\s*\{/);
    assert.doesNotMatch(stylesSource, /\.menteesCardGrid|\.viewSwitcher/);
});

test("mentee filters reset pagination and expose a no-results recovery state", () => {
    assert.match(componentSource, /const searchParam = searchParams\.get\(MENTEE_SEARCH_PARAM\)/);
    assert.match(componentSource, /const \[searchInput, setSearchInput\] = useState\(\(\) => searchParam\)/);
    assert.match(componentSource, /const searchInputDirtyRef = useRef\(false\)/);
    assert.match(componentSource, /const deferredSearchInput = useDeferredValue\(searchInput\)/);
    assert.match(componentSource, /event\.currentTarget\.value/);
    assert.match(componentSource, /setTimeout\(\(\) => updateListQuery\(\{search: searchInput\}\), 220\)/);
    assert.match(componentSource, /startTransition\(\(\) => navigate/);
    assert.doesNotMatch(componentSource, /updateListQuery\(\{search: event\.target\.value\}\)/);
    assert.match(componentSource, /handleMentorFilterChange/);
    assert.match(componentSource, /MENTOR_FILTER_PARAM/);
    assert.match(componentSource, /menteeRoute\(id\)/);
    assert.match(componentSource, /No mentees match these filters/);
    assert.match(componentSource, /onClearFilters/);
    assert.match(componentSource, /search: "", mentorFilter: "all", status: "all"/);
});

test("a segmented status control, mentor filter and sortable columns drive the list, with phone selects for the same state", () => {
    assert.match(componentSource, /STATUS_FILTER_PARAM = "status"/);
    assert.match(componentSource, /MENTEE_STATUS_FILTERS\.map/);
    assert.match(componentSource, /aria-pressed=\{statusFilter === option\.value\}/);
    assert.match(componentSource, /countMenteesByStatus\(searchedMentees\)/);
    assert.match(componentSource, /if \(value === "waitlist"\) return "unassigned"/);
    assert.match(componentSource, /<option value="all">Anyone<\/option>/);
    assert.match(componentSource, /<option value="unassigned">Unassigned<\/option>/);
    assert.match(componentSource, /<span>Mentor<\/span>/);
    assert.doesNotMatch(componentSource, />Owner</);
    assert.match(componentSource, /aria-sort=\{active/);
    assert.match(componentSource, /sortMentees\(filtered, menteeSort/);
    assert.match(componentSource, /id="mentee-status-select"/);
    assert.match(componentSource, /id="mentee-sort-select"/);
    assert.match(componentSource, /const handleSortSelect = useCallback/);
    assert.match(stylesSource, /\.statusTabs\s*\{[^}]*border-radius:\s*9px/);
    assert.match(stylesSource, /@media \(max-width: 760px\)[\s\S]*?\.statusTabs\s*\{\s*display:\s*none/);
    assert.match(stylesSource, /@media \(max-width: 760px\)[\s\S]*?\.phoneStatusField,\s*\.mentorField\s*\{[^}]*flex-direction:\s*column/);
});

test("clicking anywhere on a table row opens the mentee profile", () => {
    assert.match(componentSource, /className=\{styles\.menteeRow\} onClick=\{event => openRowUnlessControl\(event, \(\) => onOpen\(mentee\.id\)\)\}/);
    assert.match(componentSource, /closest\("button, a, input, select"\)/);
    assert.match(componentSource, /className=\{styles\.tableMenteeButton\} onClick=\{\(\) => onOpen\(mentee\.id\)\}/);
    assert.match(stylesSource, /\.menteeRow\s*\{[^}]*cursor:\s*pointer/);
});

test("waitlisted rows show a wait bar that turns amber after a month and picked-up mentees flag an empty calendar", () => {
    assert.match(componentSource, /const WAIT_BAR_DAYS = 60;/);
    assert.match(componentSource, /const LONG_WAIT_DAYS = 30;/);
    assert.match(componentSource, /data-long=\{waitDays >= LONG_WAIT_DAYS \? "true" : undefined\}/);
    assert.match(componentSource, /Math\.min\(100, waitDays \/ WAIT_BAR_DAYS \* 100\)/);
    assert.match(componentSource, /const nothingBooked = mentee\.state === "picked_up" && !nextSession/);
    assert.match(componentSource, /Nothing booked/);
    assert.match(stylesSource, /\.waitBar\[data-long="true"\] > span\s*\{/);
});

test("mentee search work is indexed and list rows avoid unnecessary rerenders", () => {
    assert.match(componentSource, /const menteeSearchTextById = useMemo/);
    assert.match(componentSource, /new Map\(mentees\.map/);
    assert.match(componentSource, /return menteeSearchTextById\.get\(mentee\.id\)\?\.includes\(normalized\)/);
    assert.match(componentSource, /const MenteeTable = memo/);
    assert.match(componentSource, /const AutoMatchPanel = memo/);
});

test("phones get stacked list rows, a one-column profile and full-screen or bottom-sheet dialogs", () => {
    assert.match(stylesSource, /\.menteesTableWrap\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto;/s);
    assert.match(stylesSource, /@media \(max-width: 760px\)[\s\S]*?\.menteesTable tbody tr\s*\{[^}]*display:\s*grid[^}]*grid-template-areas:/);
    assert.match(stylesSource, /\.sessionListHeader,\s*\.sessionRow\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1\.2fr\) minmax\(0, 1\.4fr\) 140px 250px/);
    assert.match(stylesSource, /\.viewButton\s*\{[^}]*width:\s*72px/);
    assert.match(stylesSource, /@media \(max-width: 760px\)[\s\S]*?\.sessionRow\s*\{[^}]*grid-template-areas:/);
    assert.match(stylesSource, /@media \(max-width: 760px\)[\s\S]*?\.profileActionButtons > \.profilePrimaryAction\s*\{[^}]*flex-basis:\s*100%/);
    assert.match(stylesSource, /\.dialog:is\(\[data-size="medium"\], \[data-size="large"\], \[data-size="wide"\]\)\s*\{[^}]*height:\s*100%/);
    assert.match(stylesSource, /\.dialog\s*\{\s*width:\s*100%;\s*border:\s*0;\s*border-radius:\s*16px 16px 0 0;/);
});

test("state actions use custom confirmation dialogs and pagination exposes its semantics", () => {
    assert.doesNotMatch(componentSource, /window\.confirm/);
    assert.match(componentSource, /MenteeActionConfirmation/);
    assert.match(componentSource, /title: name => `Pick up \$\{name\}\?`/);
    assert.match(componentSource, /title: name => `Pass \$\{name\}\?`/);
    assert.match(componentSource, /confirmLabel: "Pass mentee"/);
    // Passing is the expected outcome, so it is the primary button rather than a danger button.
    assert.match(componentSource, /<button type="button" className=\{styles\.primaryButton\} onClick=\{onConfirm\}>\{copy\.confirmLabel\}<\/button>/);
    assert.match(componentSource, /title=\{`Terminate \$\{name\}\?`\}/);
    assert.match(componentSource, /className=\{styles\.dangerButton\} disabled=\{busy\}>Terminate mentee<\/button>/);
    assert.match(componentSource, /aria-label="More actions" aria-haspopup="menu"/);
    assert.match(componentSource, /role="menuitem" className=\{styles\.dangerStateAction\}/);
    assert.match(componentSource, /Terminate mentee…/);
    assert.match(componentSource, /role=\{role\} aria-modal="true"/);
    assert.match(paginationSource, /aria-current=\{i === page \? "page" : undefined\}/);
});

test("the match helper is a drawer whose results filter the waitlist", () => {
    assert.match(componentSource, /statusFilter === "waitlisted" && autoMatchSearched && !autoMatchCandidateIds\.has/);
    assert.match(componentSource, /AutoMatchPanel/);
    assert.match(componentSource, /className=\{styles\.autoMatchToggleButton\}/);
    assert.match(componentSource, /aria-expanded=\{autoMatchVisible\}/);
    assert.match(componentSource, /autoMatchVisible \? \(/);
    assert.match(componentSource, /updateListQuery\(\{status: "waitlisted"\}\);\s*setAutoMatchOpen\(true\)/);
    assert.match(componentSource, /defaultWeeklyAvailabilityAnswer/);
    assert.match(componentSource, /WeeklyAvailabilityEditor id="mentor-weekly-availability"/);
    assert.match(componentSource, /<h2 id="auto-match-title">Match helper<\/h2>/);
    assert.match(componentSource, /className=\{styles\.drawerBackdrop\}/);
    assert.match(componentSource, /setAutoMatchSearched\(true\);\s*setAutoMatchOpen\(false\)/);
    assert.match(componentSource, /Show whole waitlist/);
    assert.doesNotMatch(componentSource, /Window start \(Zulu\)|Window end \(Zulu\)/);
    assert.match(componentSource, /Strict · overlap only/);
    assert.match(componentSource, /Medium · up to 30 min gap/);
    assert.match(componentSource, /Very loose · up to 2 hr gap/);
    assert.match(componentSource, /autoMatchCandidateIds\.has\(mentee\.id\)/);
    assert.match(componentSource, /const autoMatchActive = statusFilter === "waitlisted" && autoMatchSearched/);
    assert.match(componentSource, /className=\{styles\.tableMatchSummary\}/);
    assert.match(componentSource, /accountId: string \| undefined/);
    assert.match(componentSource, /getWaitlistHelperPreferences/);
    assert.match(componentSource, /saveWaitlistHelperPreferences/);
    assert.match(componentSource, /autoMatchPreferencesLoadedFor/);
    assert.match(componentSource, /autoMatchSaveQueue/);
    assert.doesNotMatch(componentSource, /selectedAutoMatchIds|AutoMatchSelectionBar|AutoMatchPickupConfirmation|showAutoMatchPickupModal|handleAutoMatchPickup|requestAutoMatchPickup|Pick up selected|Pick up matched mentees\?|Select match|onAutoMatchToggle=|onAutoMatchToggleAll=|onAutoMatchPickup=/);
    assert.match(stylesSource, /\.autoMatchPanel\s*\{[^}]*width:\s*440px/);
    assert.match(stylesSource, /\.autoMatchActions\s*\{/);
});

test("mentee profile exposes timeline, stats and a text alternative to its availability chart", () => {
    assert.match(componentSource, /aria-label="Mentorship timeline"/);
    assert.match(componentSource, /getMenteeTimeline\(mentee\)/);
    assert.doesNotMatch(componentSource, /getMenteeLifecycle/);
    assert.match(componentSource, /aria-current=\{isTimelineEnd\(step\) \? "step" : undefined\}/);
    assert.match(componentSource, /Weekly availability \(UTC\)/);
    assert.match(componentSource, /getWeeklyAvailabilityHours\(availability\)/);
    assert.match(componentSource, /<dl className=\{styles\.profileAvailabilityList\}>/);
    assert.match(componentSource, /<dt>\{day\}<\/dt>/);
    assert.match(componentSource, /className=\{styles.availabilityTrack\} aria-hidden="true"/);
    assert.match(componentSource, /<span>\{label\}<\/span>/);
    assert.match(componentSource, /Mentorship details/);
    assert.match(componentSource, /Sessions this mentee joined as a pilot, newest first\. Times are UTC\. Status is as recorded\./);
});

test("mentee profile keeps a clear way back, a next-session block, tabbed records and the unchanged feedback section", () => {
    assert.match(componentSource, /<ArrowLeft size=\{17\} aria-hidden="true"\/>Back to mentees/);
    assert.match(componentSource, /const MenteeNextSession/);
    assert.match(componentSource, /formatSessionHeadline\(time\)/);
    assert.match(componentSource, /role="tablist" aria-label="Mentee records"/);
    assert.match(componentSource, /label: "Training sessions", shortLabel: "Sessions"/);
    assert.match(componentSource, /label: "Session sign-ups", shortLabel: "Sign-ups"/);
    assert.match(componentSource, /label: "Notes", shortLabel: "Notes"/);
    assert.match(componentSource, /<RecentTrainingFeedback menteeRecordId=\{selectedMentee\.id\}\/>/);
    assert.match(componentSource, /const MenteeScheduleDialog/);
    assert.doesNotMatch(componentSource, /schedulingPanel|Ownership details/);
});

test("session rows keep View first at a fixed width, and sign-ups open the session read-only", () => {
    assert.match(componentSource, /<button type="button" className=\{styles\.viewButton\}[^>]*onClick=\{\(\) => onView\(session\)\}>View<\/button>\s*\{!session\.cancelled \?/);
    assert.match(componentSource, /onView=\{session => openSession\(session, false\)\}/);
    assert.match(componentSource, /joined this session as a pilot\. It belongs to/);
    assert.match(componentSource, /readOnlyNote \? <p className=\{styles\.dialogNote\}>\{readOnlyNote\}<\/p> : null/);
    assert.match(componentSource, /\{busyAction === `cancel-\$\{session\.id\}` \? "Cancelling…" : "Cancel session"\}/);
    assert.match(componentSource, />\s*Keep session\s*</);
});

test("the assignment generator keeps the 1,500 character limit and labels its send action", () => {
    assert.match(componentSource, /const MAX_ASSIGNMENT_CODE_POINTS = 1500/);
    assert.match(componentSource, /\{isEditMode \? "Save & update" : "Send to thread"\}/);
    assert.match(componentSource, /aria-expanded=\{previewOpen\}/);
    assert.match(componentSource, /Edits here replace the generated text\. Changing slots regenerates it\./);
});

test("the profile editor dialog explains where changes go and edits several times per day", () => {
    assert.match(editorSource, /Changes are recorded in audit logs and sent to mentee-logs\./);
    assert.match(editorSource, /<legend>Weekly availability \(UTC\)<\/legend>/);
    assert.match(editorSource, /WeeklyAvailabilityEditor id=\{`\$\{editorId\}-availability`\}/);
    assert.match(editorSource, /triggerContent = "Edit profile"/);
});
