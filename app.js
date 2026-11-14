/*
 * 화면 동작. 계산은 모두 core.js(RepCore)에 맡기고 여기서는 그리기와 효과만 한다.
 * 진행 상황은 브라우저 저장소(localStorage)에 남겨 새로고침해도 이어진다.
 */
(function () {
  "use strict";

  var Core = window.RepCore;
  var STORE_KEY = "rep-counter:v1";
  var RING_LENGTH = 326.73; // 2 * PI * 52, styles.css의 stroke-dasharray와 같은 값
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    setup: $("setup"), form: $("setup-form"), goal: $("goal"), step: $("step"), preview: $("setup-preview"),
    counter: $("counter"), done: $("done"), goalText: $("goal-text"), ring: $("ring-bar"),
    dots: $("dots"), sets: $("sets-text"), card: $("card"), cardNum: $("card-num"),
    finish: $("finish"), finishSub: $("finish-sub"), floats: $("floats"),
    undo: $("undo"), reset: $("reset"), confetti: $("confetti"),
  };

  var session = null;
  var shownDone = 0;   // 화면에 보이는 숫자(올라가는 애니메이션용)
  var busy = false;    // 카드가 넘어가는 중에는 두 번 눌리지 않게 막는다

  /* ---------- 저장 ---------- */
  function save() {
    try {
      if (session) localStorage.setItem(STORE_KEY, JSON.stringify(session));
      else localStorage.removeItem(STORE_KEY);
    } catch (e) { /* 저장 불가 환경이면 그냥 넘어간다 */ }
  }

  function load() {
    try { return Core.restore(JSON.parse(localStorage.getItem(STORE_KEY))); }
    catch (e) { return null; }
  }

  function lastSettings() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY + ":settings")) || null; }
    catch (e) { return null; }
  }

  function saveSettings(goal, step) {
    try { localStorage.setItem(STORE_KEY + ":settings", JSON.stringify({ goal: goal, step: step })); }
    catch (e) { /* 무시 */ }
  }

  /* ---------- 설정 화면 ---------- */
  function updatePreview() {
    var s = Core.createSession(el.goal.value, el.step.value);
    var list = Core.chunks(s);
    var shown = list.length > 8 ? list.slice(0, 7).join(" + ") + " + …" : list.join(" + ");
    el.preview.innerHTML = "카드 <b>" + list.length + "장</b> · " + shown;
  }

  function showSetup() {
    var last = lastSettings();
    if (last) { el.goal.value = last.goal; el.step.value = last.step; }
    el.counter.hidden = true;
    el.setup.hidden = false;
    updatePreview();
  }

  el.form.addEventListener("input", updatePreview);

  el.form.addEventListener("click", function (e) {
    var btn = e.target.closest(".stepper-btn");
    if (!btn) return;
    var input = $(btn.dataset.target);
    var next = (parseInt(input.value, 10) || 0) + Number(btn.dataset.delta);
    input.value = Math.min(Core.MAX_GOAL, Math.max(1, next));
    updatePreview();
  });

  el.form.addEventListener("submit", function (e) {
    e.preventDefault();
    session = Core.createSession(el.goal.value, el.step.value);
    saveSettings(session.goal, session.step);
    save();
    shownDone = 0;
    showCounter(true);
  });

  /* ---------- 세는 화면 ---------- */
  function showCounter(fresh) {
    el.setup.hidden = true;
    el.counter.hidden = false;
    el.goalText.textContent = session.goal;
    buildDots();
    render({ cardAnim: fresh ? "enter" : null });
  }

  function buildDots() {
    var total = Core.setsTotal(session);
    el.dots.innerHTML = "";
    el.dots.classList.toggle("compact", total > 20);
    if (total > 40) { el.dots.hidden = true; return; } // 너무 많으면 점은 생략, 링과 문구로 충분
    el.dots.hidden = false;
    for (var i = 0; i < total; i += 1) el.dots.appendChild(document.createElement("li"));
  }

  function render(opts) {
    opts = opts || {};
    var finished = Core.isFinished(session);
    var chunk = Core.nextChunk(session);
    var setsDone = Core.setsDone(session);
    var setsTotal = Core.setsTotal(session);

    el.ring.style.strokeDashoffset = String(RING_LENGTH * (1 - Core.progress(session)));
    el.sets.textContent = finished ? setsTotal + "세트 모두 끝" : (setsDone + 1) + " / " + setsTotal + " 세트";

    var dots = el.dots.children;
    for (var i = 0; i < dots.length; i += 1) {
      dots[i].classList.toggle("on", i < setsDone);
      dots[i].classList.toggle("now", !finished && i === setsDone);
    }

    el.undo.disabled = !Core.canUndo(session);
    countTo(session.done);

    if (finished) {
      el.card.hidden = true;
      el.finish.hidden = false;
      el.finishSub.textContent = session.goal + "회 · " + setsTotal + "세트";
      return;
    }

    el.finish.hidden = true;
    el.card.hidden = false;
    el.cardNum.textContent = chunk;
    el.card.classList.toggle("last", setsDone === setsTotal - 1);
    el.card.setAttribute("aria-label", "이번 세트 " + chunk + "회. 끝나면 누르기");
    if (opts.cardAnim) playClass(el.card, opts.cardAnim);
  }

  /* 숫자가 휙 올라가는(또는 내려가는) 효과 */
  var countFrame = 0;
  var countSafety = 0;
  function showNumber(n) {
    shownDone = n;
    el.done.textContent = n;
  }

  function countTo(target) {
    cancelAnimationFrame(countFrame);
    clearTimeout(countSafety);
    var from = shownDone;
    if (from === target || reduceMotion.matches) { showNumber(target); return; }
    var start = performance.now();
    var duration = 550;
    playClass(el.done, "bump");
    (function tick(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      showNumber(Math.round(from + (target - from) * eased));
      if (t < 1) countFrame = requestAnimationFrame(tick);
    })(start);
    // 백그라운드 탭처럼 화면 갱신이 멈춘 경우에도 최종 숫자는 반드시 보이게 한다
    countSafety = setTimeout(function () {
      cancelAnimationFrame(countFrame);
      showNumber(target);
    }, duration + 80);
  }

  function playClass(node, name) {
    node.classList.remove("enter", "leave", "back", "bump");
    void node.offsetWidth; // 같은 애니메이션을 다시 시작하려면 한 번 다시 그리게 해야 한다
    node.classList.add(name);
  }

  function floatText(text, minus) {
    var f = document.createElement("span");
    f.className = "float" + (minus ? " minus" : "");
    f.textContent = text;
    el.floats.appendChild(f);
    setTimeout(function () { f.remove(); }, 1000);
  }

  function buzz(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* 무시 */ } }
  }

  function completeCard() {
    if (busy || !session || Core.isFinished(session)) return;
    busy = true;
    var chunk = Core.nextChunk(session);
    session = Core.completeCard(session);
    save();
    floatText("+" + chunk);
    buzz(Core.isFinished(session) ? [60, 60, 120] : 30);

    var wait = reduceMotion.matches ? 0 : 280;
    playClass(el.card, "leave");
    setTimeout(function () {
      el.card.classList.remove("leave");
      render({ cardAnim: "enter" });
      if (Core.isFinished(session)) confetti();
      busy = false;
    }, wait);
  }

  el.card.addEventListener("click", completeCard);

  // 카드에 손가락이 닿는 순간 눌린 느낌을 바로 준다(click은 손을 뗄 때 온다)
  el.card.addEventListener("pointerdown", function () { el.card.classList.add("pressed"); });
  ["pointerup", "pointerleave", "pointercancel"].forEach(function (type) {
    el.card.addEventListener(type, function () { el.card.classList.remove("pressed"); });
  });

  el.undo.addEventListener("click", function () {
    if (busy || !Core.canUndo(session)) return;
    var last = session.history[session.history.length - 1];
    session = Core.undo(session);
    save();
    floatText("−" + last, true);
    buzz(15);
    render({ cardAnim: "back" });
  });

  el.reset.addEventListener("click", function () {
    if (session && session.done > 0 && !Core.isFinished(session) &&
        !window.confirm("지금까지 센 " + session.done + "회를 지우고 새로 시작할까요?")) return;
    session = null;
    save();
    stopConfetti();
    showSetup();
  });

  // 키보드: 스페이스·엔터는 카드 버튼 기본 동작, 어디서든 Ctrl+Z로 되돌리기
  document.addEventListener("keydown", function (e) {
    if (el.counter.hidden) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); el.undo.click(); }
  });

  /* ---------- 완료 축하 효과(색종이) ---------- */
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
    for (var i = 0; i < 140; i += 1) {
      pieces.push({
        x: innerWidth / 2, y: innerHeight * 0.45,
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
      if (now - start < 2600) confettiFrame = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(start);
  }

  function stopConfetti() {
    cancelAnimationFrame(confettiFrame);
    var ctx = el.confetti.getContext("2d");
    ctx.clearRect(0, 0, el.confetti.width, el.confetti.height);
  }

  /* ---------- 시작 ---------- */
  session = load();
  if (session) { shownDone = session.done; showCounter(false); }
  else showSetup();
})();
