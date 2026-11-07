
package com.khaterack.subwaybuilder;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.view.MotionEvent;
import android.util.Log;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final int REQUEST_SAVE_GAME = 4201;
    private WebView webView;
    private String pendingGameSaveJson;

    private final class AndroidStorageBridge {
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

    private void runSaveCallback(boolean success) {
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript("window.onDeviceGameSaveComplete(" + success + ")", null);
            }
        });
    }

    private void configureSystemBars() {
        // Keep the game immersive: hide status and navigation bars on launch
        // and whenever the activity regains focus.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            android.view.WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(
                    android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
                controller.hide(android.view.WindowInsets.Type.systemBars());
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        configureSystemBars();

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
        webView.loadUrl("file:///android_asset/index.html?sbdebug=1");
    }


    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_SAVE_GAME) return;
        boolean success = false;
        Uri uri = data != null ? data.getData() : null;
        if (resultCode == RESULT_OK && uri != null && pendingGameSaveJson != null) {
            try (OutputStream output = getContentResolver().openOutputStream(uri, "w")) {
                if (output == null) throw new IllegalStateException("Unable to open selected save location");
                output.write(pendingGameSaveJson.getBytes(StandardCharsets.UTF_8));
                output.flush();
                success = true;
            } catch (Exception error) {
                Log.e("SB_STORAGE", "Could not write game save", error);
            }
        }
        pendingGameSaveJson = null;
        runSaveCallback(success);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            configureSystemBars();
        }
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