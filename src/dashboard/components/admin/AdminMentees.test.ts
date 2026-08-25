import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(join(currentDir, "AdminMentees.tsx"), "utf8");
const stylesSource = readFileSync(join(currentDir, "AdminMentees.module.css"), "utf8");
const paginationSource = readFileSync(join(currentDir, "AdminPagination.tsx"), "utf8");

test("mentee index separates cards/table views from the profile route", () => {
    assert.match(componentSource, /const MenteeListPage/);
    assert.match(componentSource, /const MenteeProfilePage/);
    assert.match(componentSource, /type MenteeView = "cards" \| "table"/);
    assert.match(componentSource, /MENTEE_VIEW_PARAM/);
    assert.match(componentSource, /aria-label="Mentee filters and view options"/);
    assert.match(componentSource, /aria-pressed=\{view === "cards"\}/);
    assert.match(componentSource, /className=\{styles\.menteesCardGrid\}/);
    assert.match(componentSource, /className=\{styles\.menteesTable\}/);
    assert.match(componentSource, /className=\{styles\.profilePage\}/);
    assert.match(componentSource, /className=\{styles\.filterFieldMeta\}/);
    assert.match(componentSource, /pagination\.totalItems} matching/);
    assert.match(componentSource, /const getMentorDisplayName/);
    assert.match(componentSource, /return mentorId \? getUserName\(mentorId\) : "None"/);
    assert.doesNotMatch(componentSource, /menteesPageHeader|menteesPageCount|menteesListMeta/);
    assert.doesNotMatch(componentSource, /Browse the mentorship queue, check ownership/);
    assert.doesNotMatch(componentSource, /Select a mentee to view their profile\./);
    assert.match(stylesSource, /\.menteesCardGrid\s*\{/);
    assert.match(stylesSource, /\.menteesTableWrap\s*\{/);
});

test("mentee filters reset pagination and expose a no-results recovery state", () => {
    assert.match(componentSource, /const filter = searchParams\.get\(MENTEE_SEARCH_PARAM\)/);
    assert.match(componentSource, /updateListQuery\(\{search: event\.target\.value\}\)/);
    assert.match(componentSource, /handleMentorFilterChange/);
    assert.match(componentSource, /MENTOR_FILTER_PARAM/);
    assert.match(componentSource, /menteeRoute\(id\)/);
    assert.match(componentSource, /No mentees match these filters/);
    assert.match(componentSource, /onClearFilters/);
    assert.match(componentSource, /search: "", mentorFilter: "all"/);
});

test("mobile mentees keep the list usable and profile content readable", () => {
    assert.match(stylesSource, /\.menteesToolbar\s*\{/);
    assert.match(stylesSource, /\.menteesCardGrid\s*\{/);
    assert.match(stylesSource, /\.profilePage \.detailGrid\s*\{/);
    assert.match(stylesSource, /@media \(max-width: 620px\)/);
    assert.match(stylesSource, /\.sessionsTable tr\s*\{[^}]*grid-template-columns:/);
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
