import test from "node:test";
import assert from "node:assert/strict";
import type {ManagedCourseDraft} from "../../types/Course";
import {courseDraftForSave} from "./course-editor-save";

const draft: ManagedCourseDraft = {
    id: "course-id", slug: "ground", title: "Ground", description: "", isPublished: false,
    navigationMode: "sequential",
    sectionGroups: [{id: "group-id", title: "Ground", sortOrder: 1}],
    sections: [
        {id: "saved-id", groupId: "group-id", title: "Existing", sortOrder: 1, markdown: "Saved content"},
        {id: "draft-id", groupId: "group-id", title: "New", sortOrder: 2, markdown: "New content"},
    ],
};

test("saving a course keeps existing IDs and lets the API assign IDs to new subsections", () => {
    const request = courseDraftForSave(draft, new Set(["saved-id"]));
    assert.equal(request.sections[0].id, "saved-id");
    assert.equal(request.sections[1].id, undefined);
    assert.equal(request.sections[1].title, "New");
    assert.equal(request.sections[1].markdown, "New content");
    assert.equal(draft.sections[1].id, "draft-id");
});

test("creating a course sends no provisional subsection IDs", () => {
    const request = courseDraftForSave({...draft, id: undefined}, new Set());
    assert.deepEqual(request.sections.map(section => section.id), [undefined, undefined]);
});
