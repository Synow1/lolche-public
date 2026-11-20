package com.synow.lolche;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

public class MainActivity extends Activity {
    private WebView web;
    private final android.os.Handler poll = new android.os.Handler(android.os.Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Updater.dropStale(this);
        web = Web.create(this, false);
        setContentView(web);
        Updater.check(this, web);
        // 떠있는 버튼은 알림이 있어야 오래 살아있다. 거절해도 버튼은 동작한다.
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web == null) return;
        Updater.checkIfDue(this, web);  // 뒤로가기로 내렸다가 다시 열어도 확인
        poll.removeCallbacksAndMessages(null);
        Updater.startPolling(this, web, poll);  // 켜져 있는 동안 10분마다
    }

    @Override
    protected void onPause() {
        poll.removeCallbacksAndMessages(null);
        super.onPause();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (Updater.ACTION_INSTALL.equals(intent.getAction())) Updater.onInstallStatus(this, intent);
    }

    @Override
    public void onBackPressed() {
        // 페이지가 연 화면(전적·덱 상세·설명 창·탭 이동)을 하나씩 닫는다. 더 닫을 게 없으면 앱을 끄지 않고 뒤로 보낸다.
        if (web != null && web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
