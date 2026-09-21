package com.study.workbench;

import android.content.Context;
import android.os.Build;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 星途 · 崩溃 / 错误日志（R3b-A / B3）
 * ---------------------------------------------------------------
 * 目标（自用测试包强烈建议）：任何原生崩溃或前端脚本错误都可落盘，方便用户
 * 在「设置 → 数据管理 → 导出日志」一键把日志发给开发者定位问题。
 *
 * 设计要点：
 *  · 日志目录：getExternalFilesDir(null)/logs/（应用专属外部目录，无需任何存储权限，
 *    卸载即清除；也是 LogFileProvider 授权的唯一目录）。
 *  · 文件命名：crash-YYYYMMDD.log（原生崩溃）+ js-YYYYMMDD.log（前端脚本错误），
 *    「按天滚动」—— 每天一个文件，天然分片，便于按日期定位。
 *  · 限大小：单文件超过 MAX_BYTES 时截断重写（保留最新尾部），防止长期运行无限膨胀。
 *  · 全局未捕获异常：{@link #install} 注册 Thread.setDefaultUncaughtExceptionHandler，
 *    写栈后【必须】调用原 handler，绝不吞掉系统默认崩溃行为（否则 App 卡死且不重启）。
 *  · 日志自身绝不崩溃：所有 IO / 格式化全程 try/catch(Throwable)，失败静默。
 */
final class CrashLogger {

    private static final String TAG = "XTCrash";
    private static final String DIR_NAME = "logs";
    private static final long MAX_BYTES = 512L * 1024L; // 单文件 512KB 上限

    private static volatile Context appContext = null;
    private static volatile Thread.UncaughtExceptionHandler prevHandler = null;
    private static volatile boolean installed = false;
    private static final Object LOCK = new Object();

    private CrashLogger() { }

    /**
     * 安装全局未捕获异常处理器。幂等（重复调用只生效一次）。
     * 必须在 Application/Activity 尽早调用。写完后调用原 handler 链，保证系统默认崩溃行为不被破坏。
     */
    static void install(Context context) {
        if (context == null || installed) return;
        synchronized (LOCK) {
            if (installed) return;
            try {
                appContext = context.getApplicationContext();
                prevHandler = Thread.getDefaultUncaughtExceptionHandler();
                Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
                    @Override
                    public void uncaughtException(Thread thread, Throwable ex) {
                        // ① 先尽力落盘（自身异常吞掉，绝不能因日志失败影响后续崩溃处理）
                        try {
                            safeWrite("native_crash", buildCrashText(thread, ex));
                        } catch (Throwable ignore) { /* 日志自身失败：忽略 */ }
                        // ② 保留原 handler 链：交回系统/上层（如崩溃上报）默认行为
                        Thread.UncaughtExceptionHandler prev = prevHandler;
                        if (prev != null) {
                            try { prev.uncaughtException(thread, ex); } catch (Throwable ignore2) { }
                        }
                    }
                });
                installed = true;
            } catch (Throwable t) {
                // 安装失败：放弃日志能力，绝不影响 App 启动
                try { Log.w(TAG, "install failed: " + t); } catch (Throwable ignore) { }
            }
        }
    }

    /**
     * 追加写一条前端脚本错误（由 MainActivity 的 JS 桥调用，见 logJsError）。
     * kind 仅作标签（如 "window.onerror" / "unhandledrejection"）。
     * 任何异常都吞掉，绝不抛给 WebView 线程。
     */
    static void appendJsError(final String kind, final String detail) {
        try {
            StringBuilder sb = new StringBuilder();
            sb.append("[").append(nowString()).append("] ").append(safe(kind)).append("\n");
            sb.append(safe(detail)).append("\n");
            sb.append("--------------------------------------------------\n");
            safeWrite("js_error", sb.toString());
        } catch (Throwable ignore) { /* 静默 */ }
    }

    /** 崩溃文本：时间 + 机型（BRAND/MODEL）+ 系统版本 + App 版本 + 线程名 + 完整栈 */
    private static String buildCrashText(Thread thread, Throwable ex) {
        StringBuilder sb = new StringBuilder();
        sb.append("================ XT NATIVE CRASH ================\n");
        sb.append("time    : ").append(nowString()).append("\n");
        sb.append("brand   : ").append(safe(Build.BRAND)).append("\n");
        sb.append("model   : ").append(safe(Build.MODEL)).append("\n");
        sb.append("device  : ").append(safe(Build.DEVICE)).append("\n");
        sb.append("os      : Android ").append(safe(Build.VERSION.RELEASE))
          .append(" (API ").append(Build.VERSION.SDK_INT).append(")\n");
        sb.append("appVer  : ").append(appVersionName()).append("\n");
        sb.append("thread  : ").append(thread == null ? "?" : thread.getName()).append("\n");
        try {
            StringWriter sw = new StringWriter();
            PrintWriter pw = new PrintWriter(sw);
            if (ex != null) ex.printStackTrace(pw);
            pw.flush();
            sb.append("stack   :\n").append(sw.toString());
        } catch (Throwable t) {
            sb.append("stack   : <stacktrace unavailable>\n");
        }
        sb.append("=================================================\n\n");
        return sb.toString();
    }

    private static String appVersionName() {
        try {
            Context c = appContext;
            if (c == null) return "";
            android.content.pm.PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return pi == null || pi.versionName == null ? "" : pi.versionName;
        } catch (Throwable t) {
            return "";
        }
    }

    private static String nowString() {
        try {
            return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US).format(new Date());
        } catch (Throwable t) {
            return String.valueOf(System.currentTimeMillis());
        }
    }

    private static String today() {
        try {
            return new SimpleDateFormat("yyyyMMdd", Locale.US).format(new Date());
        } catch (Throwable t) {
            return "unknown";
        }
    }

    private static String safe(String s) {
        return s == null ? "" : s;
    }

    /** 日志目录（getExternalFilesDir(null)/logs）；不可用时回退 getFilesDir()/logs。不存在则创建。 */
    private static File ensureDir() {
        Context c = appContext;
        if (c == null) return null;
        File base = null;
        try { base = c.getExternalFilesDir(null); } catch (Throwable t) { base = null; }
        if (base == null) {
            try { base = c.getFilesDir(); } catch (Throwable t) { base = null; }
        }
        if (base == null) return null;
        File dir = new File(base, DIR_NAME);
        try {
            if (!dir.exists()) dir.mkdirs();
        } catch (Throwable t) { /* 创建失败：下面写文件会失败，静默 */ }
        return dir;
    }

    /**
     * 落盘一条日志到 crash-YYYYMMDD.log（native_crash）或 js-YYYYMMDD.log（js_error）。
     * 超过 MAX_BYTES 时截断保留尾部。全程 try/catch，失败静默。
     */
    private static void safeWrite(String prefix, String text) {
        FileOutputStream fos = null;
        try {
            File dir = ensureDir();
            if (dir == null) return;
            // 【R9 2026-09-21】日志轮转·保留天数：顺带清理 7 天前的旧日志（磁盘防膨胀）
            try { purgeOld(7); } catch (Throwable t) { /* 清理失败不影响写入 */ }
            File f = new File(dir, prefix + "-" + today() + ".log");
            // 限大小：超限则截断重写（保留最近一半左右，避免多次触发）
            try {
                if (f.exists() && f.length() > MAX_BYTES) {
                    truncateTail(f, MAX_BYTES / 2);
                }
            } catch (Throwable t) { /* 截断失败：继续追加（下次再试） */ }
            fos = new FileOutputStream(f, true);
            fos.write((text == null ? "" : text).getBytes("UTF-8"));
        } catch (Throwable t) {
            try { Log.w(TAG, "write failed: " + t); } catch (Throwable ignore) { }
        } finally {
            if (fos != null) { try { fos.close(); } catch (Throwable ignore) { } }
        }
    }

    /** 把文件截断为保留最尾部 keep 个字节（用于限大小）。 */
    private static void truncateTail(File f, long keep) throws IOException {
        byte[] all = new byte[(int) Math.min(f.length(), Integer.MAX_VALUE)];
        java.io.FileInputStream in = null;
        try {
            in = new java.io.FileInputStream(f);
            int off = 0, n;
            while (off < all.length && (n = in.read(all, off, all.length - off)) > 0) off += n;
        } finally {
            if (in != null) { try { in.close(); } catch (Throwable ignore) { } }
        }
        int start = (int) Math.max(0, all.length - keep);
        FileOutputStream out = null;
        try {
            out = new FileOutputStream(f, false);
            out.write(all, start, all.length - start);
        } finally {
            if (out != null) { try { out.close(); } catch (Throwable ignore) { } }
        }
    }

    /** 返回日志目录的绝对路径（供导出提示），不可用时返回 null。 */
    static String dirPath() {
        File d = ensureDir();
        return d == null ? null : d.getAbsolutePath();
    }

    /** 【R9 2026-09-21】日志轮转·保留天数：删除 lastModified 早于 days 天的 .log 文件。 */
    static void purgeOld(int days) {
        try {
            File dir = ensureDir();
            if (dir == null || days <= 0) return;
            long cutoff = System.currentTimeMillis() - days * 86400000L;
            File[] files = dir.listFiles();
            if (files == null) return;
            for (File f : files) {
                if (f == null || !f.getName().endsWith(".log")) continue;
                if (f.lastModified() < cutoff) { try { f.delete(); } catch (Throwable t) { /* 静默 */ } }
            }
        } catch (Throwable t) { /* 静默 */ }
    }

    /** 【R9 2026-09-21】读取全部 .log 的合并尾部（文件名倒序=新文件在前），最多 maxBytes 字节。
     *  供 日志.html 的「设备日志」页签（MainActivity.readLogs 桥）。全程 try/catch，失败返回空串。 */
    static String readTail(int maxBytes) {
        StringBuilder sb = new StringBuilder();
        try {
            File dir = ensureDir();
            if (dir == null || maxBytes <= 0) return "";
            File[] files = dir.listFiles();
            if (files == null || files.length == 0) return "";
            java.util.Arrays.sort(files, new java.util.Comparator<File>() {
                @Override public int compare(File a, File b) { return b.getName().compareTo(a.getName()); }
            });
            int budget = maxBytes;
            for (File f : files) {
                if (budget <= 0) break;
                if (f == null || !f.getName().endsWith(".log") || !f.isFile()) continue;
                try {
                    long len = f.length();
                    int want = (int) Math.min(len, budget);
                    if (want <= 0) continue;
                    byte[] buf = new byte[want];
                    java.io.FileInputStream in = new java.io.FileInputStream(f);
                    int off = 0, n;
                    while (off < want && (n = in.read(buf, off, want - off)) > 0) off += n;
                    in.close();
                    String s = new String(buf, 0, off, "UTF-8");
                    if (off < len) { // 只取到尾部时掐掉开头残行
                        int nl = s.indexOf('\n');
                        if (nl >= 0) s = s.substring(nl + 1);
                    }
                    sb.append("---- ").append(f.getName()).append(" ----\n").append(s);
                    budget -= off;
                } catch (Throwable t) { /* 单文件失败跳过 */ }
            }
        } catch (Throwable t) { /* 静默 */ }
        return sb.toString();
    }
}
