const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core.js");

function tapAll(session) {
  const shown = [];
  let s = session;
  while (!core.isFinished(s)) {
    shown.push(core.nextChunk(s));
    s = core.completeCard(s);
  }
  return { shown, session: s };
}

test("goal 50 split by 10 shows five cards of 10 and ends at 50", () => {
  const start = core.createSession(50, 10);
  assert.equal(core.nextChunk(start), 10);
  assert.equal(core.setsTotal(start), 5);

  const { shown, session } = tapAll(start);
  assert.deepEqual(shown, [10, 10, 10, 10, 10]);
  assert.equal(session.done, 50);
  assert.equal(core.setsDone(session), 5);
  assert.equal(core.isFinished(session), true);
});

test("each tap adds the card number to the current count", () => {
  let s = core.createSession(50, 10);
  s = core.completeCard(s);
  assert.equal(s.done, 10);
  s = core.completeCard(s);
  assert.equal(s.done, 20);
});

test("last card shows only the remainder and never passes the goal", () => {
  const start = core.createSession(55, 10);
  assert.equal(core.setsTotal(start), 6);

  const { shown, session } = tapAll(start);
  assert.deepEqual(shown, [10, 10, 10, 10, 10, 5]);
  assert.equal(session.done, 55);
});

test("tapping after the goal is reached changes nothing", () => {
  const { session } = tapAll(core.createSession(20, 10));
  const again = core.completeCard(session);
  assert.equal(again.done, 20);
  assert.equal(core.nextChunk(again), 0);
  assert.equal(core.setsDone(again), 2);
});

test("completeCard returns a new session and leaves the old one untouched", () => {
  const before = core.createSession(30, 10);
  const after = core.completeCard(before);
  assert.equal(before.done, 0);
  assert.equal(before.history.length, 0);
  assert.equal(after.done, 10);
});

test("undo removes exactly the last card, including a remainder card", () => {
  const { session } = tapAll(core.createSession(25, 10));
  assert.equal(session.done, 25);

  const once = core.undo(session);
  assert.equal(once.done, 20);
  assert.equal(core.nextChunk(once), 5);

  const twice = core.undo(once);
  assert.equal(twice.done, 10);
  assert.equal(core.nextChunk(twice), 10);
});

test("undo on a fresh session changes nothing", () => {
  const s = core.undo(core.createSession(50, 10));
  assert.equal(s.done, 0);
  assert.equal(core.canUndo(s), false);
});

test("invalid input is corrected to a usable range", () => {
  assert.deepEqual(pick(core.createSession(0, 10)), { goal: 1, step: 1 });
  assert.deepEqual(pick(core.createSession(-5, -2)), { goal: 1, step: 1 });
  assert.deepEqual(pick(core.createSession("abc", "")), { goal: 50, step: 10 });
  assert.deepEqual(pick(core.createSession(30, 100)), { goal: 30, step: 30 });
  assert.deepEqual(pick(core.createSession("40", "7.9")), { goal: 40, step: 7 });
  assert.deepEqual(pick(core.createSession(123456, 10)), { goal: 9999, step: 10 });
});

test("progress is the done share of the goal between 0 and 1", () => {
  let s = core.createSession(40, 10);
  assert.equal(core.progress(s), 0);
  s = core.completeCard(s);
  assert.equal(core.progress(s), 0.25);
  assert.equal(core.progress(tapAll(s).session), 1);
});

test("a saved session survives a JSON round trip", () => {
  let s = core.createSession(55, 10);
  s = core.completeCard(core.completeCard(s));
  const back = core.restore(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back, s);
  assert.equal(core.nextChunk(back), 10);
});

test("broken saved data is rejected instead of trusted", () => {
  assert.equal(core.restore(null), null);
  assert.equal(core.restore("50"), null);
  assert.equal(core.restore({ goal: 50, step: 10 }), null);
  assert.equal(core.restore({ goal: 50, step: 10, done: 30, history: [10, 10] }), null);
  assert.equal(core.restore({ goal: 20, step: 10, done: 30, history: [10, 10, 10] }), null);
  assert.equal(core.restore({ goal: 50, step: 10, done: 10, history: ["10"] }), null);
});

function pick(s) {
  return { goal: s.goal, step: s.step };
}
