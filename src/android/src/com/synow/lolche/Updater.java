package com.synow.lolche;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * 앱을 켤 때 공개 레포(Synow1/lolche-public)의 manifest.json을 보고 업데이트한다.
 * - 일일 페이지·데이터(web)가 바뀌었으면 경량 data.zip(~0.5MB)만 받아 files/www-<web>에 적용.
 * - 정적 자산(assets: 아이콘·폰트·이미지·oldsets) 해시가 바뀔 때만 assets.zip(~3.1MB)을 받아 files/assets-<hash>에 적용.
 * - 구버전 manifest(data 키 없음)는 기존 www.zip으로 폴백.
 * - 앱 코드(native)가 바뀌었으면 APK를 받아 안드로이드 설치 확인 창을 띄운다.
 */
final class Updater {
    static final String BASE = "https://raw.githubusercontent.com/Synow1/lolche-public/main/";
    static final String ACTION_INSTALL = "com.synow.lolche.INSTALL";
    private static final String PREFS = "updater";
    private static final Object LOCK = new Object();
    private static final int MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;  // 50MB 상한

    private Updater() {}

    /** 받은 일일 페이지·데이터 폴더. 버전마다 새 폴더(files/www-<web>)에 풀고 설정의 "dir"만 원자적으로 교체. */
    static File webDir(Context ctx) {
        String d = ctx.getSharedPreferences(PREFS, 0).getString("dir", "");
        if (!d.isEmpty()) {
            File f = new File(ctx.getFilesDir(), d);
            if (f.isDirectory()) return f;
        }
        return new File(ctx.getFilesDir(), "www");
    }

    /** 받은 정적 자산 폴더(files/assets-<hash>). 없으면 null. */
    static File assetsDir(Context ctx) {
        String d = ctx.getSharedPreferences(PREFS, 0).getString("assets_dir", "");
        if (!d.isEmpty()) {
            File f = new File(ctx.getFilesDir(), d);
            if (f.isDirectory()) return f;
        }
        return null;
    }

    /** 앱에 든 것보다 오래된 받은 파일은 지우고, 지금 쓰는 것 말고 남은 업데이트 폴더도 지운다 (앱을 켤 때). */
    static void dropStale(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, 0);
        String got = p.getString("web", "");
        if (got.compareTo(BuildInfo.WEB) < 0) {
            // 앱(APK)이 받은 것보다 새 버전이면 받아 둔 자산도 옛것이다 -> 앱에 든 것을 쓴다 (옛 아이콘이 새 APK를 가리지 않게)
            p.edit().putString("web", "").putString("dir", "").putString("assets_hash", "").putString("assets_dir", "").commit();
        }
        String gotAssets = p.getString("assets_hash", "");
        if (!gotAssets.isEmpty() && gotAssets.equals(BuildInfo.ASSETS)) {
            p.edit().putString("assets_hash", "").putString("assets_dir", "").commit();
        }
        final File curWeb = got.compareTo(BuildInfo.WEB) < 0 ? null : webDir(ctx);
        final File curAssets = assetsDir(ctx);
        final File base = ctx.getFilesDir();
        new Thread(() -> {
            File[] kids = base.listFiles();
            if (kids == null) return;
            for (File k : kids) {
                String n = k.getName();
                if ((curWeb != null && k.equals(curWeb)) || (curAssets != null && k.equals(curAssets))) continue;
                boolean oldWeb = n.equals("www") || n.equals("www_new")
                        || (n.startsWith("www-") && (n.substring(4).compareTo(got) <= 0 || n.substring(4).compareTo(BuildInfo.WEB) <= 0));
                boolean oldAssets = n.startsWith("assets-");
                if (oldWeb || oldAssets) deleteTree(k);
            }
        }).start();
    }

    static String currentWeb(Context ctx) {
        String got = ctx.getSharedPreferences(PREFS, 0).getString("web", "");
        return got.compareTo(BuildInfo.WEB) > 0 ? got : BuildInfo.WEB;
    }

    static String currentAssets(Context ctx) {
        String got = ctx.getSharedPreferences(PREFS, 0).getString("assets_hash", "");
        return got.isEmpty() ? BuildInfo.ASSETS : got;
    }

    private static long lastCheck = 0;
    private static boolean started = false;

    /** 앱이 앞에 있는 동안 10분마다 확인. */
    static void startPolling(final Activity act, final WebView web, final android.os.Handler h) {
        h.postDelayed(new Runnable() {
            @Override public void run() {
                if (!act.isFinishing()) { check(act, web, false); h.postDelayed(this, 10 * 60 * 1000); }
            }
        }, 10 * 60 * 1000);
    }

    /** 앱이 다시 앞으로 올 때: 마지막 확인에서 3분 지났으면 확인. */
    static void checkIfDue(Activity act, WebView web) {
        if (System.currentTimeMillis() - lastCheck > 3 * 60 * 1000) check(act, web, false);
    }

    static void check(final Activity act, final WebView web) { check(act, web, false); }

    static void check(final Activity act, final WebView web, final boolean verbose) {
        lastCheck = System.currentTimeMillis();
        if (verbose) Toast.makeText(act, "업데이트 확인 중…", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            try {
                String base = BASE;
                try {
                    String sha = new String(get("https://api.github.com/repos/Synow1/lolche-public/commits/main", "application/vnd.github.sha"), "UTF-8").trim();
                    if (sha.matches("[0-9a-f]{40}")) base = "https://raw.githubusercontent.com/Synow1/lolche-public/" + sha + "/";
                } catch (Exception ignored) {}
                final String b = base;
                JSONObject m = new JSONObject(new String(get(b + "manifest.json?t=" + System.currentTimeMillis()), "UTF-8"));
                int nativeCode = m.optInt("native", 0);
                String webStamp = m.optString("web", "");
                String ver = m.optString("version", "");
                String assetsHash = m.optString("assets", "");
                String assetsZip = m.optString("assets_zip", "");
                String dataZip = m.optString("data", "");
                if (nativeCode > BuildInfo.NATIVE) act.runOnUiThread(() -> askInstall(act, ver, b + m.optString("apk", "lolche-note.apk")));
                boolean got = false;
                synchronized (LOCK) {
                    // 1) 정적 자산(아이콘·폰트·이미지·oldsets)은 해시가 바뀔 때만 받는다
                    if (!assetsHash.isEmpty() && !assetsZip.isEmpty() && !assetsHash.equals(currentAssets(act))) {
                        byte[] azip = get(b + assetsZip + "?t=" + assetsHash);
                        File adst = new File(act.getFilesDir(), "assets-" + assetsHash);
                        deleteTree(adst);
                        unzip(azip, adst);
                        act.getSharedPreferences(PREFS, 0).edit()
                                .putString("assets_dir", adst.getName())
                                .putString("assets_hash", assetsHash)
                                .commit();
                        got = true;
                    }
                    // 2) 일일 페이지·데이터는 data.zip(없으면 기존 www.zip)만 받는다
                    if (webStamp.compareTo(currentWeb(act)) > 0) {
                        String zipName = !dataZip.isEmpty() ? dataZip : m.optString("zip", "www.zip");
                        byte[] zip = get(b + zipName + "?t=" + webStamp);
                        File dst = new File(act.getFilesDir(), "www-" + webStamp);
                        deleteTree(dst);
                        unzip(zip, dst);
                        if (!new File(dst, "index.html").isFile()) throw new IOException("받은 파일에 페이지가 없어요");
                        act.getSharedPreferences(PREFS, 0).edit()
                                .putString("dir", dst.getName())
                                .putString("web", webStamp)
                                .commit();
                        got = true;
                    }
                }
                if (got) {
                    act.runOnUiThread(() -> {
                        if (verbose || !started) {
                            Toast.makeText(act, "롤체 노트 v" + ver + " 업데이트했어요", Toast.LENGTH_SHORT).show();
                            web.reload();
                        } else {
                            web.evaluateJavascript("window.lolcheUpdateReady ? window.lolcheUpdateReady(" + JSONObject.quote(ver) + ") : location.reload()", null);
                        }
                    });
                } else if (verbose && nativeCode <= BuildInfo.NATIVE) {
                    act.runOnUiThread(() -> Toast.makeText(act, "최신 버전이에요 (v" + ver + ")", Toast.LENGTH_SHORT).show());
                }
                started = true;
            } catch (Exception e) {
                started = true;
                if (verbose) act.runOnUiThread(() -> Toast.makeText(act, "확인 못 했어요: " + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        }).start();
    }

    private static void askInstall(final Activity act, String ver, final String apk) {
        new AlertDialog.Builder(act)
                .setTitle("롤체 노트 v" + ver)
                .setMessage("앱 기능이 바뀐 새 버전이 있어요. 받아서 설치할까요?")
                .setPositiveButton("설치", (d, w) -> {
                    if (Build.VERSION.SDK_INT >= 26 && !act.getPackageManager().canRequestPackageInstalls()) {
                        Toast.makeText(act, "'이 출처 허용'을 켜고 돌아와서 앱을 다시 열어 주세요", Toast.LENGTH_LONG).show();
                        act.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + act.getPackageName())));
                        return;
                    }
                    Toast.makeText(act, "받는 중…", Toast.LENGTH_SHORT).show();
                    new Thread(() -> {
                        try {
                            install(act, get(apk));
                        } catch (Exception e) {
                            act.runOnUiThread(() -> Toast.makeText(act, "업데이트 실패: " + e.getMessage(), Toast.LENGTH_LONG).show());
                        }
                    }).start();
                })
                .setNegativeButton("나중에", null)
                .show();
    }

    private static void install(Context ctx, byte[] apk) throws IOException {
        PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams sp = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        int id = pi.createSession(sp);
        PackageInstaller.Session s = pi.openSession(id);
        try (OutputStream out = s.openWrite("app", 0, apk.length)) {
            out.write(apk);
            s.fsync(out);
        }
        Intent i = new Intent(ctx, MainActivity.class).setAction(ACTION_INSTALL);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        PendingIntent p = PendingIntent.getActivity(ctx, 7, i, flags);
        s.commit(p.getIntentSender());
        s.close();
    }

    static void onInstallStatus(Activity act, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) act.startActivity(confirm);
        } else if (status != PackageInstaller.STATUS_SUCCESS) {
            String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            Toast.makeText(act, "설치 안 됨" + (msg != null ? ": " + msg : ""), Toast.LENGTH_LONG).show();
        }
    }

    private static byte[] get(String url) throws IOException { return get(url, null); }

    private static byte[] get(String url, String accept) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        if (accept != null) c.setRequestProperty("Accept", accept);
        c.setConnectTimeout(15000);
        c.setReadTimeout(60000);
        c.setRequestProperty("Cache-Control", "no-cache");
        try {
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n, total = 0;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > MAX_DOWNLOAD_BYTES) throw new IOException("파일이 너무 커요");
                out.write(buf, 0, n);
            }
            in.close();
            return out.toByteArray();
        } finally {
            c.disconnect();
        }
    }

    private static void unzip(byte[] zip, File dir) throws IOException {
        String root = dir.getCanonicalPath() + File.separator;
        try (ZipInputStream z = new ZipInputStream(new ByteArrayInputStream(zip))) {
            ZipEntry e;
            byte[] buf = new byte[65536];
            while ((e = z.getNextEntry()) != null) {
                File f = new File(dir, e.getName());
                if (!f.getCanonicalPath().startsWith(root)) continue;  // 압축 밖으로 나가는 경로는 무시
                if (e.isDirectory()) { f.mkdirs(); continue; }
                f.getParentFile().mkdirs();
                try (FileOutputStream out = new FileOutputStream(f)) {
                    int n;
                    while ((n = z.read(buf)) > 0) out.write(buf, 0, n);
                }
            }
        }
    }

    static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }

    /** 지정한 디렉터리 경계 안의 파일만 안전하게 연다 (경로 이탈 방지). */
    private static File resolveSafe(File dir, String rel) throws IOException {
        if (dir == null || !dir.isDirectory()) return null;
        String root = dir.getCanonicalPath() + File.separator;
        File f = new File(dir, rel);
        if (!f.getCanonicalPath().startsWith(root)) throw new IOException("잘못된 경로");
        return f.isFile() ? f : null;
    }

    static InputStream open(Context ctx, String path) throws IOException {
        String rel = path.startsWith("/") ? path.substring(1) : path;
        if (rel.isEmpty() || rel.contains("..") || rel.contains("\\")) throw new IOException("잘못된 경로");
        File f = resolveSafe(webDir(ctx), rel);
        if (f != null) return new FileInputStream(f);
        File af = resolveSafe(assetsDir(ctx), rel);
        if (af != null) return new FileInputStream(af);
        return ctx.getAssets().open("www/" + rel);
    }
}
