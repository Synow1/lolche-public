package com.synow.lolche;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

/** 페이지에서 window.LolcheApp 으로 부르는 것들. */
final class Bridge {
    private final Context ctx;
    private final android.app.Activity act;  // 앱 화면일 때만 (떠있는 창이면 null)
    private final android.webkit.WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());

    Bridge(Context ctx, android.webkit.WebView web) {
        this.ctx = ctx.getApplicationContext();
        this.act = ctx instanceof android.app.Activity ? (android.app.Activity) ctx : null;
        this.web = web;
    }

    /** 더보기의 '업데이트 확인' 버튼: 결과를 토스트로 알려준다. */
    @JavascriptInterface
    public void checkUpdate() {
        if (act == null) { main.post(() -> Toast.makeText(ctx, "앱 화면에서 눌러 주세요", Toast.LENGTH_SHORT).show()); return; }
        main.post(() -> Updater.check(act, web, true));
    }

    @JavascriptInterface
    public String webVersion() { return Updater.currentWeb(ctx); }

    @JavascriptInterface
    public String version() { return BuildInfo.VERSION; }

    @JavascriptInterface
    public String built() { return BuildInfo.BUILT; }

    @JavascriptInterface
    public boolean canOverlay() { return Settings.canDrawOverlays(ctx); }

    /** 떠있는 버튼 켜기. 권한이 없으면 설정 화면을 연다. */
    @JavascriptInterface
    public void startBubble() {
        main.post(() -> {
            if (!Settings.canDrawOverlays(ctx)) {
                Toast.makeText(ctx, "'다른 앱 위에 표시'를 켜고 돌아와서 다시 눌러주세요", Toast.LENGTH_LONG).show();
                Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + ctx.getPackageName()))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
                return;
            }
            ctx.startForegroundService(new Intent(ctx, OverlayService.class));
            Toast.makeText(ctx, "떠있는 버튼을 켰어요. 게임을 켜고 버튼을 누르세요", Toast.LENGTH_SHORT).show();
        });
    }

    @JavascriptInterface
    public void stopBubble() {
        main.post(() -> ctx.stopService(new Intent(ctx, OverlayService.class)));
    }

    /** 클립보드에 복사 (팀 플래너 코드). 웹뷰의 navigator.clipboard는 떠있는 창에서 막힐 때가 있다. */
    @JavascriptInterface
    public void copy(String text) {
        main.post(() -> {
            ClipboardManager cm = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("TFT 팀 코드", text));
        });
    }

    /** 떠있는 창 접기 (페이지의 '접기' 버튼). */
    @JavascriptInterface
    public void hidePanel() {
        main.post(() -> ctx.startService(new Intent(ctx, OverlayService.class).setAction(OverlayService.ACTION_HIDE)));
    }
}
