import assert from "node:assert/strict";
import test from "node:test";
import {createGroundControlDocument} from "./ground-control-course";
import {validateCourseDocument, courseDocumentReferences} from "./course-document";

test("Ground Control teaches eight blocks with practice separate from the final assessment", () => {
  const quizId = "be5effff-5b8e-4719-b5e0-87c62b99d549";
  const document = validateCourseDocument(createGroundControlDocument(quizId));
  assert.equal(document.blocks.filter(block => block.type === "check").length, 5);
  assert.deepEqual(document.blocks.at(-1), {id: document.blocks.at(-1)!.id, type: "quiz", quizId, required: true, passPercent: 80});
  const references = courseDocumentReferences(document).filter(ref => ref.type === "quiz" || ref.type === "activity");
  assert.deepEqual(references, [{type: "quiz", id: quizId, required: true, passPercent: 80}]);
  assert.equal(document.blocks.filter(block => block.type === "text" && /^## [1-8]\./m.test(block.markdown)).length, 8);
});


test("Ground Control checks provide distinct submitted feedback and include departure taxi", () => {
  const {blocks} = validateCourseDocument(createGroundControlDocument("be5effff-5b8e-4719-b5e0-87c62b99d549"));
  for (const block of blocks) {
    if (block.type !== "check") continue;
    assert.ok(block.explanation.length > 30);
    assert.ok(block.incorrectExplanation && block.incorrectExplanation.length > 30);
    assert.notEqual(block.explanation, block.incorrectExplanation);
  }
  const check = blocks[blocks.findIndex(block => block.id === "ground-taxi") + 1];
  assert.equal(check.type, "check");
  if (check.type === "check") assert.equal(check.options[check.correctOption], "Taxi to Runway X");
});

test("Runway crossings retain all states in two tables and one schematic", () => {
  const {blocks} = createGroundControlDocument("be5effff-5b8e-4719-b5e0-87c62b99d549");
  const crossings = blocks.slice(blocks.findIndex(block => block.id === "ground-crossings"), blocks.findIndex(block => block.id === "ground-frequency"));
  assert.equal(crossings.filter(block => block.type === "diagram").length, 1);
  assert.equal(crossings.filter(block => block.type === "callout" && block.tone === "warning").length, 1);
  assert.equal(crossings.filter(block => block.type === "text" && /^\| /m.test(block.markdown)).length, 2);
  const prose = crossings.flatMap(block => block.type === "text" || block.type === "callout" ? [block.markdown] : []).join("\n");
  for (const state of ["Has not started takeoff roll", "Rolling toward crossing point", "Airborne and visibly turning away", "Already past crossing point", "Before runway threshold", "Exiting before crossing point", "Occupying or moving through crossing area", "Past crossing point"]) assert.ok(prose.includes(state), state);
  assert.match(prose, /altitude alone is not the deciding criterion/);
  assert.match(prose, /crossing is imminent/);
  assert.doesNotMatch(prose, /a departure can permit a crossing/);
});

test("Command and responsibility teaching remains aligned", () => {
  const {blocks} = createGroundControlDocument("be5effff-5b8e-4719-b5e0-87c62b99d549");
  const text = (id: string) => {
    const block = blocks.find(block => block.id === id);
    assert.ok(block && (block.type === "text" || block.type === "callout"));
    return block.markdown;
  };
  assert.match(text("ground-pushback-heading"), /Give way to/);
  assert.match(text("ground-pushback-heading"), /Hold position/);
  assert.match(text("ground-conflicts"), /Prefer \*\*Give way to/);
  assert.match(text("ground-conflicts"), /Give way to Aircraft A/);
  assert.match(text("ground-role"), /within its assigned responsibility/);
  assert.match(text("ground-role"), /Tower retains responsibility for active-runway/);
  assert.match(text("ground-setup"), /ATIS and coordination/);
  assert.match(text("ground-setup"), /not as runway assignments/);
  assert.match(text("ground-intro"), /simulated-training/);
});
