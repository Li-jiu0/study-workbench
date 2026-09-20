package com.study.workbench;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 星途 · 消息轮询决策逻辑（R105）
 * =================================================
 * 纯 Java、零 Android 依赖，便于单测桩验证（PollLogicTest）。
 * MsgPollService 负责网络/通知/生命周期，本类只做"决策"：
 *
 *  · 轮询节奏：亮屏 60s/次、灭屏 120s/次；
 *  · 是否轮询：仅"开关开 + token 非空"（已登录）才轮询；
 *  · token 失效：HTTP 401 → 停止轮询；
 *  · 通知去重：按会话条目 id + last.time 对比上次快照，
 *    仅"新出现的会话"或"time 上升"才弹，已读会话自动移出快照。
 */
public final class PollLogic {

    /** 亮屏轮询间隔：60 秒。 */
    public static final long INTERVAL_SCREEN_ON_MS = 60_000L;
    /** 灭屏轮询间隔：120 秒（2 分钟）。【需求C】由 300s 收紧到 120s：通知时效↑，
     *  耗电增量可接受；Doze 下仍有电池优化白名单（首启引导）缓解。 */
    public static final long INTERVAL_SCREEN_OFF_MS = 120_000L;

    /** HTTP 处理结论：继续轮询。 */
    public static final int HTTP_CONTINUE = 0;
    /** HTTP 处理结论：token 失效（401），停止轮询。 */
    public static final int HTTP_STOP_TOKEN_INVALID = 1;

    /** 当前屏幕状态对应的轮询间隔（毫秒）。 */
    public static long intervalFor(final boolean screenOn) {
        return screenOn ? INTERVAL_SCREEN_ON_MS : INTERVAL_SCREEN_OFF_MS;
    }

    /** 是否应当轮询：开关开且 token 非空（视为已登录）。 */
    public static boolean shouldPoll(final String token, final boolean enabled) {
        return enabled && token != null && !token.trim().isEmpty();
    }

    /** 按轮询响应的 HTTP 状态码给出处理结论（其余状态码一律视为"本轮失败，继续"）。 */
    public static int onHttpStatus(final int code) {
        return code == 401 ? HTTP_STOP_TOKEN_INVALID : HTTP_CONTINUE;
    }

    /**
     * 对比上次快照，返回需要弹通知的条目下标列表，并把 prev 原地更新为本次快照。
     *
     * 去重规则（by 条目 id）：
     *  · firstRound=true：仅建立基线，一律不弹（服务刚启动/重登后首轮）；
     *  · 快照中没有该 id（新会话出现，或已读后重新来信）→ 弹；
     *  · 快照中有该 id 且 last.time 上升（同会话来了新消息）→ 弹；
     *  · 其余（time 不变）→ 不弹，同 id 二次轮询绝不重复横幅；
     *  · 本次响应中消失的 id（用户已读）→ 自动移出快照。
     *
     * @param prev       上次快照（id → last.time），方法返回后即本次快照；只允许轮询线程访问
     * @param items      本次条目，每项 long[]{id, time}（只含 unread>0，time 降序由后端保证）
     * @param firstRound 是否基线轮（true 则只建快照不弹）
     * @return 需要弹通知的条目下标（对应 items）
     */
    public static List<Integer> diffSnapshots(final Map<Long, Long> prev,
                                              final List<long[]> items,
                                              final boolean firstRound) {
        final List<Integer> hits = new ArrayList<Integer>();
        if (prev == null || items == null) return hits;
        final Map<Long, Long> next = new HashMap<Long, Long>();
        for (int i = 0; i < items.size(); i++) {
            final long[] it = items.get(i);
            if (it == null || it.length < 2) continue;
            final Long old = prev.get(it[0]);
            final boolean isNewConversation = (old == null);
            final boolean timeGrew = (old != null && it[1] > old.longValue());
            if (!firstRound && (isNewConversation || timeGrew)) hits.add(Integer.valueOf(i));
            next.put(Long.valueOf(it[0]), Long.valueOf(it[1]));
        }
        prev.clear();
        prev.putAll(next);
        return hits;
    }

    private PollLogic() { /* 纯工具类，禁止实例化 */ }
}
