import assert from "node:assert/strict";
import test from "node:test";

import { createAttemptNavigationProtection, sendAttemptKeepalive } from "./attempt-navigation";

const LEAVING_MESSAGE = "Leaving will submit your current answers. Stay on this page to continue the exam.";

class FakeWindow {
  readonly listeners = new Map<string, Set<(event: any) => void>>();
  readonly location = {
    href: "https://exams.atcmh.org/exams/quizzes/quiz-1/attempt",
    assign: (href: string) => { this.assigned.push(href); },
  };
  readonly history = {
    pushState: (_state: unknown, _title: string, _url?: string | URL | null) => { this.pushes += 1; },
    go: (delta: number) => { this.historyMoves.push(delta); },
    back: () => { this.backCalls += 1; },
  };
  readonly assigned: string[] = [];
  readonly historyMoves: number[] = [];
  pushes = 0;
  backCalls = 0;
  confirmed = true;

  addEventListener(type: string, listener: (event: any) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  confirm(message: string) {
    assert.equal(message, LEAVING_MESSAGE);
    return this.confirmed;
  }

  dispatch(type: string, event: any = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function click(anchor: { href: string; target?: string; hasAttribute?(name: string): boolean }, extras: Record<string, unknown> = {}) {
  let prevented = false;
  return {
    button: 0,
    defaultPrevented: false,
    preventDefault() { prevented = true; this.defaultPrevented = true; },
    target: { closest: () => ({ hasAttribute: () => false, ...anchor }) },
    ...extras,
    get prevented() { return prevented; },
  };
}

test("active protection warns before unloading even without answers", () => {
  const window = new FakeWindow();
  const protection = createAttemptNavigationProtection({
    window,
    quizId: "quiz-1",
    getAnswers: () => ({}),
    onConfirmedNavigation: async () => true,
  });
  protection.install();

  const event: { preventDefault(): void; returnValue?: string } = { preventDefault() {} };
  window.dispatch("beforeunload", event);

  assert.equal(event.returnValue, LEAVING_MESSAGE);
});

test("cancelling a same-origin link leaves the attempt active without submitting", async () => {
  const window = new FakeWindow();
  window.confirmed = false;
  let submissions = 0;
  const protection = createAttemptNavigationProtection({
    window,
    quizId: "quiz-1",
    getAnswers: () => ({ question: "answer" }),
    onConfirmedNavigation: async () => { submissions += 1; return true; },
  });
  protection.install();
  const event = click({ href: "https://exams.atcmh.org/exams/quizzes" });

  window.dispatch("click", event);
  await Promise.resolve();

  assert.equal(event.prevented, true);
  assert.equal(submissions, 0);
  assert.deepEqual(window.assigned, []);
});

test("confirmed same-origin links submit once and only navigate after success", async () => {
  const window = new FakeWindow();
  let release!: (result: boolean) => void;
  let submissions = 0;
  const protection = createAttemptNavigationProtection({
    window,
    quizId: "quiz-1",
    getAnswers: () => ({ question: "answer" }),
    onConfirmedNavigation: () => {
      submissions += 1;
      return new Promise((resolve) => { release = resolve; });
    },
  });
  protection.install();
  const event = click({ href: "https://exams.atcmh.org/exams/quizzes" });
  window.dispatch("click", event);
  window.dispatch("click", click({ href: "https://exams.atcmh.org/exams/quizzes" }));

  assert.equal(submissions, 1);
  assert.deepEqual(window.assigned, []);
  release(true);
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(window.assigned, ["https://exams.atcmh.org/exams/quizzes"]);
});

test("pagehide sends the most recently selected answers", () => {
  const window = new FakeWindow();
  let answers = { question: "first" };
  const sent: Array<Record<string, string>> = [];
  const protection = createAttemptNavigationProtection({
    window,
    quizId: "quiz one",
    getAnswers: () => answers,
    onConfirmedNavigation: async () => true,
    sendKeepalive: (_quizId, currentAnswers) => { sent.push(currentAnswers); return true; },
  });
  protection.install();
  answers = { question: "latest" };

  window.dispatch("pagehide");

  assert.deepEqual(sent, [{ question: "latest" }]);
});

test("back restores the sentinel on cancel and submits before leaving on confirmation", async () => {
  const window = new FakeWindow();
  window.confirmed = false;
  let submissions = 0;
  const protection = createAttemptNavigationProtection({
    window,
    quizId: "quiz-1",
    getAnswers: () => ({}),
    onConfirmedNavigation: async () => { submissions += 1; return true; },
  });
  protection.install();
  assert.equal(window.pushes, 1);

  window.dispatch("popstate");
  await Promise.resolve();
  assert.deepEqual(window.historyMoves, [1]);
  assert.equal(submissions, 0);

  window.confirmed = true;
  window.dispatch("popstate");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(submissions, 1);
  assert.equal(window.backCalls, 1);
});

test("modified and external links are left to the browser", () => {
  const window = new FakeWindow();
  const protection = createAttemptNavigationProtection({
    window,
    quizId: "quiz-1",
    getAnswers: () => ({}),
    onConfirmedNavigation: async () => true,
  });
  protection.install();
  const external = click({ href: "https://example.com/" });
  const modified = click({ href: "https://exams.atcmh.org/exams/quizzes" }, { metaKey: true });

  window.dispatch("click", external);
  window.dispatch("click", modified);

  assert.equal(external.prevented, false);
  assert.equal(modified.prevented, false);
});

test("uninstall removes all lifecycle listeners", () => {
  const window = new FakeWindow();
  const protection = createAttemptNavigationProtection({
    window,
    quizId: "quiz-1",
    getAnswers: () => ({}),
    onConfirmedNavigation: async () => true,
  });
  protection.install();
  protection.uninstall();

  assert.deepEqual([...window.listeners.values()].map((listeners) => listeners.size), [0, 0, 0, 0]);
});

test("keepalive helper posts the encoded quiz id and reports synchronous failure", () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  assert.equal(sendAttemptKeepalive("quiz one", { question: "answer" }, "csrf-token", (input, init) => {
    requests.push({ input, init });
    return Promise.resolve(new Response());
  }), true);
  assert.equal(requests[0].input, "/exams/api/quizzes/quiz%20one/attempt/submit");
  assert.deepEqual(requests[0].init, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "text/plain;charset=UTF-8", "X-CSRF-Token": "csrf-token" },
    body: JSON.stringify({ answers: { question: "answer" } }),
    keepalive: true,
  });
  assert.equal(sendAttemptKeepalive("quiz-1", {}, "csrf", () => { throw new Error("offline"); }), false);
});

test("keepalive helper observes rejected requests while reporting synchronous start", async () => {
  assert.equal(sendAttemptKeepalive("quiz-1", {}, "csrf", () => Promise.reject(new Error("offline"))), true);

  await new Promise((resolve) => setImmediate(resolve));
});
