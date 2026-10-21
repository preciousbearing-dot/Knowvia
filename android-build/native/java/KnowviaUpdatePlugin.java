package app.knowvia.study;

import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Knowvia's app updater: downloads the newest app file and hands it to the Android installer.
 * Android always asks the person to confirm an install, and asks once to allow installing from Knowvia. JS name: KnowviaUpdate.
 */
@CapacitorPlugin(name = "KnowviaUpdate")
public class KnowviaUpdatePlugin extends Plugin {
    private volatile Task task = null;

    private File dir() {
        File d = new File(getContext().getCacheDir(), "update");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private File apk() { return new File(dir(), "Knowvia.apk"); }

    private boolean online() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            Network n = cm.getActiveNetwork();
            if (n == null) return false;
            NetworkCapabilities c = cm.getNetworkCapabilities(n);
            return c != null && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Throwable t) { return true; }
    }

    private JSObject idle() {
        JSObject o = new JSObject();
        o.put("state", apk().exists() && apk().length() > 1000000 ? "ready" : "idle");
        o.put("pct", 0);
        o.put("allowed", allowed());
        return o;
    }

    private boolean allowed() {
        try {
            return Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
        } catch (Throwable t) { return true; }
    }

    @PluginMethod
    public void status(PluginCall call) {
        Task t = task;
        call.resolve(t == null ? idle() : t.status());
    }

    /** Opens the Android screen where the person allows Knowvia to install updates. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Throwable t) { call.reject("Could not open the settings screen."); }
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url", "");
        long bytes = call.getLong("bytes", 0L);
        if (url == null || !url.startsWith("https://")) { call.reject("Bad address."); return; }
        synchronized (this) {
            Task t = task;
            if (t == null || !t.active()) {
                task = new Task(url, bytes);
                new Thread(task, "kv-update").start();
            }
        }
        call.resolve(task.status());
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Task t = task;
        if (t != null) t.cancelReq = true;
        File p = new File(dir(), "Knowvia.apk.part");
        if (t == null) { p.delete(); apk().delete(); }
        call.resolve(idle());
    }

    @PluginMethod
    public void install(PluginCall call) {
        try {
            File f = apk();
            if (!f.exists() || f.length() < 1000000) { call.reject("The update file is missing. Download it again."); return; }
            Uri u = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".kvupdate", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(u, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Throwable t) { call.reject("Android could not open the installer."); }
    }

    /** Removes the old update file once the new version is running. */
    @PluginMethod
    public void cleanup(PluginCall call) {
        if (task == null || !task.active()) { apk().delete(); new File(dir(), "Knowvia.apk.part").delete(); task = null; }
        call.resolve();
    }

    private class Task implements Runnable {
        final String url;
        volatile boolean cancelReq = false;
        volatile String state = "running";   // running | waiting | error | ready | idle
        volatile String error = "";
        volatile long done = 0, total = 0;
        volatile double speed = 0;

        Task(String url, long expected) { this.url = url; this.total = expected; }

        boolean active() { return state.equals("running") || state.equals("waiting"); }

        JSObject status() {
            JSObject o = new JSObject();
            o.put("state", state);
            o.put("done", done);
            o.put("total", total);
            o.put("pct", total > 0 ? Math.min(100, (int) (done * 100 / total)) : 0);
            o.put("speed", speed);
            o.put("error", error);
            o.put("allowed", allowed());
            return o;
        }

        @Override public void run() {
            File part = new File(dir(), "Knowvia.apk.part");
            apk().delete();
            for (int attempt = 0; attempt < 4 && !cancelReq; attempt++) {
                try {
                    while (!online() && !cancelReq) { state = "waiting"; Thread.sleep(1500); }
                    if (cancelReq) break;
                    state = "running"; error = ""; part.delete(); done = 0;
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(20000); c.setReadTimeout(30000);
                    c.setInstanceFollowRedirects(true);
                    c.setRequestProperty("User-Agent", "Knowvia-Updater");
                    int code = c.getResponseCode();
                    if (code >= 400) throw new Exception("The download server answered with error " + code + ".");
                    long len = c.getContentLengthLong();
                    if (len > 0) total = len;
                    long t0 = System.currentTimeMillis();
                    try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
                        byte[] buf = new byte[65536]; int n;
                        while ((n = in.read(buf)) > 0) {
                            if (cancelReq) break;
                            out.write(buf, 0, n); done += n;
                            long dt = System.currentTimeMillis() - t0;
                            if (dt > 500) speed = done * 1000.0 / dt;
                        }
                    }
                    if (cancelReq) break;
                    if (done < 1000000 || (total > 0 && done < total)) throw new Exception("The download stopped early.");
                    if (!part.renameTo(apk())) throw new Exception("Could not save the update file.");
                    state = "ready";
                    return;
                } catch (Throwable e) {
                    error = e.getMessage() == null ? "The download failed." : e.getMessage();
                    state = "error";
                    try { Thread.sleep(2000 * (attempt + 1)); } catch (InterruptedException ie) { break; }
                }
            }
            if (cancelReq) { part.delete(); state = "idle"; error = ""; }
        }
    }
}
