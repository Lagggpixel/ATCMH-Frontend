import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(join(currentDir, "AdminMentees.tsx"), "utf8");
const stylesSource = readFileSync(join(currentDir, "AdminMentees.module.css"), "utf8");
const paginationSource = readFileSync(join(currentDir, "AdminPagination.tsx"), "utf8");

test("mentee index separates table/cards views from the profile route and defaults to the table", () => {
    assert.match(componentSource, /const MenteeListPage/);
    assert.match(componentSource, /const MenteeProfilePage/);
    assert.match(componentSource, /type MenteeView = "cards" \| "table"/);
    assert.match(componentSource, /MENTEE_VIEW_PARAM/);
    assert.match(componentSource, /aria-label="Mentee filters and view options"/);
    assert.match(componentSource, /aria-pressed=\{view === "cards"\}/);
    assert.match(componentSource, /value === "cards" \? "cards" : "table"/);
    assert.match(componentSource, /className=\{styles\.menteesCardGrid\}/);
    assert.match(componentSource, /className=\{styles\.menteesTable\}/);
    assert.match(componentSource, /className=\{styles\.profilePage\}/);
    assert.match(componentSource, /className=\{styles\.filterFieldMeta\}/);
    assert.match(componentSource, /pagination\.totalItems} matching/);
    assert.match(componentSource, /const getMentorDisplayName/);
    assert.match(componentSource, /return mentorId \? getUserName\(mentorId\) : "None"/);
    assert.match(componentSource, /Track the waitlist, your mentees and their mentorship\./);
    assert.doesNotMatch(componentSource, /menteesPageHeader|menteesPageCount|menteesListMeta/);
    assert.doesNotMatch(componentSource, /Browse the mentorship queue, check ownership/);
    assert.doesNotMatch(componentSource, /Select a mentee to view their profile\./);
    assert.match(stylesSource, /\.menteesCardGrid\s*\{/);
    assert.match(stylesSource, /\.menteesTableWrap\s*\{/);
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

test("status tabs, mentor filter and sortable columns drive the list", () => {
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
});

test("clicking anywhere on a table row opens the mentee profile", () => {
    assert.match(componentSource, /className=\{styles\.menteeRow\} onClick=\{event => openRowUnlessControl\(event, \(\) => onOpen\(mentee\.id\)\)\}/);
    assert.match(componentSource, /closest\("button, a, input, select"\)/);
    assert.match(componentSource, /className=\{styles\.tableMenteeButton\} onClick=\{\(\) => onOpen\(mentee\.id\)\}/);
    assert.match(stylesSource, /\.menteeRow\s*\{[^}]*cursor:\s*pointer/);
});

test("mentee search work is indexed and list rows avoid unnecessary rerenders", () => {
    assert.match(componentSource, /const menteeSearchTextById = useMemo/);
    assert.match(componentSource, /new Map\(mentees\.map/);
    assert.match(componentSource, /return menteeSearchTextById\.get\(mentee\.id\)\?\.includes\(normalized\)/);
    assert.match(componentSource, /const MenteeCard = memo/);
    assert.match(componentSource, /const MenteeTable = memo/);
    assert.match(componentSource, /const AutoMatchPanel = memo/);
});

test("mobile mentees keep the list usable and profile content readable", () => {
    assert.match(stylesSource, /\.menteesToolbar\s*\{/);
    assert.match(stylesSource, /\.menteesCardGrid\s*\{/);
    assert.match(stylesSource, /\.profileCards\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(stylesSource, /@media \(max-width: 760px\)[\s\S]*?\.menteesTable tbody tr\s*\{[^}]*display:\s*grid/);
    assert.match(stylesSource, /@media \(max-width: 620px\)/);
    assert.match(stylesSource, /\.sessionsTable tr\s*\{[^}]*grid-template-columns:/);
    assert.match(stylesSource, /\.menteeCardFooter\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
    assert.match(stylesSource, /\.menteeCardFooter span:first-child\s*\{[^}]*white-space:\s*nowrap;/);
    assert.match(stylesSource, /\.menteeCardFooter span:last-child\s*\{[^}]*white-space:\s*nowrap;/);
    assert.match(stylesSource, /\.menteesTableWrap\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto;/s);
    assert.match(stylesSource, /@media \(max-width: 620px\)[\s\S]*?\.menteesIntro \.autoMatchToggleButton\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none/s);
});

test("state actions use custom confirmation semantics and pagination exposes its semantics", () => {
    assert.doesNotMatch(componentSource, /window\.confirm/);
    assert.match(componentSource, /MenteeActionConfirmation/);
    assert.match(componentSource, /Pick up this mentee\?/);
    assert.match(componentSource, /Pass this mentee\?/);
    assert.match(componentSource, /className=\{styles\.dangerStateAction\}/);
    assert.match(componentSource, /role="dialog" aria-modal="true"/);
    assert.match(componentSource, /styles\.dangerButton/);
    assert.match(paginationSource, /aria-current=\{i === page \? "page" : undefined\}/);
});

test("waitlist view exposes a shared weekly UTC availability matcher that filters the main list", () => {
    assert.match(componentSource, /statusFilter === "waitlisted" && autoMatchSearched && !autoMatchCandidateIds\.has/);
    assert.match(componentSource, /AutoMatchPanel/);
    assert.match(componentSource, /className=\{styles\.autoMatchToggleButton\}/);
    assert.match(componentSource, /aria-expanded=\{autoMatchVisible\}/);
    assert.match(componentSource, /autoMatchVisible \? \(/);
    assert.match(componentSource, /updateListQuery\(\{status: "waitlisted"\}\);\s*setAutoMatchOpen\(true\)/);
    assert.match(componentSource, /defaultWeeklyAvailabilityAnswer/);
    assert.match(componentSource, /WeeklyAvailabilityEditor id="mentor-weekly-availability"/);
    assert.match(componentSource, /Auto-match by weekly UTC availability/);
    assert.doesNotMatch(componentSource, /Window start \(Zulu\)|Window end \(Zulu\)/);
    assert.match(componentSource, /Strict · overlap only/);
    assert.match(componentSource, /Medium · up to 30 min gap/);
    assert.match(componentSource, /Very loose · up to 2 hr gap/);
    assert.match(componentSource, /autoMatchCandidateIds\.has\(mentee\.id\)/);
    assert.match(componentSource, /const autoMatchActive = statusFilter === "waitlisted" && autoMatchSearched/);
    assert.match(componentSource, /match=\{autoMatchActive \? autoMatchCandidateById\.get\(mentee\.id\) : undefined\}/);
    assert.match(componentSource, /className=\{styles\.tableMatchSummary\}/);
    assert.match(componentSource, /accountId: string \| undefined/);
    assert.match(componentSource, /getWaitlistHelperPreferences/);
    assert.match(componentSource, /saveWaitlistHelperPreferences/);
    assert.match(componentSource, /autoMatchPreferencesLoadedFor/);
    assert.match(componentSource, /autoMatchSaveQueue/);
    assert.doesNotMatch(componentSource, /autoMatchCandidateList/);
    assert.doesNotMatch(componentSource, /selectedAutoMatchIds|AutoMatchSelectionBar|AutoMatchPickupConfirmation|showAutoMatchPickupModal|handleAutoMatchPickup|requestAutoMatchPickup|Pick up selected|Pick up matched mentees\?|Select match|onAutoMatchToggle=|onAutoMatchToggleAll=|onAutoMatchPickup=/);
    assert.match(componentSource, /Weekly availability \(UTC\)/);
    assert.match(stylesSource, /\.autoMatchPanel\s*\{/);
    assert.match(stylesSource, /\.autoMatchActions\s*\{/);
    assert.doesNotMatch(stylesSource, /\.autoMatchSelectionBar\s*\{|\.autoMatchSelectionControls\s*\{|\.autoMatchSelectionCheckbox\s*\{|\.menteeCardMatchSelect\s*\{|\.tableMatchSelect\s*\{/);
});

test("mentee profile exposes timeline and text alternatives to its availability chart", () => {
    assert.match(componentSource, /aria-label="Mentorship timeline"/);
    assert.match(componentSource, /getMenteeTimeline\(mentee\)/);
    assert.doesNotMatch(componentSource, /getMenteeLifecycle/);
    assert.match(componentSource, /aria-current=\{isTimelineEnd\(step\) \? "step" : undefined\}/);
    assert.match(componentSource, /<dl className=\{styles\.profileAvailabilityList\}>/);
    assert.match(componentSource, /<dt>\{day\}<\/dt>/);
    assert.match(componentSource, /className=\{styles.availabilityTrack\} aria-hidden="true"/);
    assert.match(componentSource, /<span>\{label\}<\/span>/);
    assert.match(componentSource, /Pilot sign-up history, newest first. Times are UTC. Status is as recorded/);
});

test("mentee profile keeps a clear way back, tabbed records and the unchanged feedback section", () => {
    assert.match(componentSource, /<ArrowLeft size=\{17\} aria-hidden="true"\/>Back to mentees/);
    assert.match(componentSource, /role="tablist" aria-label="Mentee records"/);
    assert.match(componentSource, /label: "Training sessions"/);
    assert.match(componentSource, /label: "Session sign-up history"/);
    assert.match(componentSource, /label: "Notes"/);
    assert.match(componentSource, /<RecentTrainingFeedback menteeRecordId=\{selectedMentee\.id\}\/>/);
    assert.match(componentSource, /Ownership details/);
    assert.match(componentSource, /const MenteeScheduleDialog/);
    assert.doesNotMatch(componentSource, /schedulingPanel/);
});
