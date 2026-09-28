import test from "node:test";
import assert from "node:assert/strict";
import type {ManagedCourseDraft} from "../../types/Course";
import {orderedCourseDraft} from "./course-editor-order";

const draft: ManagedCourseDraft = {
    slug: "ground", title: "Ground", description: "", isPublished: false,
    navigationMode: "sequential",
    sectionGroups: [
        {id: "ground", title: "Ground", sortOrder: 1},
        {id: "tower", title: "Tower", sortOrder: 2},
    ],
    sections: [
        {id: "a", groupId: "ground", title: "A", sortOrder: 1, markdown: "A content"},
        {id: "b", groupId: "ground", title: "B", sortOrder: 2, markdown: "B content"},
        {id: "c", groupId: "tower", title: "C", sortOrder: 3, markdown: "C content"},
    ],
};

test("reordering parents keeps their subsections and content together", () => {
    const reordered = orderedCourseDraft(draft, [...draft.sectionGroups].reverse());
    assert.deepEqual(reordered.sectionGroups.map(group => [group.id, group.sortOrder]), [["tower", 1], ["ground", 2]]);
    assert.deepEqual(reordered.sections.map(section => [section.id, section.sortOrder]), [["c", 1], ["a", 2], ["b", 3]]);
    assert.equal(reordered.sections[2].markdown, "B content");
});

test("moving a subsection to another parent preserves its identity and content", () => {
    const moved = orderedCourseDraft(draft, draft.sectionGroups,
        draft.sections.map(section => section.id === "b" ? {...section, groupId: "tower"} : section));
    assert.deepEqual(moved.sections.map(section => [section.id, section.groupId, section.sortOrder]),
        [["a", "ground", 1], ["b", "tower", 2], ["c", "tower", 3]]);
    assert.equal(moved.sections[1].markdown, "B content");
});
