package com.study.workbench;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * R105 桩测试：PollLogic 决策逻辑（纯 Java，javac 直接编译运行，exit=0 即全过）。
 * 覆盖：亮/灭屏间隔、未登录跳过、开关关跳过、401 停止、通知去重（同 id 二次不弹）。
 */
public class PollLogicTest {

    private static int passed = 0;
    private static int failed = 0;

    private static void eq(String name, Object expect, Object actual) {
        boolean ok = (expect == null) ? (actual == null) : expect.equals(actual);
        if (ok) { passed++; System.out.println("[PASS] " + name); }
        else { failed++; System.out.println("[FAIL] " + name + "  expect=" + expect + "  actual=" + actual); }
    }

    public static void main(String[] args) {
        // ---- 1. 轮询节奏：亮屏 60s / 灭屏 300s ----
        eq("亮屏间隔=60000ms", Long.valueOf(60000L), Long.valueOf(PollLogic.intervalFor(true)));
        eq("灭屏间隔=300000ms", Long.valueOf(300000L), Long.valueOf(PollLogic.intervalFor(false)));

        // ---- 2. 是否轮询：仅已登录 + 开关开 ----
        eq("已登录+开 → 轮询", Boolean.TRUE, Boolean.valueOf(PollLogic.shouldPoll("tk", true)));
        eq("未登录(空token) → 跳过", Boolean.FALSE, Boolean.valueOf(PollLogic.shouldPoll("", true)));
        eq("未登录(null token) → 跳过", Boolean.FALSE, Boolean.valueOf(PollLogic.shouldPoll(null, true)));
        eq("token 空白 → 跳过", Boolean.FALSE, Boolean.valueOf(PollLogic.shouldPoll("   ", true)));
        eq("开关关 → 跳过", Boolean.FALSE, Boolean.valueOf(PollLogic.shouldPoll("tk", false)));

        // ---- 3. token 失效：401 → 停；其余 → 继续 ----
        eq("HTTP 401 → 停止", Integer.valueOf(PollLogic.HTTP_STOP_TOKEN_INVALID),
                Integer.valueOf(PollLogic.onHttpStatus(401)));
        eq("HTTP 200 → 继续", Integer.valueOf(PollLogic.HTTP_CONTINUE),
                Integer.valueOf(PollLogic.onHttpStatus(200)));
        eq("HTTP 500 → 继续", Integer.valueOf(PollLogic.HTTP_CONTINUE),
                Integer.valueOf(PollLogic.onHttpStatus(500)));
        eq("HTTP 0(网络失败) → 继续", Integer.valueOf(PollLogic.HTTP_CONTINUE),
                Integer.valueOf(PollLogic.onHttpStatus(0)));

        // ---- 4. 通知去重（同 id 二次不弹）----
        Map<Long, Long> snap = new HashMap<Long, Long>();
        List<long[]> items = new ArrayList<long[]>();

        // 4.1 首轮建基线：不弹
        items.add(new long[] { 123L, 1726700000000L });
        eq("首轮建基线不弹", Integer.valueOf(0),
                Integer.valueOf(PollLogic.diffSnapshots(snap, items, true).size()));
        eq("基线快照已写入", Integer.valueOf(1), Integer.valueOf(snap.size()));

        // 4.2 同 id 同 time 二次轮询：不弹（去重核心用例）
        items.clear();
        items.add(new long[] { 123L, 1726700000000L });
        eq("同id同time二次不弹", Integer.valueOf(0),
                Integer.valueOf(PollLogic.diffSnapshots(snap, items, false).size()));

        // 4.3 同 id、time 上升（来了新消息）：弹一次
        items.clear();
        items.add(new long[] { 123L, 1726700060000L });
        List<Integer> hits = PollLogic.diffSnapshots(snap, items, false);
        eq("同id time上升弹一次", Integer.valueOf(1), Integer.valueOf(hits.size()));
        eq("命中下标=0", Integer.valueOf(0), hits.isEmpty() ? Integer.valueOf(-1) : hits.get(0));

        // 4.4 会话已读（id 从响应消失）：移出快照
        items.clear();
        PollLogic.diffSnapshots(snap, items, false);
        eq("已读会话移出快照", Integer.valueOf(0), Integer.valueOf(snap.size()));

        // 4.5 已读会话重新来信：视为新消息，弹
        items.add(new long[] { 123L, 1726700120000L });
        eq("已读会话重新来信弹", Integer.valueOf(1),
                Integer.valueOf(PollLogic.diffSnapshots(snap, items, false).size()));

        // 4.6 新会话出现（服务运行中第一次见到该 id）：弹
        items.clear();
        items.add(new long[] { 123L, 1726700120000L });
        items.add(new long[] { 456L, 1726700130000L });
        eq("新会话出现弹", Integer.valueOf(1),
                Integer.valueOf(PollLogic.diffSnapshots(snap, items, false).size()));

        // 4.7 混合：一个不变一个上升 → 只弹上升者
        items.clear();
        items.add(new long[] { 123L, 1726700120000L }); // 不变
        items.add(new long[] { 456L, 1726700200000L }); // 上升
        eq("混合仅time上升者弹", Integer.valueOf(1),
                Integer.valueOf(PollLogic.diffSnapshots(snap, items, false).size()));

        // 4.8 空响应/空参数防御
        eq("空items返回空", Integer.valueOf(0),
                Integer.valueOf(PollLogic.diffSnapshots(snap, new ArrayList<long[]>(), false).size()));
        eq("null prev 返回空", Integer.valueOf(0),
                Integer.valueOf(PollLogic.diffSnapshots(null, items, false).size()));

        System.out.println("----");
        System.out.println("passed=" + passed + " failed=" + failed);
        if (failed > 0) System.exit(1);
        System.exit(0);
    }
}
