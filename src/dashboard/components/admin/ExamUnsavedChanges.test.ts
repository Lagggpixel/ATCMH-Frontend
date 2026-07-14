import assert from "node:assert/strict";
import test from "node:test";
import {
    createExamUnsavedChangesGuard,
    EXAM_UNSAVED_CHANGES_MESSAGE,
    stableExamValue,
} from "./ExamUnsavedChanges.ts";

type Listener = (event: unknown) => void;

const createEnvironment = (confirmResult = true) => {
    const listeners = new Map<string, Set<Listener>>();
    const location = {
        href: "https://www.atcmh.org/dashboard/exams/new",
        origin: "https://www.atcmh.org",
        assigned: [] as string[],
        assign(url: string) {
            this.assigned.push(url);
        },
    };
    const history = {
        state: null as unknown,
        pushed: [] as unknown[],
        goCalls: [] as number[],
        backCalls: 0,
        pushState(state: unknown) {
            this.state = state;
            this.pushed.push(state);
        },
        go(delta: number) {
            this.goCalls.push(delta);
        },
        back() {
            this.backCalls++;
        },
    };
    const target = {
        addEventListener(type: string, listener: Listener) {
            const registered = listeners.get(type) ?? new Set<Listener>();
            registered.add(listener);
            listeners.set(type, registered);
        },
        removeEventListener(type: string, listener: Listener) {
            listeners.get(type)?.delete(listener);
        },
        emit(type: string, event: unknown = {}) {
            for (const listener of listeners.get(type) ?? []) listener(event);
        },
        count(type: string) {
            return listeners.get(type)?.size ?? 0;
        },
    };

    return {
        window: {...target, confirm: () => confirmResult, location, history},
        document: target,
        location,
        history,
        target,
    };
};

test("serializes nested objects deterministically while preserving array order", () => {
    assert.equal(
        stableExamValue({title: "Tower", sections: [{b: 2, a: 1}], settings: {z: false, a: true}}),
        stableExamValue({settings: {a: true, z: false}, sections: [{a: 1, b: 2}], title: "Tower"}),
    );
    assert.notEqual(stableExamValue({items: ["first", "second"]}), stableExamValue({items: ["second", "first"]}));
});

test("clean navigation bypasses confirmation and runs once", () => {
    const environment = createEnvironment(false);
    const guard = createExamUnsavedChangesGuard({isDirty: () => false}, environment);
    let calls = 0;

    guard.activate();

    assert.equal(guard.confirmAndRun(() => calls++), true);
    assert.equal(calls, 1);
    assert.equal(environment.target.count("beforeunload"), 0);
});

test("Cancel invokes no navigation action", () => {
    const environment = createEnvironment(false);
    const guard = createExamUnsavedChangesGuard({isDirty: () => true}, environment);
    let calls = 0;

    guard.activate();

    assert.equal(guard.confirmAndRun(() => calls++), false);
    assert.equal(calls, 0);
});

test("Leave disarms protection and invokes navigation exactly once", () => {
    const environment = createEnvironment(true);
    const guard = createExamUnsavedChangesGuard({isDirty: () => true}, environment);
    let calls = 0;

    guard.activate();

    assert.equal(guard.confirmAndRun(() => calls++), true);
    assert.equal(calls, 1);
    assert.equal(environment.target.count("beforeunload"), 0);
});

test("Back restores the sentinel after Cancel and leaves after confirmation", () => {
    const cancelled = createEnvironment(false);
    const cancelledGuard = createExamUnsavedChangesGuard({isDirty: () => true}, cancelled);
    cancelledGuard.activate();
    cancelled.window.emit("popstate");
    assert.deepEqual(cancelled.history.goCalls, [1]);

    const leaving = createEnvironment(true);
    const leavingGuard = createExamUnsavedChangesGuard({isDirty: () => true}, leaving);
    leavingGuard.activate();
    leaving.window.emit("popstate");
    assert.equal(leaving.history.backCalls, 1);
    assert.equal(leaving.target.count("popstate"), 0);
});

test("dirty protection captures same-origin links and removes every listener when disarmed", () => {
    const environment = createEnvironment(true);
    const guard = createExamUnsavedChangesGuard({isDirty: () => true}, environment);
    const click = {
        button: 0,
        defaultPrevented: false,
        preventDefault() {
            this.defaultPrevented = true;
        },
        target: {
            closest: () => ({href: "https://www.atcmh.org/dashboard/exams"}),
        },
    };

    guard.activate();
    environment.document.emit("click", click);

    assert.equal(click.defaultPrevented, true);
    assert.deepEqual(environment.location.assigned, ["https://www.atcmh.org/dashboard/exams"]);
    for (const type of ["beforeunload", "popstate", "click"]) assert.equal(environment.target.count(type), 0);
    assert.equal(EXAM_UNSAVED_CHANGES_MESSAGE, "You have unsaved Exam Center changes. Leave and discard them?");
});
