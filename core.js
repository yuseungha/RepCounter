/*
 * 횟수 계산 규칙. 화면(app.js)과 테스트(tests/core.test.js)가 같은 코드를 쓴다.
 * 세션은 바꾸지 않고 항상 새 객체를 돌려준다: { goal, step, done, history }
 *   goal    목표 횟수
 *   step    카드 한 장의 횟수(분할 단위)
 *   done    지금까지 센 횟수
 *   history 누른 카드의 숫자 목록. 되돌리기에 쓴다.
 */
(function (root) {
  "use strict";

  var MAX_GOAL = 9999;
  var DEFAULT_GOAL = 50;
  var DEFAULT_STEP = 10;

  function toInt(value, fallback) {
    var n = parseFloat(String(value));
    return Number.isFinite(n) ? Math.floor(n) : fallback;
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function createSession(goal, step) {
    var g = clamp(toInt(goal, DEFAULT_GOAL), 1, MAX_GOAL);
    var s = clamp(toInt(step, DEFAULT_STEP), 1, g);
    return { goal: g, step: s, done: 0, history: [] };
  }

  function nextChunk(session) {
    return Math.max(0, Math.min(session.step, session.goal - session.done));
  }

  function isFinished(session) {
    return session.done >= session.goal;
  }

  function completeCard(session) {
    var chunk = nextChunk(session);
    if (chunk === 0) return session;
    return {
      goal: session.goal,
      step: session.step,
      done: session.done + chunk,
      history: session.history.concat(chunk),
    };
  }

  function canUndo(session) {
    return session.history.length > 0;
  }

  function undo(session) {
    if (!canUndo(session)) return session;
    var history = session.history.slice(0, -1);
    var last = session.history[session.history.length - 1];
    return { goal: session.goal, step: session.step, done: session.done - last, history: history };
  }

  function setsTotal(session) {
    return Math.ceil(session.goal / session.step);
  }

  function setsDone(session) {
    return session.history.length;
  }

  function progress(session) {
    return clamp(session.done / session.goal, 0, 1);
  }

  /* 카드별 숫자 목록. 50/10 -> [10,10,10,10,10], 55/10 -> [10,10,10,10,10,5] */
  function chunks(session) {
    var list = [];
    for (var left = session.goal; left > 0; left -= session.step) {
      list.push(Math.min(session.step, left));
    }
    return list;
  }

  /* 저장해 둔 값을 다시 읽을 때 쓴다. 조금이라도 맞지 않으면 null. */
  function restore(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.history)) return null;
    var base = createSession(raw.goal, raw.step);
    if (base.goal !== raw.goal || base.step !== raw.step) return null;
    if (!Number.isInteger(raw.done) || raw.done < 0 || raw.done > base.goal) return null;

    var sum = 0;
    for (var i = 0; i < raw.history.length; i += 1) {
      var n = raw.history[i];
      if (!Number.isInteger(n) || n < 1 || n > base.step) return null;
      sum += n;
    }
    if (sum !== raw.done) return null;

    return { goal: base.goal, step: base.step, done: raw.done, history: raw.history.slice() };
  }

  var api = {
    MAX_GOAL: MAX_GOAL,
    createSession: createSession,
    nextChunk: nextChunk,
    isFinished: isFinished,
    completeCard: completeCard,
    canUndo: canUndo,
    undo: undo,
    setsTotal: setsTotal,
    setsDone: setsDone,
    progress: progress,
    chunks: chunks,
    restore: restore,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RepCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
