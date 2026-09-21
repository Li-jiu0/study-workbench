/* assets/layer-stack.js — R4-A 弹层返回键压栈基建（P2-3）
 * 接口（全局，命名固定，供 R4-B/C/D 各页调用）：
 *   window.xtLayerPush(id)     打开弹层时调用：压入一条历史 + 记录到内部栈
 *   window.xtLayerPop(id)      弹层自身关闭（点遮罩/×/代码关闭）时调用：栈是自己压的则 history.back() 收尾
 *   window.xtLayerIsTop(id)    判断某 id 是否当前栈顶（可选辅助）
 *   window.xtLayerBind(openFn, closeFn)  便捷封装：返回 { open(id), close(id) } 自动压栈/弹栈
 *   window.xtLayerDepth()      当前栈深度（调试/自测用）
 * --------------------------------------------------------------------
 * 背景：安卓壳 MainActivity 返回键走网页 history（canGoBack 则 goBack）。
 * 全站 147 个弹层节点打开时没有压入历史，用户按返回键期望「关掉这层」，
 * 实际却是返回上一页/退出 App。本文件统一压栈修复。
 *
 * 设计参照（成熟范例，语义对齐）：
 *   - assets/img-viewer.js:405-411（popstate 关闭）、:445-480（pushHistory / close + V.popPushed 状态位 + try/catch 静默降级）
 *   - assets/xt-profile.js:1080-1102（openView pushState / backView history.back / popstate 弹栈）
 *   - 注意 assets/subpage-router.js 用 hash 而非 pushState，是第三种范式，未照抄。
 *
 * 核心行为：
 *   1) 内部数组维护栈，支持多层逐层关闭（连续开两层，返回键先关上层）。
 *   2) popstate 触发时：弹栈顶并调用其 close 回调；此路径下【不再 history.back()】（否则会把页面一起退掉）。
 *      用状态位 popTriggered 区分「返回键触发」与「代码关闭触发」。
 *   3) 代码关闭时：若栈顶仍是自己压的那条（用 history.state 上的标记判断），调 history.back() 收尾，
 *      避免「关了弹层还要多按一次返回」。
 *   4) file:// 老内核 pushState 可能抛错 → try/catch 静默降级（降级后行为＝现状，不报错、不卡死）。
 *   5) 与 img-viewer.js / xt-profile.js 共存：它们的 popstate 监听器自带状态位，只有自己打开时消费事件；
 *      本监听器【仅在栈非空时】消费事件，互不干扰。
 *   6) 只加一层监听（window.__xtLayerStackLoaded__ 幂等守卫，照 xt-toast.js:10-12）。
 * --------------------------------------------------------------------
 * 依赖：无（纯独立模块）。占位标记 key：history.state.xtLayer = <自增序号>
 */
(function () {
  'use strict';
  if (window.__xtLayerStackLoaded__) {
    return;  // 防重复注入
  }
  window.__xtLayerStackLoaded__ = true;

  // 栈元素：{ id: string, seq: number }  seq 用于匹配 history.state 上的标记
  var stack = [];
  var seqCounter = 0;
  // 回调注册表：id -> { open: fn, close: fn }
  var handlers = {};
  // 状态位：本次 popstate 是否已消费（返回键触发），用于避免二次 history.back()
  var popTriggered = false;

  /** 当前历史记录是否为本模块压入的那条（用于代码关闭时判断是否 back 收尾） */
  function stateIsMine() {
    try {
      var st = window.history && window.history.state;
      return !!(st && typeof st === 'object' && st.xtLayer);
    } catch (e) {
      return false;
    }
  }

  /**
   * 压入一条历史记录 + 记录到内部栈。
   * @param {string} id 弹层唯一标识（必填，非空字符串）
   * @returns {boolean} 是否成功压栈（pushState 降级时仍返回 true，只是无历史记录）
   */
  function push(id) {
    if (!id || typeof id !== 'string') {
      return false;
    }
    seqCounter += 1;
    var entry = { id: id, seq: seqCounter };
    stack.push(entry);
    popTriggered = false;  // 新层打开，清残留状态位
    try {
      if (window.history && typeof window.history.pushState === 'function') {
        window.history.pushState({ xtLayer: seqCounter }, '');
      }
    } catch (e) {
      /* file:// 老内核可能抛错：静默降级，行为等同现状（不报错、不卡死） */
    }
    return true;
  }

  /**
   * 弹层自身关闭时调用。
   * 若栈顶仍是自己（或已是别人）→ 从栈中移除；若当前历史是模块压入的记录则 history.back() 收尾，
   * 防止「关了弹层还要多按一次返回」。
   * @param {string} id 弹层唯一标识
   */
  function pop(id) {
    if (!id || typeof id !== 'string') {
      return;
    }
    // 从栈中移除该 id（优先移除最后一条匹配，支持同 id 多层）
    var removed = null;
    var removedIdx = -1;
    for (var i = stack.length - 1; i >= 0; i--) {
      if (stack[i].id === id) {
        removedIdx = i;
        removed = stack.splice(i, 1)[0];
        break;
      }
    }
    // 代码关闭触发：仅当【被关闭的就是原栈顶】时才 back() 收尾。
    // 若关的是中间/底层（上面还压着更上层的弹层），当前 history 顶部记录属于上层，
    // 这里 back() 会把上层的记录退掉 —— 上层仍开着却失去返回键保护。
    // 判定：splice 后 removedIdx === stack.length 说明移除前它就是最后一条（原栈顶）。
    var wasTop = (removedIdx >= 0 && removedIdx === stack.length);
    if (!popTriggered && removed && wasTop && stateIsMine()) {
      try {
        if (window.history && typeof window.history.back === 'function') {
          window.history.back();
        }
      } catch (e) {
        /* 静默降级 */
      }
    }
  }

  /** 判断某 id 是否当前栈顶 */
  function isTop(id) {
    return stack.length > 0 && stack[stack.length - 1].id === id;
  }

  /** 当前栈深度 */
  function depth() {
    return stack.length;
  }

  /** 注册弹层的开/关回调（供 xtLayerBind 使用，外部一般无需直接调用） */
  function register(id, openFn, closeFn) {
    if (!id || typeof id !== 'string') {
      return;
    }
    handlers[id] = { open: openFn, close: closeFn };
  }

  /**
   * 便捷封装：把「打开 / 关闭」函数包成自动压栈 / 弹栈的版本，减少各页样板代码。
   * @param {Function} openFn  实际打开逻辑
   * @param {Function} closeFn 实际关闭逻辑（可为空，此时仅做栈维护）
   * @returns {{open: Function, close: Function}} 包装后的对象
   */
  function bind(openFn, closeFn) {
    return {
      open: function (id) {
        if (typeof openFn === 'function') {
          openFn();
        }
        if (!handlers[id]) {
          register(id, openFn, closeFn);
        }
        push(id);
      },
      close: function (id) {
        if (!handlers[id]) {
          register(id, openFn, closeFn);
        }
        pop(id);
        if (typeof closeFn === 'function') {
          closeFn();
        }
      }
    };
  }

  /* ---- 返回键：popstate 弹栈并关闭（仅在栈非空时消费事件，不干扰 img-viewer/xt-profile） ---- */
  window.addEventListener('popstate', function () {
    if (stack.length === 0) {
      return;  // 栈空 → 交给 img-viewer.js / xt-profile.js 等各自的监听器处理
    }
    var entry = stack.pop();
    // 标记：本次为返回键触发。置位后【同步】走完 close 回调再复位 ——
    // 这样 close 回调内部若同步调用 xtLayerPop(id)，会命中 popTriggered=true 而不再补一次
    // history.back()（否则多退一层，把页面也一起退掉）。
    popTriggered = true;
    var h = entry && handlers[entry.id];
    try {
      if (h && typeof h.close === 'function') {
        h.close();
      }
    } catch (e) {
      /* 关闭回调异常不应影响返回键流程 */
    } finally {
      popTriggered = false;
    }
  });

  /* ---- 暴露全局 API ---- */
  window.xtLayerPush = push;
  window.xtLayerPop = pop;
  window.xtLayerIsTop = isTop;
  window.xtLayerDepth = depth;
  window.xtLayerBind = bind;
  window.xtLayerRegister = register;

  // 调试日志（开发模式可见；生产模式可忽略）
  if (typeof console !== 'undefined' && console.log) {
    console.log('[XT-LAYER-STACK] ready');
  }
})();
