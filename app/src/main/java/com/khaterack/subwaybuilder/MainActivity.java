
package com.khaterack.subwaybuilder;

import android.app.Activity;
import android.graphics.Color;
import android.view.View;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import java.io.OutputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import android.os.Bundle;
import android.os.Build;
import android.view.MotionEvent;
import android.util.Log;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final int REQUEST_SAVE_GAME = 4201;
    private static final int REQUEST_LOAD_GAME = 4202;
    private WebView webView;
    private String pendingGameSaveJson;

    private final class AndroidStorageBridge {
        @JavascriptInterface
        public void loadGameState() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/json", "application/octet-stream"});
                try { startActivityForResult(intent, REQUEST_LOAD_GAME); }
                catch (Exception error) { Log.e("SB_STORAGE", "Unable to open Android load picker", error); runLoadCallback(false, null); }
            });
        }

        @JavascriptInterface
        public void saveGameState(String json) {
            if (json == null || json.length() > 5000000) {
                runSaveCallback(false);
                return;
            }
            pendingGameSaveJson = json;
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, "subway-builder-save.json");
                try {
                    startActivityForResult(intent, REQUEST_SAVE_GAME);
                } catch (Exception error) {
                    Log.e("SB_STORAGE", "Unable to open Android save picker", error);
                    pendingGameSaveJson = null;
                    runSaveCallback(false);
                }
            });
        }
    }

    private void runLoadCallback(boolean success, String json) {
        runOnUiThread(() -> {
            if (webView != null) {
                String quoted = json == null ? "null" : JSONObject.quote(json);
                webView.evaluateJavascript("window.onDeviceGameLoadComplete(" + success + "," + quoted + ")", null);
            }
        });
    }

    private void runSaveCallback(boolean success) {
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript("window.onDeviceGameSaveComplete(" + success + ")", null);
            }
        });
    }

    private void applyImmersiveMode() {
        // Use the legacy immersive-sticky flags on every supported Android
        // version. This avoids the newer WindowInsetsController startup path.
        getWindow().setNavigationBarColor(Color.BLACK);
        getWindow().setStatusBarColor(Color.BLACK);
        View decor = getWindow().getDecorView();
        int flags = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
        decor.setSystemUiVisibility(flags);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        applyImmersiveMode();
        webView = new WebView(this);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        webView.setOnTouchListener((view, event) -> {
            Log.d("SB_WEBVIEW_TOUCH", MotionEvent.actionToString(event.getActionMasked()) + " x=" + event.getX() + " y=" + event.getY());
            return false;
        });
        webView.setBackgroundColor(0xFFE8EDF0);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        webView.addJavascriptInterface(new AndroidStorageBridge(), "AndroidStorage");
        settings.setLoadsImagesAutomatically(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
                Log.d("SB_WEBVIEW_CONSOLE", message.message() + " (" + message.sourceId() + ":" + message.lineNumber() + ")");
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient());

        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }


    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        Uri uri = data != null ? data.getData() : null;
        if (requestCode == REQUEST_SAVE_GAME) {
            boolean success = false;
            if (resultCode == RESULT_OK && uri != null && pendingGameSaveJson != null) {
                try (OutputStream output = getContentResolver().openOutputStream(uri, "w")) {
                    if (output == null) throw new IllegalStateException("Unable to open selected save location");
                    output.write(pendingGameSaveJson.getBytes(StandardCharsets.UTF_8)); output.flush(); success = true;
                } catch (Exception error) { Log.e("SB_STORAGE", "Could not write game save", error); }
            }
            pendingGameSaveJson = null; runSaveCallback(success); return;
        }
        if (requestCode == REQUEST_LOAD_GAME) {
            if (resultCode != RESULT_OK || uri == null) { runLoadCallback(false, null); return; }
            try (InputStream input = getContentResolver().openInputStream(uri); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                if (input == null) throw new IllegalStateException("Unable to open selected save file");
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > 5000000) throw new IllegalArgumentException("Save file exceeds 5 MB");
                    output.write(buffer, 0, count);
                }
                runLoadCallback(true, output.toString("UTF-8"));
            } catch (Exception error) { Log.e("SB_STORAGE", "Could not read game save", error); runLoadCallback(false, null); }
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersiveMode();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}