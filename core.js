/*
 * 횟수 계산 규칙. 화면(app.js)과 테스트(tests/core.test.js)가 같은 코드를 쓴다.
 * 모든 함수는 받은 값을 바꾸지 않고 새 객체를 돌려준다.
 *
 * 운동 목록(library) { exercises: [{ id, name, goal, sets }], selected: [id], nextId }
 *   저장해 두는 운동들. selected는 '오늘 할 운동' 체크 상태.
 * 운동 중(workout)   { items: [{ id, name, goal, sets, setsDone }], current, pendingNext }
 *   시작할 때 체크한 운동을 복사해 둔 것. 운동 중에 목록을 고쳐도 섞이지 않는다.
 *   setsDone = 끝낸 세트 수. 횟수는 세트 나누기 결과에서 계산한다.
 *   pendingNext = 보던 운동을 방금 끝내서 다음 운동으로 자동 이동을 기다리는 중.
 *     사용자가 직접 다른 운동으로 옮기거나 되돌리면 false가 된다.
 */
(function (root) {
  "use strict";

  var MAX_GOAL = 9999;
  var MAX_SETS = 50;
  var MAX_NAME = 20;
  var DEFAULT_GOAL = 50;
  var DEFAULT_SETS = 5;

  function toInt(value, fallback) {
    var n = parseFloat(String(value));
    return Number.isFinite(n) ? Math.floor(n) : fallback;
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  /* ---------- 세트 나누기 ---------- */

  /* 100,4 -> [25,25,25,25]  100,3 -> [34,33,33]  남는 횟수는 앞 세트부터 1개씩 */
  function splitSets(goal, sets) {
    var base = Math.floor(goal / sets);
    var extra = goal % sets;
    var list = [];
    for (var i = 0; i < sets; i += 1) list.push(base + (i < extra ? 1 : 0));
    return list;
  }

  function normalizeExercise(input, fallbackName) {
    input = input || {};
    var name = String(input.name == null ? "" : input.name).trim().slice(0, MAX_NAME);
    var goal = clamp(toInt(input.goal, DEFAULT_GOAL), 1, MAX_GOAL);
    var sets = clamp(toInt(input.sets, DEFAULT_SETS), 1, Math.min(goal, MAX_SETS));
    return { name: name || fallbackName, goal: goal, sets: sets };
  }

  /* ---------- 운동 목록 ---------- */

  function createLibrary() {
    return { exercises: [], selected: [], nextId: 1 };
  }

  function copyLibrary(lib, exercises, selected) {
    return { exercises: exercises, selected: selected, nextId: lib.nextId };
  }

  function indexOfId(lib, id) {
    for (var i = 0; i < lib.exercises.length; i += 1) if (lib.exercises[i].id === id) return i;
    return -1;
  }

  function addExercise(lib, input) {
    var id = "e" + lib.nextId;
    var fields = normalizeExercise(input, "운동 " + (lib.exercises.length + 1));
    var exercise = { id: id, name: fields.name, goal: fields.goal, sets: fields.sets };
    return {
      exercises: lib.exercises.concat(exercise),
      selected: lib.selected.concat(id),
      nextId: lib.nextId + 1,
    };
  }

  function updateExercise(lib, id, input) {
    var at = indexOfId(lib, id);
    if (at < 0) return lib;
    var fields = normalizeExercise(input, "운동 " + (at + 1));
    var exercises = lib.exercises.slice();
    exercises[at] = { id: id, name: fields.name, goal: fields.goal, sets: fields.sets };
    return copyLibrary(lib, exercises, lib.selected.slice());
  }

  function removeExercise(lib, id) {
    return copyLibrary(
      lib,
      lib.exercises.filter(function (e) { return e.id !== id; }),
      lib.selected.filter(function (s) { return s !== id; })
    );
  }

  function moveExercise(lib, id, delta) {
    var from = indexOfId(lib, id);
    var to = from + delta;
    if (from < 0 || to < 0 || to >= lib.exercises.length) return lib;
    var exercises = lib.exercises.slice();
    var moved = exercises.splice(from, 1)[0];
    exercises.splice(to, 0, moved);
    return copyLibrary(lib, exercises, lib.selected.slice());
  }

  function isSelected(lib, id) {
    return lib.selected.indexOf(id) >= 0;
  }

  function toggleSelected(lib, id) {
    if (indexOfId(lib, id) < 0) return lib;
    var selected = isSelected(lib, id)
      ? lib.selected.filter(function (s) { return s !== id; })
      : lib.selected.concat(id);
    return copyLibrary(lib, lib.exercises.slice(), selected);
  }

  function selectedExercises(lib) {
    return lib.exercises.filter(function (e) { return isSelected(lib, e.id); });
  }

  /* ---------- 운동 중 ---------- */

  function startWorkout(lib) {
    var chosen = selectedExercises(lib);
    if (chosen.length === 0) return null;
    return {
      items: chosen.map(function (e) {
        return { id: e.id, name: e.name, goal: e.goal, sets: e.sets, setsDone: 0 };
      }),
      current: 0,
      pendingNext: false,
    };
  }

  function itemChunks(item) {
    return splitSets(item.goal, item.sets);
  }

  function itemDone(item) {
    return itemChunks(item).slice(0, item.setsDone).reduce(function (a, b) { return a + b; }, 0);
  }

  function itemFinished(item) {
    return item.setsDone >= item.sets;
  }

  function nextChunk(item) {
    return itemFinished(item) ? 0 : itemChunks(item)[item.setsDone];
  }

  function itemProgress(item) {
    return clamp(itemDone(item) / item.goal, 0, 1);
  }

  function withItem(w, index, setsDone, pendingNext) {
    var items = w.items.slice();
    var old = items[index];
    items[index] = { id: old.id, name: old.name, goal: old.goal, sets: old.sets, setsDone: setsDone };
    return { items: items, current: w.current, pendingNext: pendingNext };
  }

  function completeSet(w, index) {
    var item = w.items[index];
    if (!item || itemFinished(item)) return w;
    var next = withItem(w, index, item.setsDone + 1, false);
    // 보던 운동을 방금 끝냈고 남은 운동이 있으면 자동 이동 대기
    next.pendingNext = index === w.current && itemFinished(next.items[index]) && !workoutFinished(next);
    return next;
  }

  function canUndo(w, index) {
    var item = w.items[index];
    return !!item && item.setsDone > 0;
  }

  function undoSet(w, index) {
    if (!canUndo(w, index)) return w;
    return withItem(w, index, w.items[index].setsDone - 1, false);
  }

  function setCurrent(w, index) {
    var current = clamp(toInt(index, 0), 0, w.items.length - 1);
    // 다른 운동으로 옮기면(자동 이동 포함) 대기는 끝난다
    return { items: w.items.slice(), current: current, pendingNext: current === w.current && w.pendingNext };
  }

  function workoutFinished(w) {
    return w.items.every(itemFinished);
  }

  /* from 다음 운동부터 한 바퀴 돌며 아직 안 끝난 운동을 찾는다. 없으면 -1 */
  function nextUnfinished(w, from) {
    var n = w.items.length;
    for (var step = 1; step < n; step += 1) {
      var i = (from + step) % n;
      if (!itemFinished(w.items[i])) return i;
    }
    return -1;
  }

  /* 다시 열었을 때 넘어가야 할 운동. 보던 운동이 끝났고 남은 운동이 있으면 그 번호, 아니면 -1
     (운동을 끝낸 직후 자동 이동 전에 앱을 닫았다 연 경우) */
  function resumeTarget(w) {
    if (!w.pendingNext || !itemFinished(w.items[w.current]) || workoutFinished(w)) return -1;
    return nextUnfinished(w, w.current);
  }

  /* ---------- 저장값 복원 ---------- */

  function isValidExercise(e) {
    if (!e || typeof e !== "object" || typeof e.id !== "string" || !e.id) return false;
    if (typeof e.name !== "string" || !Number.isInteger(e.goal) || !Number.isInteger(e.sets)) return false;
    var fixed = normalizeExercise(e, e.name);
    return fixed.name === e.name && fixed.goal === e.goal && fixed.sets === e.sets;
  }

  /* 운동 목록은 쓸 수 있는 항목만 남긴다(깨진 항목 하나 때문에 전부 잃지 않게). 형식 자체가 틀리면 null */
  function restoreLibrary(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.exercises)) return null;
    var seen = {};
    var maxId = 0;
    var exercises = [];
    raw.exercises.forEach(function (e) {
      if (!isValidExercise(e) || seen[e.id]) return;
      seen[e.id] = true;
      var num = /^e(\d+)$/.exec(e.id);
      if (num) maxId = Math.max(maxId, Number(num[1]));
      exercises.push({ id: e.id, name: e.name, goal: e.goal, sets: e.sets });
    });
    var selected = Array.isArray(raw.selected)
      ? raw.selected.filter(function (id, i, list) { return seen[id] === true && list.indexOf(id) === i; })
      : [];
    var nextId = Math.max(toInt(raw.nextId, 1), maxId + 1);
    return { exercises: exercises, selected: selected, nextId: nextId };
  }

  /* 운동 중 상태는 하나라도 맞지 않으면 null (잘못된 횟수를 보여 주는 것보다 새로 시작이 낫다) */
  function restoreWorkout(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.items) || raw.items.length === 0) return null;
    var items = [];
    for (var i = 0; i < raw.items.length; i += 1) {
      var it = raw.items[i];
      if (!isValidExercise(it) || !Number.isInteger(it.setsDone) || it.setsDone < 0 || it.setsDone > it.sets) return null;
      items.push({ id: it.id, name: it.name, goal: it.goal, sets: it.sets, setsDone: it.setsDone });
    }
    if (!Number.isInteger(raw.current) || raw.current < 0 || raw.current >= items.length) return null;
    if (raw.pendingNext !== undefined && typeof raw.pendingNext !== "boolean") return null;
    return { items: items, current: raw.current, pendingNext: raw.pendingNext === true };
  }

  var api = {
    MAX_GOAL: MAX_GOAL,
    MAX_SETS: MAX_SETS,
    MAX_NAME: MAX_NAME,
    splitSets: splitSets,
    normalizeExercise: normalizeExercise,
    createLibrary: createLibrary,
    addExercise: addExercise,
    updateExercise: updateExercise,
    removeExercise: removeExercise,
    moveExercise: moveExercise,
    isSelected: isSelected,
    toggleSelected: toggleSelected,
    selectedExercises: selectedExercises,
    startWorkout: startWorkout,
    itemChunks: itemChunks,
    itemDone: itemDone,
    itemFinished: itemFinished,
    nextChunk: nextChunk,
    itemProgress: itemProgress,
    completeSet: completeSet,
    canUndo: canUndo,
    undoSet: undoSet,
    setCurrent: setCurrent,
    workoutFinished: workoutFinished,
    nextUnfinished: nextUnfinished,
    resumeTarget: resumeTarget,
    restoreLibrary: restoreLibrary,
    restoreWorkout: restoreWorkout,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RepCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
