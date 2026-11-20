package com.synow.lolche;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * 공략 노트 페이지(assets/www)를 띄우는 WebView.
 * 페이지는 https://lolche.local/ 에서 열린 것처럼 보이게 해서 fetch()가 그대로 동작하게 하고,
 * /proxy?u= 로 오는 요청은 앱이 대신 MetaTFT 등에 보내서 CORS를 피한다.
 */
final class Web {
    static final String HOST = "lolche.local";
    static final String HOME = "https://" + HOST + "/index.html";
    private static final int MAX_REDIRECTS = 5;
    private static final int MAX_TEXT_BYTES = 5 * 1024 * 1024;   // JSON/HTML/CSV 5MB 상한
    private static final int MAX_MEDIA_BYTES = 15 * 1024 * 1024; // 이미지/디시 15MB 상한

    private Web() {}

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    static WebView create(Context ctx, boolean overlay) {
        WebView web = new WebView(ctx);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setTextZoom(100);
        boolean night = (ctx.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        web.setBackgroundColor(Color.parseColor(night ? "#0d0f14" : "#f3f4f6"));
        web.setWebViewClient(new Client(ctx));
        web.addJavascriptInterface(new Bridge(ctx, web), "LolcheApp");
        web.loadUrl(HOME + (overlay ? "?overlay=1" : ""));
        return web;
    }

    static final class Client extends WebViewClient {
        private final Context ctx;

        Client(Context ctx) { this.ctx = ctx.getApplicationContext(); }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (HOST.equals(u.getHost())) return false;
            Intent i = new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { ctx.startActivity(i); } catch (Exception ignored) {}
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!HOST.equals(u.getHost())) return null;  // 구글 폰트 등은 그대로
            String path = u.getPath() == null ? "/" : u.getPath();
            if (path.equals("/proxy")) return proxy(u.getQueryParameter("u"));
            if (path.equals("/")) path = "/index.html";
            try {
                InputStream in = Updater.open(ctx, path);  // 받은 업데이트(files/www, assets)가 있으면 그걸, 없으면 앱에 든 것
                WebResourceResponse r = new WebResourceResponse(mime(path), "utf-8", in);
                Map<String, String> h = new HashMap<>();
                h.put("Cache-Control", "no-cache");
                r.setResponseHeaders(h);
                return r;
            } catch (IOException e) {
                return text(404, "Not Found", "없는 파일: " + path);
            }
        }
    }

    private static boolean isDcHost(String host) {
        return host.equals("m.dcinside.com") || host.equals("gall.dcinside.com")
                || host.endsWith(".dcinside.co.kr") || host.matches("dcimg\\d*\\.dcinside\\.com");
    }

    private static boolean isSheetHost(String host) {
        return host.equals("competetft.com") || host.equals("docs.google.com")
                || host.endsWith(".googleusercontent.com");
    }

    private static boolean isAllowedHost(String host) {
        return isSheetHost(host) || host.equals("metatft.com") || host.endsWith(".metatft.com")
                || host.endsWith(".apactft.com") || host.equals("tft.dakgg.io") || isDcHost(host);
    }

    /** MetaTFT, APAC 대회 사이트, 롤체지지 API, 디시 롤체갤 모바일 목록(실시간 탭)만 대신 받아준다. */
    static WebResourceResponse proxy(String target) {
        if (target == null) return text(400, "Bad Request", "u 없음");
        String current = target;
        HttpURLConnection c = null;
        try {
            for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
                Uri t = Uri.parse(current);
                String host = t.getHost() == null ? "" : t.getHost();
                if (!"https".equals(t.getScheme()) || !isAllowedHost(host)) {
                    return text(403, "Forbidden", "허용된 주소가 아니에요");
                }
                boolean dc = isDcHost(host);
                boolean sheet = isSheetHost(host);

                c = (HttpURLConnection) new URL(current).openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                c.setInstanceFollowRedirects(false);  // 리다이렉트 대상 호스트도 매 홉마다 화이트리스트 검사

                if (sheet) {
                    c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36");
                } else if (dc) {
                    c.setRequestProperty("User-Agent", host.equals("gall.dcinside.com")
                            ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
                            : "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36");
                    c.setRequestProperty("Referer", host.equals("gall.dcinside.com") ? "https://gall.dcinside.com/" : "https://m.dcinside.com/");
                    c.setUseCaches(false);
                } else {
                    c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) LolcheNote");
                    c.setRequestProperty("Origin", "https://www.metatft.com");
                    c.setRequestProperty("Referer", "https://www.metatft.com/");
                }

                int code = c.getResponseCode();
                // 리다이렉트는 모든 허용 호스트에서 따라가되, 다음 홉도 위에서 https·허용 목록을 다시 검사한다
                // (예전 setInstanceFollowRedirects(true) 동작 유지: MetaTFT·APAC 사이트·롤체지지·디시가 주소를 옮겨도 안 깨지게)
                if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                    String loc = c.getHeaderField("Location");
                    c.disconnect();
                    c = null;
                    if (loc == null || loc.isEmpty()) return text(502, "Bad Gateway", "빈 리다이렉트");
                    current = new URL(new URL(current), loc).toString();
                    continue;
                }

                int maxBytes = dc ? MAX_MEDIA_BYTES : MAX_TEXT_BYTES;
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                byte[] body = in == null ? new byte[0] : readAll(in, maxBytes);
                if (body == null) return text(413, "Payload Too Large", "응답 크기가 상한을 넘었어요");

                String type = host.endsWith("apactft.com") ? "text/html" : sheet ? "text/plain" : "application/json";
                if (dc) {
                    String ct = c.getContentType();
                    type = ct == null ? "text/html" : ct.split(";")[0].trim();
                    if (!host.equals("m.dcinside.com") && !host.equals("gall.dcinside.com")
                            && (type.equals("application/octet-stream") || type.isEmpty())) {
                        type = "image/jpeg";
                    }
                }
                return new WebResourceResponse(type, "utf-8", code,
                        code >= 400 ? "Error" : "OK", cors(), new ByteArrayInputStream(body));
            }
            return text(502, "Bad Gateway", "리다이렉트가 너무 많아요");
        } catch (IOException e) {
            return text(502, "Bad Gateway", "연결 실패: " + e.getMessage());
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static Map<String, String> cors() {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Cache-Control", "no-store");
        return h;
    }

    private static WebResourceResponse text(int code, String reason, String msg) {
        return new WebResourceResponse("text/plain", "utf-8", code, reason, cors(),
                new ByteArrayInputStream(msg.getBytes(StandardCharsets.UTF_8)));
    }

    private static byte[] readAll(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n, total = 0;
        try {
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > maxBytes) return null;
                out.write(buf, 0, n);
            }
        } finally {
            in.close();
        }
        return out.toByteArray();
    }

    private static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".webp")) return "image/webp";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        return "application/octet-stream";
    }
}
