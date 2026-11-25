import assert from "node:assert/strict";
import {test} from "node:test";
import {authorName, channelNames, type ArchiveStream} from "./archive";

const legacy: ArchiveStream = {
    id: "archive", rootId: "archive", kind: "legacy", state: "ready", gap: false,
    title: "ExampleIFC - Unknown mentor", menteeName: "ExampleIFC", mentorName: "Unknown mentor",
};

test("legacy channel names display N/A without requiring an update to the stored titles", () => {
    assert.equal(channelNames(legacy).title, "ExampleIFC - N/A");
    assert.equal(channelNames({...legacy, mentorName: undefined}).title, "ExampleIFC - N/A");
    assert.equal(channelNames({...legacy, title: "Removed mentee - Unknown mentor", menteeName: undefined}).title, "Removed mentee - N/A");
    assert.equal(channelNames({...legacy, title: "Removed transcript", menteeName: undefined}).title, "Removed transcript");
});

test("only confirmed waitlist entries use Waitlist as the missing mentor label", () => {
    assert.equal(channelNames({...legacy, mentorshipState: "waitlisted"}).title, "ExampleIFC - Waitlist");
    assert.equal(channelNames({...legacy, mentorshipState: "terminated"}).title, "ExampleIFC - N/A");
    assert.equal(channelNames({...legacy, mentorshipState: "passed", mentorName: "Taylor"}).title, "ExampleIFC - Taylor");
});

test("visible names hide the zero discriminator while preserving old Discord tags", () => {
    assert.equal(channelNames({...legacy, menteeName: "ExampleIFC#0000", mentorName: "Mentor#0000"}).title, "ExampleIFC - Mentor");
    assert.equal(authorName({author: {username: "example#0000"}}), "example");
    assert.equal(authorName({author: {username: "example#1234"}}), "example#1234");
    assert.equal(authorName({author: {username: "example", display_name: "Example"}}), "Example");
});
