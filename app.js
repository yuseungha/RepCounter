/*
 * 화면 동작. 계산은 모두 core.js(RepCore)에 맡기고 여기서는 그리기와 효과만 한다.
 * 화면은 3개: 운동 목록 → 운동 중(옆으로 넘기기 + 아래 탭) → 전부 완료.
 * 운동 목록과 진행 중인 운동은 브라우저 저장소(localStorage)에 남겨 새로고침해도 이어진다.
 */
(function () {
  "use strict";

  var Core = window.RepCore;
  var KEY_LIBRARY = "rep-counter:v2:library";
  var KEY_WORKOUT = "rep-counter:v2:workout";
  var OLD_KEYS = ["rep-counter:v1", "rep-counter:v1:settings"]; // 운동 하나만 세던 이전 형식
  var RING_LENGTH = 326.73; // 2 * PI * 52, styles.css의 stroke-dasharray와 같은 값
  var AUTO_NEXT_MS = 1100;  // 한 운동을 끝낸 뒤 다음 운동으로 넘어가기까지
  var SUMMARY_MS = 900;     // 마지막 운동을 끝낸 뒤 완료 화면까지
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    library: $("library"), list: $("exercise-list"), empty: $("empty"), add: $("add-exercise"), start: $("start"),
    workout: $("workout"), pager: $("pager"), tabs: $("tabs"), undo: $("undo"), stop: $("stop"),
    summary: $("summary"), summaryList: $("summary-list"), summaryTotal: $("summary-total"),
    summaryDone: $("summary-done"), summaryBack: $("summary-back"),
    editor: $("editor"), form: $("editor-form"), editorTitle: $("editor-title"),
    name: $("ex-name"), goal: $("ex-goal"), sets: $("ex-sets"), preview: $("ex-preview"),
    editTools: $("edit-tools"), up: $("ex-up"), down: $("ex-down"), del: $("ex-delete"), cancel: $("ex-cancel"),
    template: $("page-template"), confetti: $("confetti"),
  };

  var library = Core.createLibrary();
  var workout = null;
  var pages = [];      // 운동마다 화면 한 장: { root, done, ring, dots, sets, card, cardNum, finish, floats, shown, frame, safety }
  var tabButtons = [];
  var busy = false;    // 카드가 넘어가는 중에는 두 번 눌리지 않게 막는다
  var autoTimer = 0;
  var editingId = null;
  var generation = 0;  // 운동 화면을 새로 만들거나 끝낼 때마다 +1. 늦게 도착한 지연 콜백이 다른 운동 화면을 건드리지 않게 확인용

  /* ---------- 저장 ---------- */
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }

  function writeJSON(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* 저장 불가 환경이면 그냥 넘어간다 */ }
  }

  function saveLibrary() { writeJSON(KEY_LIBRARY, library); }
  function saveWorkout() { writeJSON(KEY_WORKOUT, workout); }

  function show(name) {
    el.library.hidden = name !== "library";
    el.workout.hidden = name !== "workout";
    el.summary.hidden = name !== "summary";
  }

  function svg(path) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '"/></svg>';
  }

  /* ---------- 1. 운동 목록 ---------- */
  function exerciseMeta(ex) {
    return ex.goal + "개 · " + ex.sets + "세트";
  }

  function renderLibrary() {
    el.list.innerHTML = "";
    library.exercises.forEach(function (ex, i) {
      var li = document.createElement("li");
      li.className = "row";
      li.style.animationDelay = i * 40 + "ms";

      var main = document.createElement("button");
      main.type = "button";
      main.className = "row-main";
      main.innerHTML = '<span class="check">' + svg("M5 12.5l4.5 4.5L19 7.5") + "</span>" +
        '<span class="row-name"></span><span class="row-meta"></span>';
      main.querySelector(".row-name").textContent = ex.name;
      main.querySelector(".row-meta").textContent = exerciseMeta(ex);
      main.addEventListener("click", function () {
        library = Core.toggleSelected(library, ex.id);
        saveLibrary();
        paintRow(li, main, ex.id);
        updateStartButton();
      });

      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "row-edit";
      edit.setAttribute("aria-label", ex.name + " 편집");
      edit.innerHTML = svg("M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4");
      edit.addEventListener("click", function () { openEditor(ex.id); });

      li.appendChild(main);
      li.appendChild(edit);
      paintRow(li, main, ex.id);
      el.list.appendChild(li);
    });
    el.empty.hidden = library.exercises.length > 0;
    updateStartButton();
  }

  function paintRow(li, main, id) {
    var on = Core.isSelected(library, id);
    li.classList.toggle("on", on);
    main.setAttribute("aria-pressed", String(on));
  }

  function updateStartButton() {
    var n = Core.selectedExercises(library).length;
    el.start.textContent = n > 0 ? n + "개 운동 시작"
      : library.exercises.length > 0 ? "할 운동을 체크하세요" : "운동을 먼저 추가하세요";
    el.start.classList.toggle("off", n === 0);
  }

  el.start.addEventListener("click", function () {
    var started = Core.startWorkout(library);
    if (!started) {
      el.start.classList.remove("shake");
      void el.start.offsetWidth;
      el.start.classList.add("shake");
      return;
    }
    workout = started;
    saveWorkout();
    openWorkout(true);
  });

  el.add.addEventListener("click", function () { openEditor(null); });

  /* ---------- 운동 추가·편집 창 ---------- */
  function openEditor(id) {
    editingId = id;
    var ex = null;
    library.exercises.forEach(function (e) { if (e.id === id) ex = e; });
    el.editorTitle.textContent = ex ? "운동 편집" : "운동 추가";
    el.name.value = ex ? ex.name : "";
    el.name.placeholder = "운동 " + (ex ? library.exercises.indexOf(ex) + 1 : library.exercises.length + 1);
    el.goal.value = ex ? ex.goal : 100;
    el.sets.value = ex ? ex.sets : 4;
    el.editTools.hidden = !ex;
    updateMoveButtons();
    updatePreview();
    el.editor.showModal();
    if (!ex) el.name.focus();
  }

  function updateMoveButtons() {
    var at = -1;
    library.exercises.forEach(function (e, i) { if (e.id === editingId) at = i; });
    el.up.disabled = at <= 0;
    el.down.disabled = at < 0 || at >= library.exercises.length - 1;
  }

  function editorInput() {
    return { name: el.name.value, goal: el.goal.value, sets: el.sets.value };
  }

  function updatePreview() {
    var ex = Core.normalizeExercise(editorInput(), "");
    var chunks = Core.splitSets(ex.goal, ex.sets);
    var even = chunks[0] === chunks[chunks.length - 1];
    var text = even
      ? "세트당 <b>" + chunks[0] + "개</b> × " + ex.sets + "세트"
      : "<b>" + (chunks.length > 6 ? chunks.slice(0, 5).join("·") + "·…" : chunks.join("·")) + "</b>개 · " + ex.sets + "세트";
    if (String(ex.sets) !== String(el.sets.value).trim()) text += " (세트 수는 1~" + Math.min(ex.goal, Core.MAX_SETS) + ")";
    el.preview.innerHTML = text;
  }

  el.form.addEventListener("input", updatePreview);

  el.form.addEventListener("click", function (e) {
    var btn = e.target.closest(".stepper-btn");
    if (!btn) return;
    var input = $(btn.dataset.target);
    var max = input === el.sets ? Core.MAX_SETS : Core.MAX_GOAL;
    var next = (parseInt(input.value, 10) || 0) + Number(btn.dataset.delta);
    input.value = Math.min(max, Math.max(1, next));
    updatePreview();
  });

  el.form.addEventListener("submit", function (e) {
    e.preventDefault();
    library = editingId ? Core.updateExercise(library, editingId, editorInput()) : Core.addExercise(library, editorInput());
    saveLibrary();
    el.editor.close();
    renderLibrary();
  });

  el.cancel.addEventListener("click", function () { el.editor.close(); });

  // 창 바깥(어두운 부분)을 누르면 닫는다
  el.editor.addEventListener("click", function (e) { if (e.target === el.editor) el.editor.close(); });

  el.del.addEventListener("click", function () {
    var name = el.name.value.trim() || el.name.placeholder;
    if (!window.confirm("'" + name + "' 운동을 삭제할까요?")) return;
    library = Core.removeExercise(library, editingId);
    saveLibrary();
    el.editor.close();
    renderLibrary();
  });

  [[el.up, -1], [el.down, 1]].forEach(function (pair) {
    pair[0].addEventListener("click", function () {
      library = Core.moveExercise(library, editingId, pair[1]);
      saveLibrary();
      renderLibrary();
      updateMoveButtons();
    });
  });

  /* ---------- 2. 운동 중 ---------- */
  function openWorkout(fresh) {
    clearTimeout(autoTimer);
    generation += 1;
    busy = false;
    show("workout");
    buildPages();
    buildTabs();
    workout.items.forEach(function (item, i) {
      renderPage(i, fresh && i === workout.current ? "enter" : null);
      renderTab(i);
    });
    updateUndo();
    // 보던 운동 위치로 바로 이동(화면에 붙인 직후라 크기를 바로 잴 수 있다)
    goTo(workout.current, false);
    updatePageEffects();

    // 운동을 끝낸 직후(자동 이동 전) 앱을 닫았다 연 경우: 완료 표시를 보여 준 뒤 남은 운동으로 이동
    var target = Core.resumeTarget(workout);
    if (target >= 0) scheduleAutoNext(workout.current, target);
  }

  function buildPages() {
    el.pager.innerHTML = "";
    pages = workout.items.map(function (item, i) {
      var root = el.template.content.firstElementChild.cloneNode(true);
      var p = {
        root: root,
        done: root.querySelector(".done"),
        ring: root.querySelector(".ring-bar"),
        dots: root.querySelector(".dots"),
        sets: root.querySelector(".sets-text"),
        card: root.querySelector(".card"),
        cardNum: root.querySelector(".card-num"),
        finish: root.querySelector(".finish"),
        floats: root.querySelector(".floats"),
        shown: Core.itemDone(item),
        frame: 0,
        safety: 0,
      };
      root.setAttribute("aria-label", item.name);
      root.querySelector(".page-name").textContent = item.name;
      root.querySelector(".goal-text").textContent = item.goal;
      p.done.textContent = p.shown;

      p.dots.classList.toggle("compact", item.sets > 20);
      for (var k = 0; k < item.sets; k += 1) p.dots.appendChild(document.createElement("li"));

      p.card.addEventListener("click", function () { onCardTap(i); });
      // 손가락이 닿는 순간 눌린 느낌을 바로 준다(click은 손을 뗄 때 온다)
      p.card.addEventListener("pointerdown", function () { p.card.classList.add("pressed"); });
      ["pointerup", "pointerleave", "pointercancel"].forEach(function (type) {
        p.card.addEventListener(type, function () { p.card.classList.remove("pressed"); });
      });

      el.pager.appendChild(root);
      return p;
    });
  }

  function buildTabs() {
    el.tabs.innerHTML = "";
    tabButtons = workout.items.map(function (item, i) {
      var tab = document.createElement("button");
      tab.type = "button";
      tab.className = "tab";
      tab.innerHTML = '<span class="tab-name"></span><span class="tab-count"></span><span class="tab-bar"><i></i></span>';
      tab.querySelector(".tab-name").textContent = item.name;
      tab.addEventListener("click", function () { goTo(i, true); });
      el.tabs.appendChild(tab);
      return tab;
    });
  }

  function renderPage(i, cardAnim) {
    var item = workout.items[i];
    var p = pages[i];
    var finished = Core.itemFinished(item);

    p.ring.style.strokeDashoffset = String(RING_LENGTH * (1 - Core.itemProgress(item)));
    p.sets.textContent = finished ? item.sets + "세트 완료" : (item.setsDone + 1) + " / " + item.sets + " 세트";
    var dots = p.dots.children;
    for (var k = 0; k < dots.length; k += 1) {
      dots[k].classList.toggle("on", k < item.setsDone);
      dots[k].classList.toggle("now", !finished && k === item.setsDone);
    }
    countTo(p, Core.itemDone(item));

    p.card.hidden = finished;
    p.finish.hidden = !finished;
    if (finished) return;

    var chunk = Core.nextChunk(item);
    p.cardNum.textContent = chunk;
    p.card.classList.toggle("last", item.sets > 1 && item.setsDone === item.sets - 1);
    p.card.setAttribute("aria-label", item.name + " 이번 세트 " + chunk + "회. 끝나면 누르기");
    if (cardAnim) playClass(p.card, cardAnim);
  }

  function renderTab(i) {
    var item = workout.items[i];
    var tab = tabButtons[i];
    var active = i === workout.current;
    tab.querySelector(".tab-count").textContent = (Core.itemFinished(item) ? "✓ " : "") + Core.itemDone(item) + "/" + item.goal;
    tab.querySelector(".tab-bar i").style.width = Math.round(Core.itemProgress(item) * 100) + "%";
    tab.classList.toggle("done", Core.itemFinished(item));
    tab.classList.toggle("active", active);
    if (active) tab.setAttribute("aria-current", "true");
    else tab.removeAttribute("aria-current");
  }

  function updateUndo() {
    el.undo.disabled = !workout || !Core.canUndo(workout, workout.current);
  }

  /* ---------- 넘기기 ---------- */
  function pageWidth() {
    return pages.length ? pages[0].root.offsetWidth : 1;
  }

  /* 탭·자동 이동처럼 코드로 넘길 때: 미끄러지는 도중의 위치로 현재 운동이 잠깐 바뀌지 않게 목표를 기억한다 */
  var scrollTarget = -1;
  var scrollTargetTimer = 0;

  function goTo(i, smooth) {
    if (!workout) return;
    i = Math.max(0, Math.min(workout.items.length - 1, i));
    var instant = !smooth || reduceMotion.matches;
    scrollTarget = instant ? -1 : i;
    clearTimeout(scrollTargetTimer);
    if (!instant) scrollTargetTimer = setTimeout(function () { scrollTarget = -1; }, 900);
    if (instant) {
      // CSS의 scroll-behavior: smooth를 잠깐 끄고 바로 이동('instant' 값을 모르는 브라우저 대비)
      el.pager.style.scrollBehavior = "auto";
      el.pager.scrollLeft = i * pageWidth();
      el.pager.style.scrollBehavior = "";
    } else {
      el.pager.scrollTo({ left: i * pageWidth(), behavior: "smooth" });
    }
    setCurrent(i);
  }

  function setCurrent(i) {
    if (!workout || i === workout.current) return;
    var before = workout.current;
    workout = Core.setCurrent(workout, i);
    saveWorkout();
    renderTab(before);
    renderTab(i);
    updateUndo();
    centerTab(i);
  }

  function centerTab(i) {
    var tab = tabButtons[i];
    if (!tab) return;
    var left = tab.offsetLeft - (el.tabs.clientWidth - tab.offsetWidth) / 2;
    el.tabs.scrollTo({ left: Math.max(0, left), behavior: reduceMotion.matches ? "auto" : "smooth" });
  }

  /* 가운데 운동은 크고 또렷하게, 옆 운동은 작고 흐리게: 넘길 때 깊이감 */
  function updatePageEffects() {
    var w = pageWidth();
    var center = el.pager.scrollLeft + el.pager.clientWidth / 2;
    pages.forEach(function (p) {
      var d = Math.min(1, Math.abs(p.root.offsetLeft + w / 2 - center) / w);
      p.root.style.transform = "scale(" + (1 - 0.08 * d).toFixed(3) + ")";
      p.root.style.opacity = (1 - 0.55 * d).toFixed(3);
    });
  }

  // 스크롤 이벤트 안에서 바로 계산한다(화면 갱신 프레임이 멈춘 상태에서도 현재 운동이 맞게 바뀌도록)
  el.pager.addEventListener("scroll", function () {
    // 완료 화면·목록으로 바뀐 뒤 늦게 도착한 스크롤 이벤트: 운동 화면이 숨겨져 폭이 0이면 무시
    // (폭 0으로 나누면 운동 번호가 NaN이 되어 없는 탭을 그리려다 오류가 났다)
    var w = pages.length ? pages[0].root.offsetWidth : 0;
    if (!workout || el.workout.hidden || w === 0) return;
    updatePageEffects();
    var i = Math.max(0, Math.min(pages.length - 1, Math.round(el.pager.scrollLeft / w)));
    if (scrollTarget >= 0) {
      if (i !== scrollTarget) return; // 코드로 넘기는 중: 도착할 때까지 기다린다
      scrollTarget = -1;
    }
    setCurrent(i);
  }, { passive: true });

  // 사용자가 직접 밀기 시작하면 코드로 넘기던 목표는 버린다
  ["touchstart", "wheel", "pointerdown"].forEach(function (type) {
    el.pager.addEventListener(type, function () { scrollTarget = -1; }, { passive: true });
  });

  window.addEventListener("resize", function () {
    if (workout && !el.workout.hidden) {
      goTo(workout.current, false);
      updatePageEffects();
    }
  });

  /* ---------- 세트 완료·되돌리기 ---------- */
  function onCardTap(i) {
    if (!workout) return;
    if (i !== workout.current) { goTo(i, true); return; } // 옆에 살짝 보이는 운동을 누르면 그쪽으로 이동만
    var item = workout.items[i];
    if (busy || Core.itemFinished(item)) return;
    busy = true;
    clearTimeout(autoTimer);

    var p = pages[i];
    var chunk = Core.nextChunk(item);
    workout = Core.completeSet(workout, i);
    saveWorkout();
    var finishedNow = Core.itemFinished(workout.items[i]);
    floatText(p, "+" + chunk);
    buzz(finishedNow ? [60, 60, 120] : 30);

    playClass(p.card, "leave");
    var gen = generation;
    setTimeout(function () {
      p.card.classList.remove("leave");
      if (gen !== generation || !workout) return; // 그 사이 운동을 끝냈거나 새로 시작함
      renderPage(i, "enter");
      renderTab(i);
      updateUndo();
      busy = false;
      if (finishedNow) afterItemFinished(i);
    }, reduceMotion.matches ? 0 : 280);
  }

  function afterItemFinished(i) {
    if (Core.workoutFinished(workout)) {
      autoTimer = setTimeout(showSummary, SUMMARY_MS);
      return;
    }
    scheduleAutoNext(i, Core.nextUnfinished(workout, i));
  }

  function scheduleAutoNext(from, next) {
    clearTimeout(autoTimer);
    var gen = generation;
    autoTimer = setTimeout(function () {
      // 그 사이 운동을 끝냈거나, 다른 운동으로 옮겼거나, 되돌렸으면 그대로 둔다
      if (gen !== generation || !workout) return;
      if (workout.current === from && Core.itemFinished(workout.items[from])) goTo(next, true);
    }, AUTO_NEXT_MS);
  }

  el.undo.addEventListener("click", function () {
    if (!workout || busy) return;
    var i = workout.current;
    if (!Core.canUndo(workout, i)) return;
    clearTimeout(autoTimer);
    var item = workout.items[i];
    var last = Core.itemChunks(item)[item.setsDone - 1];
    workout = Core.undoSet(workout, i);
    saveWorkout();
    floatText(pages[i], "−" + last, true);
    buzz(15);
    renderPage(i, "back");
    renderTab(i);
    updateUndo();
  });

  el.stop.addEventListener("click", function () {
    if (!workout) return;
    var started = workout.items.some(function (item) { return item.setsDone > 0; });
    if (started && !Core.workoutFinished(workout) &&
        !window.confirm("운동을 끝내고 목록으로 갈까요?\n지금까지 센 횟수는 지워져요.")) return;
    endWorkout();
  });

  function endWorkout() {
    clearTimeout(autoTimer);
    generation += 1;
    busy = false;
    workout = null;
    saveWorkout();
    stopConfetti();
    pages = [];
    tabButtons = [];
    el.pager.innerHTML = "";
    renderLibrary();
    show("library");
  }

  /* ---------- 3. 전부 완료 ---------- */
  function showSummary() {
    if (!workout) return;
    clearTimeout(autoTimer);
    var total = 0;
    el.summaryList.innerHTML = "";
    workout.items.forEach(function (item, i) {
      var done = Core.itemDone(item);
      total += done;
      var li = document.createElement("li");
      li.style.animationDelay = 150 + i * 70 + "ms";
      li.innerHTML = '<span class="name"></span><span class="meta"></span>';
      li.querySelector(".name").textContent = item.name;
      var meta = li.querySelector(".meta");
      meta.textContent = done + "개 · " + item.sets + "세트";
      meta.classList.toggle("full", Core.itemFinished(item));
      el.summaryList.appendChild(li);
    });
    el.summaryTotal.textContent = "총 " + total + "회 · 운동 " + workout.items.length + "개";
    show("summary");
    confetti();
  }

  el.summaryDone.addEventListener("click", endWorkout);
  el.summaryBack.addEventListener("click", function () {
    stopConfetti();
    openWorkout(false);
  });

  /* ---------- 효과 ---------- */
  /* 숫자가 휙 올라가는(또는 내려가는) 효과 */
  function countTo(p, target) {
    cancelAnimationFrame(p.frame);
    clearTimeout(p.safety);
    var from = p.shown;
    var paint = function (n) { p.shown = n; p.done.textContent = n; };
    if (from === target || reduceMotion.matches) { paint(target); return; }
    var start = performance.now();
    var duration = 550;
    playClass(p.done, "bump");
    (function tick(now) {
      var t = Math.min(1, (now - start) / duration);
      paint(Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) p.frame = requestAnimationFrame(tick);
    })(start);
    // 백그라운드 탭처럼 화면 갱신이 멈춘 경우에도 최종 숫자는 반드시 보이게 한다
    p.safety = setTimeout(function () { cancelAnimationFrame(p.frame); paint(target); }, duration + 80);
  }

  function playClass(node, name) {
    node.classList.remove("enter", "leave", "back", "bump");
    void node.offsetWidth; // 같은 애니메이션을 다시 시작하려면 한 번 다시 그리게 해야 한다
    node.classList.add(name);
  }

  function floatText(p, text, minus) {
    var f = document.createElement("span");
    f.className = "float" + (minus ? " minus" : "");
    f.textContent = text;
    p.floats.appendChild(f);
    setTimeout(function () { f.remove(); }, 1000);
  }

  function buzz(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* 무시 */ } }
  }

  var confettiFrame = 0;
  function confetti() {
    if (reduceMotion.matches) return;
    var canvas = el.confetti;
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var colors = ["#3ddc97", "#2bb3ff", "#ffd166", "#ff8a5b", "#c77dff"];
    var pieces = [];
    for (var i = 0; i < 160; i += 1) {
      pieces.push({
        x: innerWidth / 2, y: innerHeight * 0.35,
        vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
        size: 6 + Math.random() * 6, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        color: colors[i % colors.length],
      });
    }
    var start = performance.now();
    cancelAnimationFrame(confettiFrame);
    (function frame(now) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      pieces.forEach(function (p) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      });
      if (now - start < 2800) confettiFrame = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(start);
  }

  function stopConfetti() {
    cancelAnimationFrame(confettiFrame);
    el.confetti.getContext("2d").clearRect(0, 0, el.confetti.width, el.confetti.height);
  }

  /* ---------- 키보드(PC): ←/→ 운동 이동, Ctrl+Z 되돌리기 ---------- */
  document.addEventListener("keydown", function (e) {
    if (el.workout.hidden || !workout || el.editor.open) return;
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(workout.current + 1, true); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(workout.current - 1, true); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); el.undo.click(); }
  });

  /* ---------- 시작 ---------- */
  OLD_KEYS.forEach(function (key) { writeJSON(key, null); });
  library = Core.restoreLibrary(readJSON(KEY_LIBRARY)) || Core.createLibrary();
  workout = Core.restoreWorkout(readJSON(KEY_WORKOUT));
  renderLibrary();
  if (workout && Core.workoutFinished(workout)) showSummary();
  else if (workout) openWorkout(false);
  else show("library");
})();
