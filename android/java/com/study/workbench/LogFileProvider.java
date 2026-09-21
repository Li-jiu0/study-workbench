package com.study.workbench;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.Locale;

/**
 * 星途 · 崩溃/错误日志导出用极简 FileProvider（R3b-A / B3）
 * ---------------------------------------------------------------
 * 为什么自写而不用 androidx/support 的 FileProvider？
 *   本工程是零第三方依赖的纯系统 API 壳（无 androidx、无 support-v4），
 *   系统 android.* API 里没有 FileProvider 类 —— 故自写一个只做一件事的
 *   ContentProvider：把「应用专属外部目录下 logs/ 里的日志文件」以
 *   content:// 形式授权给系统分享 / 文本查看器读取。
 *
 * URI 约定：content://com.study.workbench.logfile/<文件名>
 *   Android 7+（N）直接对 file:// 跨进程读会抛 FileUriExposedException，
 *   分享日志必须走 content:// + FLAG_GRANT_READ_URI_PERMISSION。
 *
 * 安全约束（防目录穿越，见 resolveCheckedFile）：
 *   - 只接受纯文件名（拒绝包含 / \ .. 的路径段）
 *   - 规范化（canonical）后必须仍位于 getExternalFilesDir(null)/logs 目录内
 *   - 只开放 .log / .txt 扩展名
 *   - 目录不存在时视为越界（FileNotFound），绝不创建
 */
public class LogFileProvider extends ContentProvider {

    /** 与 AndroidManifest.xml 中 <provider android:authorities> 保持一致 */
    public static final String AUTHORITY = "com.study.workbench.logfile";

    /** 日志子目录名（相对 getExternalFilesDir(null)） */
    private static final String LOG_DIR_NAME = "logs";

    /** 把 logs/ 下的文件包装成本 provider 的 content:// URI（文件名做 URL 编码） */
    public static Uri uriFor(File file) {
        return Uri.parse("content://" + AUTHORITY + "/" + Uri.encode(file.getName()));
    }

    @Override
    public boolean onCreate() {
        return true; // 无需初始化（懒加载，openFile 时才解析路径）
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = resolveCheckedFile(uri);
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    /** 分享/查看器可能查询 DISPLAY_NAME / SIZE（OpenableColumns）；仅支持这两列，其余列返回 null */
    @Override
    public Cursor query(Uri uri, String[] projection, String selection,
                        String[] selectionArgs, String sortOrder) {
        try {
            File f = resolveCheckedFile(uri);
            String[] cols = (projection == null || projection.length == 0)
                    ? new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }
                    : projection;
            MatrixCursor cursor = new MatrixCursor(cols, 1);
            Object[] row = new Object[cols.length];
            for (int i = 0; i < cols.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) {
                    row[i] = f.getName();
                } else if (OpenableColumns.SIZE.equals(cols[i])) {
                    row[i] = f.length();
                } else {
                    row[i] = null;
                }
            }
            cursor.addRow(row);
            return cursor;
        } catch (FileNotFoundException e) {
            return null; // 文件不存在/非法：返回空 Cursor，调用方按无数据处理
        }
    }

    @Override
    public String getType(Uri uri) {
        return "text/plain";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException("只读 provider");
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("只读 provider");
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("只读 provider");
    }

    /** 解析并校验 uri 指向的文件：必须位于 logs/ 目录内且为 .log/.txt，否则拒绝（FileNotFoundException） */
    private File resolveCheckedFile(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || name.trim().isEmpty()) {
            throw new FileNotFoundException("空文件名: " + uri);
        }
        // 防路径穿越：不允许路径分隔符 / 上跳段，且必须 .log / .txt 结尾
        String lower = name.toLowerCase(Locale.US);
        if (name.contains("/") || name.contains("\\") || name.contains("..")
                || !(lower.endsWith(".log") || lower.endsWith(".txt"))) {
            throw new FileNotFoundException("非法文件名: " + name);
        }
        // 目录须由 Context 决定：本 provider 无上下文成员，用 getContext() 取
        android.content.Context ctx = getContext();
        if (ctx == null) throw new FileNotFoundException("无上下文");
        File base = ctx.getExternalFilesDir(null);
        if (base == null) throw new FileNotFoundException("外部目录不可用");
        File dir = new File(base, LOG_DIR_NAME);
        if (!dir.exists() || !dir.isDirectory()) {
            throw new FileNotFoundException("日志目录不存在: " + dir.getAbsolutePath());
        }
        File f = new File(dir, name);
        if (!f.exists() || !f.isFile()) {
            throw new FileNotFoundException("文件不存在: " + f.getAbsolutePath());
        }
        // 二次校验：规范化后必须仍在 logs 目录内（防符号链接等绕过）
        try {
            String canon = f.getCanonicalPath();
            String dirCanon = dir.getCanonicalPath() + File.separator;
            if (!canon.startsWith(dirCanon)) {
                throw new FileNotFoundException("越界路径: " + canon);
            }
        } catch (IOException e) {
            throw new FileNotFoundException("路径规范化失败: " + e.getMessage());
        }
        return f;
    }
}
