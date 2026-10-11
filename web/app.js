/* global $ */
(function () {
  const $box = $("#wmksContainer");
  const $status = $("#status");
  const $cad = $("#cad");
  const $ungrab = $("#ungrab");
  const $disc = $("#disconnect");
  const $hud = $("#hud");
  let currentId = "";
  let currentName = "";
  function vmLabel() {
    if (currentName && currentId && currentName !== currentId) {
      return currentName + " (" + currentId + ")";
    }
    return currentName || currentId;
  }
  let ready = false;
  let grabbed = false;
  let ungrabbing = false;
  let keysLocked = false;
  let relAccX = 0;
  let relAccY = 0;
  let relRaf = 0;

  const stats = {
    frames: 0,
    fps: 0,
    lastFrameAt: 0,
    mouseSent: 0,
    mouseHz: 0,
    markFrame() {
      this.frames++;
      this.lastFrameAt = performance.now();
    },
    markMouse() {
      this.mouseSent++;
    },
  };

  $box.wmks({
    fitToParent: true,
    fitGuest: false,
    useNativePixels: false,
    useVNCHandshake: true,
    retryConnectionInterval: 1500,
    // 直通：Command=Win，Control=Ctrl。不要把 Cmd+C/V 改成 Ctrl+C/V。
    mapMetaToCtrlForKeys: [],
    mapMetaToCtrlForVScans: [],
    enableWindowsKey: false,
    disableVscanKeyboard: false,
  });
  patchKeyboardPassthrough();

  $box.find("canvas").attr("tabindex", "-1");
  patchRescale();

  $box.on("wmksconnecting", () => setStatus("正在连接…"));
  $box.on("wmksconnected wmksresolutionchanged wmksframeBufferInited", () => {
    ready = true;
    $cad.prop("disabled", false);
    $ungrab.prop("disabled", true);
    $disc.prop("disabled", false);
    hookFps();
    patchKeyboardPassthrough();
    wireMouse();
    wireHostKeys();
    setRelativeMouse(false);
    setIdleCursor();
    scheduleLayout();
    setStatus("已连接 " + vmLabel() + " — 点击画面开始控制，Esc 退出");
  });
  $box.on("wmksdisconnected", (_e, data) => {
    ready = false;
    leaveControl(true);
    $cad.prop("disabled", true);
    $ungrab.prop("disabled", true);
    $disc.prop("disabled", true);
    const extra = data && data.reason ? " (" + data.reason + ")" : "";
    setStatus("已断开" + extra);
  });
  $box.on("wmkserror wmksauthenticationfailed wmksprotocolerror", (_e, err) => {
    setStatus("错误: " + (err || "unknown"));
  });

  $("#refresh").on("click", loadVMs);
  $("#cad").on("click", () => {
    if (ready) $box.wmks("sendKeyCodes", [17, 18, 46]);
  });
  $ungrab.on("click", () => leaveControl());
  $("#disconnect").on("click", () => $box.wmks("disconnect"));
  $(window).on("resize", () => {
    if (ready) layoutConsole();
  });
  setInterval(renderHud, 1000);

  function widget() {
    return $box.data("wmks-wmks") || $box.data("wmks");
  }

  function patchRescale() {
    const inst = widget();
    if (!inst || inst._govmomiPatched) return;
    const orig = inst.rescaleOrResize.bind(inst);
    inst.rescaleOrResize = function (tryFitGuest) {
      orig(tryFitGuest);
      centerScaledCanvas();
    };
    inst._govmomiPatched = true;
  }

  function centerScaledCanvas() {
    const host = $box[0];
    const canvas = $box.find("canvas#mainCanvas")[0];
    if (!host || !canvas) return;
    const inst = widget();
    const hostW = host.clientWidth;
    const hostH = host.clientHeight;
    if (hostW < 8 || hostH < 8) return;
    canvas.style.transformOrigin = "0 0";
    const gw = (inst && inst._guestWidth) || canvas.offsetWidth || canvas.width;
    const gh = (inst && inst._guestHeight) || canvas.offsetHeight || canvas.height;
    const scaleX = hostW / gw;
    const scaleY = hostH / gh;
    const scale = Math.max(0.1, Math.min(scaleX, scaleY));
    if (inst) inst._scale = scale;
    canvas.style.transform = "scale(" + scale + ")";
    const left = Math.max(0, (hostW - gw * scale) / 2);
    canvas.style.left = left + "px";
    canvas.style.top = "0px";
    if (inst) {
      inst._x = left;
      inst._y = 0;
    }
    $box.find("video").each(function () {
      this.style.transformOrigin = "0 0";
      this.style.transform = "scale(" + scale + ")";
      this.style.left = left + "px";
      this.style.top = "0px";
    });
  }

  function layoutConsole() {
    patchRescale();
    try {
      $box.wmks("rescale");
    } catch (_) {
      /* widget 尚未就绪 */
    }
    centerScaledCanvas();
  }

  function scheduleLayout() {
    layoutConsole();
    requestAnimationFrame(() => {
      layoutConsole();
      requestAnimationFrame(layoutConsole);
    });
    setTimeout(layoutConsole, 50);
    setTimeout(layoutConsole, 200);
  }

  function watchContainerSize() {
    const host = $box[0];
    if (!host || host._govmomiRo) return;
    if (typeof ResizeObserver === "undefined") return;
    host._govmomiRo = true;
    new ResizeObserver(() => {
      if (ready) layoutConsole();
    }).observe(host);
  }
  watchContainerSize();

  function setRelativeMouse(on) {
    const inst = widget();
    if (!inst) return;
    inst.options.sendRelativeMouseEvent = on;
    if (inst._vncDecoder) inst._vncDecoder.options.sendRelativeMouseEvent = on;
    if (!on) {
      relAccX = 0;
      relAccY = 0;
      if (relRaf) {
        cancelAnimationFrame(relRaf);
        relRaf = 0;
      }
    }
  }

  function guestMouseScale() {
    const inst = widget();
    const scale = inst && inst._scale ? inst._scale : 1;
    const pixel = inst && inst._pixelRatio ? inst._pixelRatio : 1;
    const dpi = inst && inst._displayScaleRatio ? inst._displayScaleRatio : 1;
    return (pixel * dpi) / scale;
  }

  function queueRelativeMove(dx, dy) {
    if (!dx && !dy) return;
    const k = guestMouseScale();
    relAccX += dx * k;
    relAccY += dy * k;
    if (!relRaf) relRaf = requestAnimationFrame(flushRelativeMove);
  }

  function flushRelativeMove() {
    if (relRaf) {
      cancelAnimationFrame(relRaf);
      relRaf = 0;
    }
    const inst = widget();
    const dec = inst && inst._vncDecoder;
    if (!dec || !dec.options.sendRelativeMouseEvent) {
      relAccX = 0;
      relAccY = 0;
      return;
    }
    const dx = Math.trunc(relAccX);
    const dy = Math.trunc(relAccY);
    if (!dx && !dy) return;
    relAccX -= dx;
    relAccY -= dy;
    // 不要走 onMouseMove：它按绝对坐标节流，相对位移会被后一包覆盖丢掉。
    dec._mouseX = dx;
    dec._mouseY = dy;
    dec._sendMouseEvent();
    dec._mouseX = 0;
    dec._mouseY = 0;
    stats.markMouse();
  }

  function exitHint() {
    return "Esc 退出";
  }

  function setIdleCursor() {
    const canvas = $box.find("canvas#mainCanvas")[0];
    if (!canvas) return;
    if (document.pointerLockElement === canvas) return;
    $box.removeClass("controlling");
    canvas.style.cursor = "default";
    $box.css("cursor", "default");
  }

  function releaseGuestModifiers() {
    const inst = widget();
    const km = inst && inst._keyboardManager;
    const dec = inst && inst._vncDecoder;
    const codes = (typeof WMKS !== "undefined" && WMKS.VSCAN_CODES) || {};
    const scans = [
      codes.VSCAN_LCONTROL,
      codes.VSCAN_RCONTROL,
      codes.VSCAN_LALT,
      codes.VSCAN_RALT,
      codes.VSCAN_LSHIFT,
      codes.VSCAN_RSHIFT,
      codes.VSCAN_LGUI,
      codes.VSCAN_RGUI,
    ].filter(Boolean);
    scans.forEach((scan) => {
      if (km && km.sendVScanKey) km.sendVScanKey(scan, false);
      else if (dec && dec.onKeyVScan) dec.onKeyVScan(scan, false);
    });
  }

  function enterControl() {
    if (!ready || grabbed) return;
    grabbed = true;
    const canvas = $box.find("canvas#mainCanvas")[0];
    setRelativeMouse(true);
    $box.addClass("controlling");
    $box.trigger("focus");
    if (canvas) canvas.style.cursor = "none";
    $ungrab.prop("disabled", false);
    setStatus("正在控制 " + vmLabel() + " — " + exitHint());
  }

  function leaveControl(silent) {
    if (ungrabbing) return;
    ungrabbing = true;
    grabbed = false;
    setRelativeMouse(false);
    unlockSystemKeys();
    releaseGuestModifiers();
    $box.removeClass("controlling");
    $ungrab.prop("disabled", true);
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch (_) {}
    }
    setIdleCursor();
    if (!silent && ready) {
      setStatus("已连接 " + vmLabel() + " — 点击画面开始控制，" + exitHint());
    }
    ungrabbing = false;
    if (ready) layoutConsole();
  }

  function hookFps() {
    const canvas = $box.find("canvas#mainCanvas")[0];
    if (!canvas || canvas._fpsHooked) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas._fpsHooked = true;
    ["putImageData", "drawImage"].forEach((name) => {
      const orig = ctx[name].bind(ctx);
      ctx[name] = function () {
        stats.markFrame();
        return orig.apply(this, arguments);
      };
    });
  }

  function wireMouse() {
    const inst = widget();
    const canvas = $box.find("canvas#mainCanvas")[0];
    if (!inst || !canvas || canvas._govmomiMouse) {
      setIdleCursor();
      return;
    }
    canvas._govmomiMouse = true;
    setRelativeMouse(false);
    setIdleCursor();

    canvas.addEventListener("click", () => {
      if (!ready) return;
      $box.trigger("focus");
      if (document.pointerLockElement === canvas) return;
      beginGrab(canvas);
    });

    document.addEventListener("pointerlockchange", () => {
      const locked = document.pointerLockElement === canvas;
      if (locked) enterControl();
      else if (grabbed) leaveControl();
    });

    document.addEventListener("mousemove", (e) => {
      if (!ready || !inst._vncDecoder) return;
      if (document.pointerLockElement !== canvas) return;
      queueRelativeMove(e.movementX || 0, e.movementY || 0);
      e.stopPropagation();
    });

    document.addEventListener("mousedown", (e) => {
      if (!ready || !inst._vncDecoder) return;
      if (document.pointerLockElement !== canvas) return;
      flushRelativeMove();
      inst._vncDecoder.onMouseButton(0, 0, 1, 1 << (e.button || 0));
      e.preventDefault();
    });
    document.addEventListener("mouseup", (e) => {
      if (!ready || !inst._vncDecoder) return;
      if (document.pointerLockElement !== canvas) return;
      flushRelativeMove();
      inst._vncDecoder.onMouseButton(0, 0, 0, 1 << (e.button || 0));
      e.preventDefault();
    });
    document.addEventListener(
      "wheel",
      (e) => {
        if (!ready || document.pointerLockElement !== canvas || !inst._vncDecoder) return;
        const dx = Math.max(-1, Math.min(1, e.deltaX || e.wheelDeltaX || 0));
        const dy = Math.max(-1, Math.min(1, -(e.deltaY || 0) || e.wheelDeltaY || 0));
        inst._vncDecoder.onMouseWheel(0, 0, dx, dy);
        e.preventDefault();
      },
      { passive: false }
    );
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  async function beginGrab(canvas) {
    keysLocked = await lockSystemKeys();
    try {
      const req = canvas.requestPointerLock({ unadjustedMovement: true });
      if (req && typeof req.then === "function") await req;
    } catch (_) {
      try {
        canvas.requestPointerLock();
      } catch (__) {}
    }
  }

  async function lockSystemKeys() {
    if (!navigator.keyboard || !navigator.keyboard.lock) return false;
    try {
      await navigator.keyboard.lock();
      return true;
    } catch (_) {
      return false;
    }
  }

  function unlockSystemKeys() {
    keysLocked = false;
    if (navigator.keyboard && navigator.keyboard.unlock) {
      navigator.keyboard.unlock();
    }
  }

  function isReleaseCombo(e) {
    return e.code === "Escape" || e.key === "Escape" || e.key === "Esc";
  }

  function controlling() {
    return ready && grabbed;
  }

  function patchKeyboardPassthrough() {
    const inst = widget();
    if (!inst || inst._govmomiKbPatch) return;
    const km = inst._keyboardManager;
    if (!km) return;
    inst._govmomiKbPatch = true;
    if (km.mapMetaToCtrlForKeys) km.mapMetaToCtrlForKeys = [];
    if (Array.isArray(km._guiToCtrlVScanMap)) km._guiToCtrlVScanMap = [];
    if (typeof km.enableWindowsKey === "function") km.enableWindowsKey(false);
    else km._enableWindowsKey = false;
    if (!km.sendVScanKey || typeof WMKS === "undefined") return;

    const LGUI = WMKS.VSCAN_CODES.VSCAN_LGUI;
    const RGUI = WMKS.VSCAN_CODES.VSCAN_RGUI;
    const isGui = (code) =>
      code === "MetaLeft" ||
      code === "MetaRight" ||
      code === "OSLeft" ||
      code === "OSRight";
    const scanOf = (code) => (code.indexOf("Right") >= 0 ? RGUI : LGUI);
    const down = km.onKeyDown.bind(km);
    const up = km.onKeyUp.bind(km);
    km.onKeyDown = function (e) {
      const code = e.originalEvent && e.originalEvent.code;
      if (isGui(code)) {
        const scan = scanOf(code);
        km._clientModifierStatus[scan] = true;
        km.sendVScanKey(scan, true);
        e.preventDefault();
        return false;
      }
      return down(e);
    };
    km.onKeyUp = function (e) {
      const code = e.originalEvent && e.originalEvent.code;
      if (isGui(code)) {
        const scan = scanOf(code);
        km._clientModifierStatus[scan] = false;
        km.sendVScanKey(scan, false);
        e.preventDefault();
        return false;
      }
      return up(e);
    };
  }

  function wireHostKeys() {
    if (document._govmomiHostKeys) return;
    document._govmomiHostKeys = true;
    const steal = (e) => {
      if (!controlling()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isReleaseCombo(e)) {
        if (e.type === "keydown") leaveControl();
        return;
      }
      const inst = widget();
      const km = inst && inst._keyboardManager;
      if (!km) return;
      const je = $.event.fix(e);
      if (e.type === "keydown") km.onKeyDown(je);
      else if (e.type === "keypress") km.onKeyPress(je);
      else if (e.type === "keyup") km.onKeyUp(je);
    };
    document.addEventListener("keydown", steal, true);
    document.addEventListener("keypress", steal, true);
    document.addEventListener("keyup", steal, true);
  }

  function renderHud() {
    stats.fps = stats.frames;
    stats.frames = 0;
    stats.mouseHz = stats.mouseSent;
    stats.mouseSent = 0;
    if (!ready) {
      $hud.text("—");
      return;
    }
    const inst = widget();
    const now = performance.now();
    const frameAge = stats.lastFrameAt ? Math.round(now - stats.lastFrameAt) : "—";
    const gw = inst && inst._guestWidth ? inst._guestWidth : "?";
    const gh = inst && inst._guestHeight ? inst._guestHeight : "?";
    const scale = inst && inst._scale ? inst._scale.toFixed(2) : "?";
    $hud.text(
      stats.fps +
        " fps · 帧间隔 " +
        frameAge +
        "ms · 鼠标 " +
        stats.mouseHz +
        "/s · " +
        gw +
        "×" +
        gh +
        " · ×" +
        scale
    );
  }

  async function loadVMs() {
    const res = await fetch("/v1/vms");
    if (!res.ok) {
      setStatus("列表失败: " + (await res.text()));
      return;
    }
    const vms = await res.json();
    const $ul = $("#vms").empty();
    vms.sort((a, b) => a.name.localeCompare(b.name));
    vms.forEach((vm) => {
      const on = vm.powerState === "poweredOn";
      const $li = $("<li/>")
        .toggleClass("active", String(vm.id) === String(currentId) || vm.name === currentName)
        .append($("<span/>").text(vm.name))
        .append($("<span/>").addClass("power").toggleClass("on", on).text(vm.powerState))
        .on("click", () => openConsole(vm, on));
      $ul.append($li);
    });
    if (!vms.length) setStatus("没有虚拟机");
  }

  async function openConsole(vm, on) {
    const id = vm.id || vm.name;
    const name = vm.name || String(id);
    currentId = String(id);
    currentName = name;
    $("#vms li").each(function () {
      $(this).toggleClass("active", $(this).children().first().text() === name);
    });
    if (!on) {
      setStatus(name + " 未开机，无法出 WebMKS");
      return;
    }
    leaveControl(true);
    setIdleCursor();
    try {
      $box.wmks("disconnect");
    } catch (_) {
      /* first connect */
    }
    setStatus("申请 ticket: " + name);
    const res = await fetch("/v1/vms/" + encodeURIComponent(id) + "/console", { method: "POST" });
    if (!res.ok) {
      setStatus("出票失败: " + (await res.text()));
      return;
    }
    const { ws } = await res.json();
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    $box.wmks("connect", proto + "//" + location.host + ws);
    scheduleLayout();
  }

  function setStatus(t) {
    $status.text(t);
  }

  loadVMs();
})();
