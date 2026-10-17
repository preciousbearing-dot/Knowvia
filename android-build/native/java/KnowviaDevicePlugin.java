package app.knowvia.study;

import android.app.ActivityManager;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.StatFs;
import android.view.WindowManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Knowvia's on-device tutor: device check, model files (download that resumes), and the llama.cpp engine.
 * JS name: KnowviaDevice.
 */
@CapacitorPlugin(name = "KnowviaDevice")
public class KnowviaDevicePlugin extends Plugin {
    private final ExecutorService engineExec = Executors.newSingleThreadExecutor();
    private final Set<String> cancelled = ConcurrentHashMap.newKeySet();
    private volatile String currentRid = "";
    private volatile String loadedFile = "";
    private boolean engineInited = false;
    private DownloadTask dl = null;

    static boolean TEST_ALLOW_HTTP = false;   // only ever set by the host-side test

    private File modelsDir() {
        File d = new File(getContext().getFilesDir(), "models");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static String safeName(String f) {
        if (f == null || !f.matches("[A-Za-z0-9._-]+\\.gguf")) return null;
        return f;
    }

    /* ---------------- Device check ---------------- */

    @PluginMethod
    public void specs(PluginCall call) {
        JSObject o = new JSObject();
        try {
            ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
            am.getMemoryInfo(mi);
            o.put("ramGb", round1(mi.totalMem / 1073741824.0));
            o.put("ramFreeGb", round1(mi.availMem / 1073741824.0));
        } catch (Throwable t) { /* leave unknown */ }
        try {
            File dir = getContext().getFilesDir();
            StatFs sf = new StatFs(dir.getAbsolutePath());
            o.put("diskFreeGb", round1(sf.getAvailableBytes() / 1073741824.0));
            o.put("diskTotalGb", round1(sf.getTotalBytes() / 1073741824.0));
        } catch (Throwable t) { /* leave unknown */ }
        o.put("cores", Runtime.getRuntime().availableProcessors());
        String abi = Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "";
        o.put("abi", abi);
        o.put("supported", "arm64-v8a".equals(abi));
        String soc = "";
        if (Build.VERSION.SDK_INT >= 31) soc = Build.SOC_MODEL == null ? "" : Build.SOC_MODEL;
        if (soc.isEmpty() || "unknown".equalsIgnoreCase(soc)) soc = Build.HARDWARE == null ? "" : Build.HARDWARE;
        o.put("cpu", soc);
        o.put("device", (Build.MANUFACTURER + " " + Build.MODEL).trim());
        o.put("android", Build.VERSION.RELEASE);
        call.resolve(o);
    }

    private static double round1(double v) { return Math.round(v * 10.0) / 10.0; }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        try {
            getActivity().runOnUiThread(() -> {
                if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        } catch (Throwable t) { /* ignore */ }
        call.resolve();
    }

    /* ---------------- Model files ---------------- */

    @PluginMethod
    public void models(PluginCall call) {
        JSArray arr = new JSArray();
        File[] fs = modelsDir().listFiles();
        if (fs != null) for (File f : fs) {
            if (f.isFile() && f.getName().endsWith(".gguf")) {
                JSObject o = new JSObject();
                o.put("file", f.getName());
                o.put("bytes", f.length());
                arr.put(o);
            }
        }
        JSObject r = new JSObject();
        r.put("models", arr);
        r.put("loaded", loadedFile);
        call.resolve(r);
    }

    @PluginMethod
    public void deleteModel(PluginCall call) {
        String f = safeName(call.getString("file"));
        if (f == null) { call.reject("That model name is not valid."); return; }
        if (f.equals(loadedFile)) {
            try { KvLlama.nativeStop(); } catch (Throwable t) { /* engine not available */ }
            engineExec.execute(() -> { try { KvLlama.nativeUnload(); } catch (Throwable t) { /* ignore */ } loadedFile = ""; });
        }
        File mf = new File(modelsDir(), f);
        boolean ok = !mf.exists() || mf.delete();
        new File(modelsDir(), f + ".part").delete();
        if (!ok) { call.reject("The model could not be removed."); return; }
        models(call);
    }

    /* ---------------- Download (resumes, waits for internet) ---------------- */

    @PluginMethod
    public void download(PluginCall call) {
        String file = safeName(call.getString("file"));
        String url = call.getString("url");
        long bytes = call.getData().optLong("bytes", 0);
        String id = call.getString("id", "");
        if (file == null || url == null || !url.startsWith("https://")) { call.reject("That download link is not valid."); return; }
        synchronized (this) {
            if (dl != null && dl.isActive()) {
                if (dl.file.equals(file)) { call.resolve(dl.status()); return; }
                call.reject("Another model is already downloading. Pause or cancel it first.");
                return;
            }
            dl = new DownloadTask(id, file, url, bytes);
            new Thread(dl, "kv-download").start();
        }
        call.resolve(dl.status());
    }

    @PluginMethod
    public void pauseDownload(PluginCall call) {
        DownloadTask d = dl;
        if (d != null) d.pause();
        call.resolve(d == null ? idleStatus() : d.status());
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        DownloadTask d = dl;
        if (d != null) d.cancel();
        else new File(modelsDir(), safeName(call.getString("file", "x.gguf")) + ".part").delete();
        call.resolve(idleStatus());
    }

    @PluginMethod
    public void downloadStatus(PluginCall call) {
        DownloadTask d = dl;
        call.resolve(d == null ? idleStatus() : d.status());
    }

    private JSObject idleStatus() {
        JSObject o = new JSObject();
        o.put("state", "idle");
        o.put("pct", 0);
        return o;
    }

    private boolean online() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            Network n = cm.getActiveNetwork();
            if (n == null) return false;
            NetworkCapabilities c = cm.getNetworkCapabilities(n);
            return c != null && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Throwable t) {
            return true;
        }
    }

    private class DownloadTask implements Runnable {
        final String id, file, url;
        final long expected;
        volatile boolean pauseReq = false, cancelReq = false;
        volatile String state = "running";   // running | waiting | paused | error | done | idle
        volatile String error = "";
        volatile long done = 0, total = 0;
        volatile double speed = 0;           // bytes per second
        volatile int tries = 0;

        DownloadTask(String id, String file, String url, long expected) {
            this.id = id; this.file = file; this.url = url; this.expected = expected; this.total = expected;
        }
        boolean isActive() { return state.equals("running") || state.equals("waiting"); }
        void pause() { pauseReq = true; }
        void cancel() { cancelReq = true; pauseReq = true; }

        JSObject status() {
            JSObject o = new JSObject();
            o.put("id", id);
            o.put("file", file);
            o.put("state", state);
            o.put("error", error);
            o.put("done", done);
            o.put("total", total);
            o.put("pct", total > 0 ? (int) Math.min(100, done * 100 / total) : 0);
            o.put("speed", Math.round(speed / 104857.6) / 10.0);   // MB/s
            o.put("eta", speed > 1000 && total > done ? (long) ((total - done) / speed) : 0);
            return o;
        }
        void emit() { try { notifyListeners("download", status()); } catch (Throwable t) { /* ignore */ } }

        @Override public void run() {
            File part = new File(modelsDir(), file + ".part");
            File fin = new File(modelsDir(), file);
            long deadline = System.currentTimeMillis() + 3L * 3600 * 1000;
            emit();
            while (true) {
                try {
                    state = "running"; error = ""; emit();
                    fetch(part);
                    if (cancelReq) { part.delete(); state = "idle"; done = 0; emit(); return; }
                    if (pauseReq) { state = "paused"; speed = 0; emit(); return; }
                    // finished: check size and the GGUF header before trusting it
                    if (total > 0 && part.length() != total) throw new IOException("size mismatch");
                    if (!hasGgufMagic(part)) { part.delete(); done = 0; fail("The downloaded file is not a valid model. Press Try again."); return; }
                    if (fin.exists()) fin.delete();
                    if (!part.renameTo(fin)) { fail("The model could not be saved on this phone."); return; }
                    state = "done"; speed = 0; done = fin.length(); total = done; emit();
                    return;
                } catch (StopException e) {
                    if (cancelReq) { part.delete(); state = "idle"; done = 0; } else state = "paused";
                    speed = 0; emit(); return;
                } catch (FatalException e) {
                    fail(e.getMessage()); return;
                } catch (IOException e) {
                    if (cancelReq) { part.delete(); state = "idle"; done = 0; emit(); return; }
                    if (pauseReq) { state = "paused"; speed = 0; emit(); return; }
                    String m = String.valueOf(e.getMessage());
                    if (m.contains("ENOSPC") || m.toLowerCase().contains("no space")) { fail("There is no free space left on this phone. Free some space, then press Resume. What was downloaded is kept."); return; }
                    tries++;
                    state = "waiting"; speed = 0; emit();
                    // wait for the internet to come back, then continue from where we stopped
                    int waited = 0;
                    while (!pauseReq && !cancelReq && (!online() || waited < 3)) {
                        try { Thread.sleep(1500); } catch (InterruptedException ie) { return; }
                        waited++;
                        if (System.currentTimeMillis() > deadline) { fail("The internet did not come back in time. Press Resume when you are online. What was downloaded is kept."); return; }
                    }
                    if (cancelReq) { part.delete(); state = "idle"; done = 0; emit(); return; }
                    if (pauseReq) { state = "paused"; emit(); return; }
                    if (tries > 60) { fail("The download keeps stopping. Check your connection, then press Resume. What was downloaded is kept."); return; }
                }
            }
        }

        void fail(String msg) { state = "error"; error = msg; speed = 0; emit(); }

        void fetch(File part) throws IOException, StopException, FatalException {
            long have = part.exists() ? part.length() : 0;
            String cur = url;
            HttpURLConnection c = null;
            for (int hop = 0; hop < 6; hop++) {
                c = (HttpURLConnection) new URL(cur).openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                c.setRequestProperty("User-Agent", "Knowvia-Android");
                if (have > 0) c.setRequestProperty("Range", "bytes=" + have + "-");
                int code = c.getResponseCode();
                if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                    String loc = c.getHeaderField("Location");
                    c.disconnect();
                    if (loc == null) throw new IOException("bad redirect");
                    cur = new URL(new URL(cur), loc).toString();
                    if (!cur.startsWith("https://") && !TEST_ALLOW_HTTP) throw new FatalException("The download link redirected to an unsafe address.");
                    continue;
                }
                break;
            }
            int code = c.getResponseCode();
            if (code == 416) {   // we already have everything (or the partial file is wrong)
                long len = parseTotal(c.getHeaderField("Content-Range"), -1);
                if (len > 0 && len == have) { total = len; done = have; c.disconnect(); return; }
                part.delete(); c.disconnect(); done = 0;
                throw new IOException("restart");
            }
            if (code == 404) throw new FatalException("This model could not be found at its official source. Try another model.");
            if (code == 401 || code == 403) throw new FatalException("The model's source refused the download (HTTP " + code + "). Try another model.");
            if (code != 200 && code != 206) throw new IOException("HTTP " + code);
            long len = c.getContentLengthLong();
            boolean resumed = code == 206;
            if (!resumed && have > 0) { have = 0; part.delete(); }
            long tot = resumed ? parseTotal(c.getHeaderField("Content-Range"), have + Math.max(len, 0)) : len;
            if (tot > 0) total = tot;
            if (total <= 0) total = expected;
            // storage check before writing a lot of data
            long need = total - have;
            try {
                StatFs sf = new StatFs(modelsDir().getAbsolutePath());
                if (need > 0 && sf.getAvailableBytes() < need + 64L * 1048576)
                    throw new FatalException("Not enough free space: this model needs about " + String.format("%.1f", need / 1073741824.0) + " GB more and the phone has " + String.format("%.1f", sf.getAvailableBytes() / 1073741824.0) + " GB free. Free some space, then press Resume.");
            } catch (IllegalArgumentException ignore) { /* unknown filesystem: carry on */ }
            done = have;
            try (InputStream in = c.getInputStream(); RandomAccessFile out = new RandomAccessFile(part, "rw")) {
                out.seek(have);
                byte[] buf = new byte[65536];
                long lastEmit = 0, lastT = System.currentTimeMillis(), lastBytes = done;
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    done += n;
                    long now = System.currentTimeMillis();
                    if (now - lastT >= 1000) {
                        double inst = (done - lastBytes) * 1000.0 / (now - lastT);
                        speed = speed == 0 ? inst : speed * 0.7 + inst * 0.3;
                        lastT = now; lastBytes = done;
                    }
                    if (now - lastEmit > 500) { lastEmit = now; emit(); }
                    if (pauseReq || cancelReq) throw new StopException();
                }
            } finally {
                c.disconnect();
            }
        }
    }

    private static long parseTotal(String contentRange, long dflt) {
        if (contentRange == null) return dflt;
        int i = contentRange.lastIndexOf('/');
        if (i < 0) return dflt;
        try { return Long.parseLong(contentRange.substring(i + 1).trim()); } catch (NumberFormatException e) { return dflt; }
    }

    private static boolean hasGgufMagic(File f) {
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] b = new byte[4];
            return in.read(b) == 4 && b[0] == 'G' && b[1] == 'G' && b[2] == 'U' && b[3] == 'F';
        } catch (IOException e) { return false; }
    }

    private static class StopException extends Exception {}
    private static class FatalException extends Exception { FatalException(String m) { super(m); } }

    /* ---------------- Engine ---------------- */

    @PluginMethod
    public void load(PluginCall call) {
        final String file = safeName(call.getString("file"));
        final int nCtx = call.getInt("nCtx", 4096);
        if (file == null) { call.reject("That model name is not valid."); return; }
        final File mf = new File(modelsDir(), file);
        if (!mf.exists()) { call.reject("This model is not downloaded yet."); return; }
        engineExec.execute(() -> {
            try {
                if (!engineInited) {
                    KvLlama.nativeInit(getContext().getApplicationInfo().nativeLibraryDir);
                    engineInited = true;
                }
                if (file.equals(loadedFile)) { JSObject r = new JSObject(); r.put("ok", true); r.put("info", KvLlama.nativeInfo()); call.resolve(r); return; }
                int cores = Runtime.getRuntime().availableProcessors();
                int threads = Math.max(2, Math.min(4, cores - 2));
                loadedFile = "";
                String err = KvLlama.nativeLoad(mf.getAbsolutePath(), nCtx, threads);
                if (!err.isEmpty()) { call.reject(err); return; }
                loadedFile = file;
                JSObject r = new JSObject();
                r.put("ok", true);
                r.put("info", KvLlama.nativeInfo());
                call.resolve(r);
            } catch (Throwable t) {
                call.reject("The on-device engine could not start: " + t.getMessage());
            }
        });
    }

    @PluginMethod
    public void unload(PluginCall call) {
        try { KvLlama.nativeStop(); } catch (Throwable t) { /* engine not available */ }
        engineExec.execute(() -> { try { KvLlama.nativeUnload(); } catch (Throwable t) { /* ignore */ } loadedFile = ""; call.resolve(); });
    }

    @PluginMethod
    public void generate(PluginCall call) {
        final String rid = call.getString("rid", "r" + System.nanoTime());
        final int maxTokens = call.getInt("maxTokens", 512);
        final float temp = call.getFloat("temperature", 0.4f);
        final JSArray msgs = call.getArray("messages");
        if (msgs == null || msgs.length() == 0) { call.reject("Nothing to answer."); return; }
        final int n = msgs.length();
        final String[] roles = new String[n], contents = new String[n];
        try {
            for (int i = 0; i < n; i++) {
                JSONObject m = msgs.getJSONObject(i);
                roles[i] = m.optString("role", "user");
                contents[i] = m.optString("content", "");
            }
        } catch (Exception e) { call.reject("The conversation could not be read."); return; }
        engineExec.execute(() -> {
            if (cancelled.remove(rid)) { call.reject("cancelled"); return; }
            if (loadedFile.isEmpty()) { call.reject("No model is loaded."); return; }
            currentRid = rid;
            try {
                String res = KvLlama.nativeGenerate(roles, contents, maxTokens, temp, bytes -> {
                    JSObject ev = new JSObject();
                    ev.put("rid", rid);
                    ev.put("text", new String(bytes, StandardCharsets.UTF_8));
                    notifyListeners("token", ev);
                    return !cancelled.contains(rid);
                });
                JSObject r = new JSObject(res);
                if (!r.optBoolean("ok", false)) { call.reject(r.optString("error", "The tutor could not answer.")); return; }
                call.resolve(r);
            } catch (Throwable t) {
                call.reject("The tutor stopped unexpectedly: " + t.getMessage());
            } finally {
                currentRid = "";
                cancelled.remove(rid);
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        String rid = call.getString("rid", "");
        if (!rid.isEmpty()) cancelled.add(rid);
        if (rid.isEmpty() || rid.equals(currentRid)) { try { KvLlama.nativeStop(); } catch (Throwable t) { /* ignore */ } }
        call.resolve();
    }

    @PluginMethod
    public void engineInfo(PluginCall call) {
        JSObject r = new JSObject();
        r.put("loaded", loadedFile);
        call.resolve(r);
    }
}
