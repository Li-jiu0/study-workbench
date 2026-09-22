package com.study.workbench;

/**
 * WGS-84 → GCJ-02（国测局火星坐标）转换。
 *
 * 为什么需要：安卓 LocationManager（GPS / 网络）返回 WGS-84 原始坐标，
 * 而本 App 的底图（腾讯 GCJ-02 瓦片）与导航（高德 coordinate=gaode）都按 GCJ-02 解释，
 * 不转换会在国内产生几十~几百米的系统性固定偏移。
 * 🔴 口径：只在【采集端】转一次（LocationShareService.onLocationChanged），
 *    服务端与所有渲染端一律按 GCJ-02 处理，**绝不在下游再转**（防双重偏移）。
 * 🔴 本文件的三个魔法常量（6378245.0 / 0.00669342162296594323 / 境外包围盒）必须与
 *    assets 侧 live-location.html 的 wgs84ToGcj02、server/routers/liveloc.py 的实现保持一致；
 *    回归脚本 tools/_r149_coord_equiv.py 会抽取三端实现在同一批测试点上比对输出。
 * 纯静态、无 Android 依赖（可脱离 Android SDK 单独 javac + java 运行，便于单测）。
 */
public final class CoordTransform {

    /** 克拉索夫斯基椭球长半轴（米）。 */
    private static final double A = 6378245.0;
    /** 椭球偏心率平方。 */
    private static final double EE = 0.00669342162296594323;

    private CoordTransform() { }

    /** 是否在中国大陆经纬度范围之外（技术包围盒常量；境外不做偏移）。 */
    public static boolean outOfChina(double lat, double lng) {
        return (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271);
    }

    /** 返回 {lat, lng} 的 GCJ-02 坐标；境外或非法输入原样返回；绝不抛异常。 */
    public static double[] wgs84ToGcj02(double lat, double lng) {
        try {
            // 非法（NaN / ±Inf）输入原样返回，绝不因坐标异常而中断定位流。
            if (!isFinite(lat) || !isFinite(lng)) return new double[] { lat, lng };
            // 境外不做偏移（技术包围盒）。
            if (outOfChina(lat, lng)) return new double[] { lat, lng };
            double dLat = transformLat(lng - 105.0, lat - 35.0);
            double dLng = transformLng(lng - 105.0, lat - 35.0);
            double radLat = lat / 180.0 * Math.PI;
            double magic = Math.sin(radLat);
            magic = 1 - EE * magic * magic;
            double sqrtMagic = Math.sqrt(magic);
            dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * Math.PI);
            dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * Math.PI);
            return new double[] { lat + dLat, lng + dLng };
        } catch (Throwable e) {
            // 任何异常都原样返回入参：定位绝不能因为这个转不动而断流。
            return new double[] { lat, lng };
        }
    }

    private static double transformLat(double x, double y) {
        double r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y
                + 0.2 * Math.sqrt(Math.abs(x));
        r += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
        r += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
        r += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320.0 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
        return r;
    }

    private static double transformLng(double x, double y) {
        double r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y
                + 0.1 * Math.sqrt(Math.abs(x));
        r += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
        r += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
        r += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
        return r;
    }

    /** 有限数判定（避免依赖较新的 Double.isFinite，保持 Java 8 最小面）。 */
    private static boolean isFinite(double v) {
        return !Double.isNaN(v) && !Double.isInfinite(v);
    }
}
