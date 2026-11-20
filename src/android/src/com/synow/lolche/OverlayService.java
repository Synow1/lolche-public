package com.synow.lolche;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
import android.util.TypedValue;
import android.view.ContextThemeWrapper;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * 게임 위에 떠있는 버튼과, 버튼을 누르면 펼쳐지는 공략 노트 창.
 * 창은 윗줄을 끌어서 옮기고, 왼쪽 아래 모서리를 끌어서 크기를 바꾼다. 위치·크기는 가로/세로 따로 기억한다.
 * 창이 열려 있어도 창 바깥 터치는 게임으로 간다 (FLAG_NOT_TOUCH_MODAL).
 * 접으면 창을 아예 떼어낸다: 숨긴 창이 남아 있으면 안드로이드 12+에서 그 자리의 게임 터치가 막힐 수 있다.
 */
public class OverlayService extends Service {
    static final String ACTION_HIDE = "hide";
    static final String ACTION_STOP = "stop";
    private static final String CHANNEL = "bubble";
    private static final float[] ALPHAS = {1f, 0.85f, 0.65f};
    private static final float[][] PRESETS = {{0.36f, 1f}, {0.46f, 1f}, {0.6f, 1f}};  // 가로 화면 너비·높이 비율

    private WindowManager wm;
    private SharedPreferences prefs;
    private ImageView bubble;
    private Panel panel;
    private WebView web;
    private String webLoaded = "";  // 떠있는 창이 띄운 페이지 버전 (앱이 업데이트를 받았으면 다음에 열 때 다시 띄움)
    private TextView alphaBtn;
    private WindowManager.LayoutParams bp, pp;
    private boolean open, attached;
    private int alphaIdx, preset = 1;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        startInForeground();
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        prefs = getSharedPreferences("overlay", MODE_PRIVATE);
        alphaIdx = prefs.getInt("alpha", 0);
        preset = prefs.getInt("preset", 1);
        buildPanel();
        createTrash();
        addBubble();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(a)) stopSelf();
        else if (ACTION_HIDE.equals(a)) setOpen(false);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (trash != null) wm.removeView(trash);
        if (bubble != null) wm.removeView(bubble);
        if (attached) wm.removeView(panel);
        if (web != null) web.destroy();
        super.onDestroy();
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        restorePanel();
        if (attached) wm.updateViewLayout(panel, pp);
        restoreBubble();
        wm.updateViewLayout(bubble, bp);
    }

    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    /** 지금 화면 크기 (상태바·내비 포함 전체). */
    @SuppressWarnings("deprecation")
    private Rect screen() {
        android.util.DisplayMetrics m = new android.util.DisplayMetrics();
        android.hardware.display.DisplayManager dm = (android.hardware.display.DisplayManager) getSystemService(DISPLAY_SERVICE);
        dm.getDisplay(android.view.Display.DEFAULT_DISPLAY).getRealMetrics(m);  // 회전이 반영된 실제 화면 크기
        return new Rect(0, 0, m.widthPixels, m.heightPixels);
    }

    private boolean landscape() { Rect s = screen(); return s.width() > s.height(); }

    private String key(String k) { return (landscape() ? "land_" : "port_") + k; }

    private static WindowManager.LayoutParams params(int w, int h, int flags) {
        WindowManager.LayoutParams p = new WindowManager.LayoutParams(w, h,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                flags | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        p.gravity = Gravity.TOP | Gravity.START;
        if (Build.VERSION.SDK_INT >= 28) p.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        return p;
    }

    // ---- 떠있는 버튼 ----

    private void addBubble() {
        bubble = new ImageView(this);
        bubble.setImageResource(R.drawable.bubble);
        bubble.setScaleType(ImageView.ScaleType.FIT_CENTER);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(Color.parseColor("#12151C"));
        bg.setStroke(dp(1.5f), Color.parseColor("#55F0B84A"));
        bubble.setBackground(bg);
        bubble.setClipToOutline(true);
        bubble.setPadding(dp(7), dp(7), dp(7), dp(7));
        bubble.setElevation(dp(6));
        bubble.setAlpha(0.8f);
        bubble.setContentDescription("롤체 노트 열기");
        bp = params(dp(48), dp(48), WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE);
        restoreBubble();
        bubble.setOnTouchListener(new Drag() {
            @Override void onStart() { start = new int[]{bp.x, bp.y}; bubble.setAlpha(1f); }
            @Override void onMove(int dx, int dy) {
                showTrash(true);
                bp.x = start[0] + dx; bp.y = start[1] + dy;
                boolean near = nearTrash();
                if (near != overTrash) {
                    overTrash = near;
                    trash.animate().scaleX(near ? 1.25f : 1f).scaleY(near ? 1.25f : 1f).setDuration(120).start();
                    trashBg.setColor(Color.parseColor(near ? "#e0c0392b" : "#cc1d2a22"));
                    if (near) bubble.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
                }
                if (near) {  // ✕ 위에서는 버튼이 ✕ 가운데로 빨려 들어간다
                    bp.x = tp.x + (tp.width - bp.width) / 2;
                    bp.y = tp.y + (tp.height - bp.height) / 2;
                }
                wm.updateViewLayout(bubble, bp);
            }
            @Override void onEnd(boolean moved) {
                boolean kill = moved && overTrash;
                showTrash(false);
                if (kill) {
                    android.widget.Toast.makeText(OverlayService.this, "버튼을 껐어요. 앱에서 다시 켤 수 있어요", android.widget.Toast.LENGTH_SHORT).show();
                    stopSelf();
                    return;
                }
                if (moved) snapBubble(); else setOpen(!open);
                bubble.setAlpha(open ? 1f : 0.8f);
            }
        });
        wm.addView(bubble, bp);
    }

    // ---- 끌면 아래 가운데에 뜨는 ✕: 여기에 놓으면 버튼이 꺼진다 ----

    private FrameLayout trash;
    private GradientDrawable trashBg;
    private WindowManager.LayoutParams tp;
    private boolean overTrash;

    /** ✕ 창은 한 번만 만들어 버튼 아래에 붙여둔다. 끄는 동안 다시 붙이면 끌기가 끊긴다. */
    private void createTrash() {
        trash = new FrameLayout(this);
        trashBg = new GradientDrawable();
        trashBg.setShape(GradientDrawable.OVAL);
        trashBg.setColor(Color.parseColor("#cc1d2a22"));
        trashBg.setStroke(dp(2), Color.WHITE);
        trash.setBackground(trashBg);
        TextView x = new TextView(this);
        x.setText("✕");
        x.setTextColor(Color.WHITE);
        x.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26);
        x.setGravity(Gravity.CENTER);
        trash.addView(x, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        tp = params(dp(68), dp(68), WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE);
        trash.setVisibility(View.GONE);
        wm.addView(trash, tp);
    }

    private void showTrash(boolean on) {
        boolean shown = trash.getVisibility() == View.VISIBLE;
        if (on && !shown) {
            Rect sc = screen();
            tp.x = (sc.width() - tp.width) / 2;
            tp.y = sc.height() - tp.height - dp(landscape() ? 24 : 72);
            wm.updateViewLayout(trash, tp);
            trash.setScaleX(1f); trash.setScaleY(1f);
            trashBg.setColor(Color.parseColor("#cc1d2a22"));
            trash.setAlpha(0f);
            trash.setVisibility(View.VISIBLE);
            trash.animate().alpha(1f).setDuration(150).start();
        } else if (!on && shown) {
            trash.setVisibility(View.GONE);
            overTrash = false;
        }
    }

    private boolean nearTrash() {
        if (tp == null) return false;
        float bx = bp.x + bp.width / 2f, by = bp.y + bp.height / 2f;
        float tx = tp.x + tp.width / 2f, ty = tp.y + tp.height / 2f;
        return Math.hypot(bx - tx, by - ty) < dp(64);
    }

    private void restoreBubble() {
        Rect s = screen();
        bp.x = prefs.getInt(key("bx"), 0);
        bp.y = prefs.getInt(key("by"), landscape() ? s.height() / 2 - dp(24) : dp(160));
        clampBubble();
    }

    private void clampBubble() {
        Rect s = screen();
        bp.x = Math.max(0, Math.min(bp.x, s.width() - dp(48)));
        bp.y = Math.max(0, Math.min(bp.y, s.height() - dp(48)));
    }

    /** 놓으면 가까운 왼쪽/오른쪽 가장자리에 붙인다. */
    private void snapBubble() {
        Rect s = screen();
        bp.x = bp.x + dp(24) < s.width() / 2 ? 0 : s.width() - dp(48);
        clampBubble();
        wm.updateViewLayout(bubble, bp);
        prefs.edit().putInt(key("bx"), bp.x).putInt(key("by"), bp.y).apply();
    }

    // ---- 펼쳐지는 창 ----

    /** 뒤로가기를 받아서 창을 접는다. */
    private final class Panel extends LinearLayout {
        Panel(Context c) { super(c); }

        @Override
        public boolean dispatchKeyEvent(KeyEvent e) {
            if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) {
                if (e.getAction() == KeyEvent.ACTION_UP) {
                    if (web != null && web.canGoBack()) web.goBack(); else setOpen(false);
                }
                return true;
            }
            return super.dispatchKeyEvent(e);
        }
    }

    private boolean night() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    private TextView barButton(String label, String desc, View.OnClickListener l) {
        TextView b = new TextView(this);
        b.setText(label);
        b.setContentDescription(desc);
        b.setTextColor(Color.parseColor("#f1e3c2"));
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(10), 0, dp(10), 0);
        b.setMinWidth(dp(38));
        b.setOnClickListener(l);
        return b;
    }

    private void buildPanel() {
        panel = new Panel(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(night() ? "#0d0f14" : "#f3f4f6"));
        bg.setCornerRadius(dp(12));
        bg.setStroke(dp(1), Color.parseColor("#33F0B84A"));
        panel.setBackground(bg);
        panel.setClipToOutline(true);
        panel.setElevation(dp(10));

        // 윗줄: 끌어서 옮기기 + 투명도·크기·접기
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setBackgroundColor(Color.parseColor("#12151C"));
        TextView grip = new TextView(this);
        grip.setText("⠿  롤체 노트");
        grip.setTextColor(Color.parseColor("#9aab9e"));
        grip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        grip.setGravity(Gravity.CENTER_VERTICAL);
        grip.setPadding(dp(12), 0, dp(6), 0);
        grip.setContentDescription("끌어서 창 옮기기");
        grip.setOnTouchListener(new Drag() {
            @Override void onStart() { start = new int[]{pp.x, pp.y}; }
            @Override void onMove(int dx, int dy) { pp.x = start[0] + dx; pp.y = start[1] + dy; clampPanel(); wm.updateViewLayout(panel, pp); }
            @Override void onEnd(boolean moved) { if (moved) savePanel(); }
        });
        bar.addView(grip, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f));
        alphaBtn = barButton("", "투명도 바꾸기", v -> { alphaIdx = (alphaIdx + 1) % ALPHAS.length; applyAlpha(); prefs.edit().putInt("alpha", alphaIdx).apply(); });
        bar.addView(alphaBtn, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT));
        bar.addView(barButton("크기", "크기 바꾸기 (작게·보통·크게)", v -> cyclePreset()),
                new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT));
        bar.addView(barButton("✕", "창 접기", v -> setOpen(false)),
                new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT));
        panel.addView(bar, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(34)));

        // 본문 + 왼쪽 아래 크기 손잡이
        FrameLayout body = new FrameLayout(this);
        web = Web.create(new ContextThemeWrapper(this, R.style.AppTheme), true);  // 다크 모드를 폰 설정에 맞춘다
        webLoaded = Updater.currentWeb(this);
        body.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        TextView handle = new TextView(this);
        handle.setText("◣");
        handle.setTextColor(Color.parseColor("#F0B84A"));
        handle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        handle.setGravity(Gravity.CENTER);
        handle.setContentDescription("끌어서 크기 바꾸기");
        handle.setOnTouchListener(new Drag() {
            @Override void onStart() { start = new int[]{pp.x, pp.width, pp.height}; }
            @Override void onMove(int dx, int dy) {
                Rect s = screen();
                int right = start[0] + start[1];
                int w = Math.max(dp(300), Math.min(start[1] - dx, s.width()));
                pp.width = w;
                pp.x = right - w;
                pp.height = Math.max(dp(220), Math.min(start[2] + dy, s.height()));
                clampPanel();
                wm.updateViewLayout(panel, pp);
            }
            @Override void onEnd(boolean moved) { if (moved) savePanel(); }
        });
        FrameLayout.LayoutParams hl = new FrameLayout.LayoutParams(dp(36), dp(36), Gravity.BOTTOM | Gravity.START);
        body.addView(handle, hl);
        panel.addView(body, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        pp = params(0, 0, WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL);
        pp.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
        restorePanel();
        applyAlpha();
    }

    /** 기억해둔 위치·크기. 없으면 가로는 오른쪽에 꽉 찬 높이, 세로는 아래쪽. */
    private void restorePanel() {
        Rect s = screen();
        if (prefs.contains(key("w"))) {
            pp.width = prefs.getInt(key("w"), 0);
            pp.height = prefs.getInt(key("h"), 0);
            pp.x = prefs.getInt(key("x"), 0);
            pp.y = prefs.getInt(key("y"), 0);
        } else {
            presetSize(s);
        }
        clampPanel();
    }

    private void presetSize(Rect s) {
        if (landscape()) {
            float[] p = PRESETS[preset];
            pp.width = Math.max(dp(320), Math.round(s.width() * p[0]));
            pp.height = Math.round(s.height() * p[1]) - dp(8);
            pp.x = s.width() - pp.width - dp(4);
            pp.y = dp(4);
        } else {
            pp.width = s.width() - dp(12);
            pp.height = Math.round(s.height() * (0.5f + 0.12f * preset));
            pp.x = dp(6);
            pp.y = s.height() - pp.height - dp(48);
        }
    }

    private void cyclePreset() {
        preset = (preset + 1) % PRESETS.length;
        presetSize(screen());
        clampPanel();
        wm.updateViewLayout(panel, pp);
        prefs.edit().putInt("preset", preset).apply();
        savePanel();
    }

    private void clampPanel() {
        Rect s = screen();
        pp.width = Math.min(pp.width, s.width());
        pp.height = Math.min(pp.height, s.height());
        pp.x = Math.max(0, Math.min(pp.x, s.width() - pp.width));
        pp.y = Math.max(0, Math.min(pp.y, s.height() - pp.height));
    }

    private void savePanel() {
        prefs.edit().putInt(key("w"), pp.width).putInt(key("h"), pp.height)
                .putInt(key("x"), pp.x).putInt(key("y"), pp.y).apply();
    }

    private void applyAlpha() {
        float a = ALPHAS[alphaIdx];
        pp.alpha = a;
        alphaBtn.setText(a >= 1f ? "투명" : "◐ " + Math.round(a * 100) + "%");
        if (attached) wm.updateViewLayout(panel, pp);
    }

    private void setOpen(boolean o) {
        open = o;
        if (o && web != null && !webLoaded.equals(Updater.currentWeb(this))) { webLoaded = Updater.currentWeb(this); web.reload(); }
        if (o && !attached) {
            restorePanel();
            wm.addView(panel, pp);
            attached = true;
            // ✕와 버튼이 창 위에 오게 다시 붙인다 (손을 뗀 뒤라 끌기에는 영향 없음)
            wm.removeView(trash);
            wm.addView(trash, tp);
            wm.removeView(bubble);
            wm.addView(bubble, bp);
            panel.requestFocus();
        } else if (!o && attached) {
            wm.removeView(panel);
            attached = false;
        }
        if (bubble != null) bubble.setAlpha(o ? 1f : 0.8f);
    }

    /** 끌기와 누르기를 구분하는 터치 처리. */
    private abstract class Drag implements View.OnTouchListener {
        final int slop = ViewConfiguration.get(OverlayService.this).getScaledTouchSlop();
        float downX, downY;
        boolean moved;
        int[] start;

        abstract void onStart();
        abstract void onMove(int dx, int dy);
        abstract void onEnd(boolean moved);

        @Override
        public boolean onTouch(View v, MotionEvent e) {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downX = e.getRawX(); downY = e.getRawY(); moved = false;
                    onStart();
                    return true;
                case MotionEvent.ACTION_MOVE:
                    float dx = e.getRawX() - downX, dy = e.getRawY() - downY;
                    if (!moved && Math.hypot(dx, dy) > slop) moved = true;
                    if (moved) onMove(Math.round(dx), Math.round(dy));
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    onEnd(moved);
                    return true;
                default:
                    return false;
            }
        }
    }

    // ---- 알림 (포그라운드 서비스) ----

    private void startInForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "떠있는 버튼", NotificationManager.IMPORTANCE_MIN));
        PendingIntent stop = PendingIntent.getService(this, 1,
                new Intent(this, OverlayService.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent openApp = PendingIntent.getActivity(this, 2,
                new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.notif)
                .setContentTitle("롤체 노트 버튼이 켜져 있어요")
                .setContentText("눌러서 앱 열기")
                .setContentIntent(openApp)
                .addAction(new Notification.Action.Builder(null, "버튼 끄기", stop).build())
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, n);
    }
}
