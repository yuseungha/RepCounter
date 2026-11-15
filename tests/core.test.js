const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core.js");

/* 테스트용: 이름·목표·세트 수로 운동 목록을 바로 만든다 */
function libraryOf(...list) {
  return list.reduce((lib, [name, goal, sets]) => core.addExercise(lib, { name, goal, sets }), core.createLibrary());
}

function finishItem(w, index) {
  while (!core.itemFinished(w.items[index])) w = core.completeSet(w, index);
  return w;
}

/* ---------- 세트 나누기 ---------- */

test("split means number of sets: 100 in 4 sets is 25 each", () => {
  assert.deepEqual(core.splitSets(100, 4), [25, 25, 25, 25]);
  assert.deepEqual(core.splitSets(120, 5), [24, 24, 24, 24, 24]);
});

test("uneven split gives the extra reps to the earlier sets and keeps the total", () => {
  assert.deepEqual(core.splitSets(100, 3), [34, 33, 33]);
  assert.deepEqual(core.splitSets(10, 4), [3, 3, 2, 2]);
  for (const [goal, sets] of [[100, 3], [7, 7], [9999, 50], [55, 6]]) {
    assert.equal(core.splitSets(goal, sets).reduce((a, b) => a + b, 0), goal);
  }
});

/* ---------- 입력 보정 ---------- */

test("exercise input is corrected to a usable range", () => {
  const n = (input) => core.normalizeExercise(input, "운동 1");
  assert.deepEqual(n({ name: "  푸시업 ", goal: "100", sets: "4" }), { name: "푸시업", goal: 100, sets: 4 });
  assert.deepEqual(n({ name: "", goal: 0, sets: 0 }), { name: "운동 1", goal: 1, sets: 1 });
  assert.deepEqual(n({ name: "x", goal: "abc", sets: "" }), { name: "x", goal: 50, sets: 5 });
  assert.deepEqual(n({ name: "x", goal: 30, sets: 100 }), { name: "x", goal: 30, sets: 30 });
  assert.deepEqual(n({ name: "x", goal: 500, sets: 100 }), { name: "x", goal: 500, sets: 50 });
  assert.deepEqual(n({ name: "x", goal: 123456, sets: 7.9 }), { name: "x", goal: 9999, sets: 7 });
  assert.equal(n({ name: "가".repeat(30), goal: 10, sets: 1 }).name.length, 20);
});

/* ---------- 운동 목록 ---------- */

test("added exercises keep their order and are checked automatically", () => {
  const lib = libraryOf(["푸시업", 100, 4], ["스쿼트", 120, 5]);
  assert.deepEqual(lib.exercises.map((e) => e.name), ["푸시업", "스쿼트"]);
  assert.deepEqual(lib.selected, lib.exercises.map((e) => e.id));
  assert.notEqual(lib.exercises[0].id, lib.exercises[1].id);
});

test("an exercise without a name is called by its position", () => {
  const lib = libraryOf(["푸시업", 100, 4], ["", 30, 3]);
  assert.equal(lib.exercises[1].name, "운동 2");
});

test("update changes only the chosen exercise", () => {
  let lib = libraryOf(["푸시업", 100, 4], ["스쿼트", 120, 5]);
  const id = lib.exercises[0].id;
  lib = core.updateExercise(lib, id, { name: "니푸시업", goal: 60, sets: 3 });
  assert.deepEqual(lib.exercises[0], { id, name: "니푸시업", goal: 60, sets: 3 });
  assert.equal(lib.exercises[1].name, "스쿼트");
});

test("remove deletes the exercise and its check", () => {
  let lib = libraryOf(["푸시업", 100, 4], ["스쿼트", 120, 5]);
  const id = lib.exercises[0].id;
  lib = core.removeExercise(lib, id);
  assert.deepEqual(lib.exercises.map((e) => e.name), ["스쿼트"]);
  assert.equal(lib.selected.includes(id), false);
});

test("move changes order and stops at the ends", () => {
  let lib = libraryOf(["A", 10, 1], ["B", 10, 1], ["C", 10, 1]);
  const [a, , c] = lib.exercises.map((e) => e.id);
  lib = core.moveExercise(lib, c, -1);
  assert.deepEqual(lib.exercises.map((e) => e.name), ["A", "C", "B"]);
  lib = core.moveExercise(lib, a, -1);
  assert.deepEqual(lib.exercises.map((e) => e.name), ["A", "C", "B"]);
});

test("toggle checks and unchecks; selected list follows list order", () => {
  let lib = libraryOf(["A", 10, 1], ["B", 10, 1], ["C", 10, 1]);
  const [a, b, c] = lib.exercises.map((e) => e.id);
  lib = core.toggleSelected(lib, b);
  assert.deepEqual(core.selectedExercises(lib).map((e) => e.name), ["A", "C"]);
  lib = core.toggleSelected(lib, a);
  lib = core.toggleSelected(lib, a);
  assert.deepEqual(core.selectedExercises(lib).map((e) => e.name), ["A", "C"]);
  assert.equal(core.isSelected(lib, c), true);
});

test("library operations do not change the library they were given", () => {
  const before = libraryOf(["A", 10, 1]);
  const snapshot = JSON.stringify(before);
  core.addExercise(before, { name: "B", goal: 10, sets: 1 });
  core.toggleSelected(before, before.exercises[0].id);
  core.updateExercise(before, before.exercises[0].id, { name: "Z", goal: 1, sets: 1 });
  assert.equal(JSON.stringify(before), snapshot);
});

/* ---------- 운동 시작·진행 ---------- */

test("start uses only checked exercises in list order; nothing checked means no start", () => {
  let lib = libraryOf(["푸시업", 100, 4], ["턱걸이", 30, 3], ["스쿼트", 120, 5]);
  lib = core.toggleSelected(lib, lib.exercises[1].id);
  const w = core.startWorkout(lib);
  assert.deepEqual(w.items.map((i) => i.name), ["푸시업", "스쿼트"]);
  assert.equal(w.current, 0);
  assert.ok(w.items.every((i) => i.setsDone === 0));

  let none = lib;
  for (const e of core.selectedExercises(lib)) none = core.toggleSelected(none, e.id);
  assert.equal(core.startWorkout(none), null);
});

test("editing the library during a workout does not change the running workout", () => {
  let lib = libraryOf(["푸시업", 100, 4]);
  const w = core.startWorkout(lib);
  lib = core.updateExercise(lib, lib.exercises[0].id, { name: "X", goal: 10, sets: 1 });
  assert.equal(w.items[0].name, "푸시업");
  assert.equal(w.items[0].goal, 100);
});

test("each tap adds the current set of that exercise only", () => {
  let w = core.startWorkout(libraryOf(["푸시업", 100, 4], ["스쿼트", 120, 5]));
  assert.equal(core.nextChunk(w.items[0]), 25);
  w = core.completeSet(w, 0);
  w = core.completeSet(w, 1);
  w = core.completeSet(w, 0);
  assert.equal(core.itemDone(w.items[0]), 50);
  assert.equal(core.itemDone(w.items[1]), 24);
  assert.equal(core.itemProgress(w.items[0]), 0.5);
});

test("uneven sets are counted in order and finish exactly at the goal", () => {
  let w = core.startWorkout(libraryOf(["A", 100, 3]));
  const shown = [];
  while (!core.itemFinished(w.items[0])) {
    shown.push(core.nextChunk(w.items[0]));
    w = core.completeSet(w, 0);
  }
  assert.deepEqual(shown, [34, 33, 33]);
  assert.equal(core.itemDone(w.items[0]), 100);
  assert.equal(core.nextChunk(w.items[0]), 0);
  assert.equal(core.completeSet(w, 0), w);
});

test("undo removes only the last set of the chosen exercise", () => {
  let w = core.startWorkout(libraryOf(["A", 100, 3], ["B", 10, 2]));
  w = core.completeSet(core.completeSet(w, 0), 1);
  w = core.undoSet(w, 0);
  assert.equal(core.itemDone(w.items[0]), 0);
  assert.equal(core.itemDone(w.items[1]), 5);
  assert.equal(core.canUndo(w, 0), false);
  assert.equal(core.undoSet(w, 0), w);
});

test("next unfinished exercise is searched forward and wraps around", () => {
  let w = core.startWorkout(libraryOf(["A", 10, 1], ["B", 10, 1], ["C", 10, 1]));
  w = finishItem(w, 1);
  assert.equal(core.nextUnfinished(w, 0), 2);
  w = finishItem(w, 2);
  assert.equal(core.nextUnfinished(w, 2), 0);
  w = finishItem(w, 0);
  assert.equal(core.nextUnfinished(w, 0), -1);
  assert.equal(core.workoutFinished(w), true);
});

test("reopening on a finished exercise points to the next unfinished one", () => {
  // 운동을 끝낸 직후(자동 이동 전) 새로고침한 상황: 현재 운동은 끝났고 다른 운동이 남아 있음
  let w = core.startWorkout(libraryOf(["A", 10, 1], ["B", 10, 1], ["C", 10, 1]));
  w = finishItem(core.setCurrent(w, 1), 1);
  const reloaded = core.restoreWorkout(JSON.parse(JSON.stringify(w)));
  assert.equal(core.resumeTarget(reloaded), 2);

  // 현재 운동이 아직 진행 중이면 이동하지 않음
  assert.equal(core.resumeTarget(core.setCurrent(w, 0)), -1);
  // 전부 끝났으면 이동하지 않음(완료 화면을 보여 줌)
  let all = finishItem(finishItem(w, 0), 2);
  assert.equal(core.resumeTarget(all), -1);
});

test("a finished exercise the user went back to on purpose stays after reopening", () => {
  let w = core.startWorkout(libraryOf(["A", 10, 1], ["B", 10, 1], ["C", 10, 1]));
  w = finishItem(core.setCurrent(w, 1), 1);           // B 완료 → 자동 이동 대기
  w = core.setCurrent(core.setCurrent(w, 2), 1);      // 사용자가 C로 갔다가 탭으로 B를 다시 봄
  const reloaded = core.restoreWorkout(JSON.parse(JSON.stringify(w)));
  assert.equal(reloaded.current, 1);
  assert.equal(core.resumeTarget(reloaded), -1);

  // 완료 직후 되돌리기를 누르면 자동 이동 대기도 취소
  let undone = core.undoSet(finishItem(core.setCurrent(w, 0), 0), 0);
  assert.equal(core.resumeTarget(core.completeSet(undone, 2)), -1);
});

test("current exercise index is kept inside the list", () => {
  let w = core.startWorkout(libraryOf(["A", 10, 1], ["B", 10, 1]));
  assert.equal(core.setCurrent(w, 1).current, 1);
  assert.equal(core.setCurrent(w, 9).current, 1);
  assert.equal(core.setCurrent(w, -3).current, 0);
});

/* ---------- 저장값 복원 ---------- */

test("saved library and workout survive a JSON round trip", () => {
  const lib = libraryOf(["푸시업", 100, 4], ["스쿼트", 120, 5]);
  let w = core.setCurrent(core.completeSet(core.startWorkout(lib), 1), 1);
  assert.deepEqual(core.restoreLibrary(JSON.parse(JSON.stringify(lib))), lib);
  assert.deepEqual(core.restoreWorkout(JSON.parse(JSON.stringify(w))), w);
});

test("new ids after restore never collide with saved ones", () => {
  const lib = core.restoreLibrary(JSON.parse(JSON.stringify(libraryOf(["A", 10, 1], ["B", 10, 1]))));
  const next = core.addExercise(lib, { name: "C", goal: 10, sets: 1 });
  assert.equal(new Set(next.exercises.map((e) => e.id)).size, 3);
});

test("broken saved library is cleaned or rejected", () => {
  assert.equal(core.restoreLibrary(null), null);
  assert.equal(core.restoreLibrary("x"), null);
  const lib = core.restoreLibrary({
    exercises: [{ id: "e1", name: "A", goal: 10, sets: 2 }, { id: "e1", name: "dup", goal: 1, sets: 1 }, "bad", { name: "no id" }],
    selected: ["e1", "ghost"],
    nextId: 2,
  });
  assert.deepEqual(lib.exercises.map((e) => e.name), ["A"]);
  assert.deepEqual(lib.selected, ["e1"]);
});

test("broken saved workout is rejected instead of trusted", () => {
  const good = core.startWorkout(libraryOf(["A", 10, 2]));
  const broken = (patch) => core.restoreWorkout({ ...JSON.parse(JSON.stringify(good)), ...patch });
  assert.equal(core.restoreWorkout(null), null);
  assert.equal(broken({ items: [] }), null);
  assert.equal(broken({ current: 5 }), null);
  assert.equal(broken({ items: [{ ...good.items[0], setsDone: 3 }] }), null);
  assert.equal(broken({ items: [{ ...good.items[0], sets: 99 }] }), null);
  assert.equal(broken({ items: [{ ...good.items[0], setsDone: "1" }] }), null);
  assert.equal(broken({ pendingNext: "yes" }), null);
  // 이 값이 없던 저장값(먼저 저장된 진행 기록)은 대기 없음으로 읽는다
  const legacy = JSON.parse(JSON.stringify(good));
  delete legacy.pendingNext;
  assert.equal(core.restoreWorkout(legacy).pendingNext, false);
});
