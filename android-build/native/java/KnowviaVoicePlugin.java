package app.knowvia.study;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.StatFs;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;

import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Knowvia's on-device voice: downloads a small voice model (resumes, waits for internet), unpacks it,
 * and turns text into speech with the sherpa-onnx engine. JS name: KnowviaVoice.
 */
@CapacitorPlugin(name = "KnowviaVoice")
public class KnowviaVoicePlugin extends Plugin {
    private final ExecutorService speakExec = Executors.newSingleThreadExecutor();
    private volatile OfflineTts tts = null;
    private volatile String loadedId = "";
    private InstallTask task = null;

    private File voicesDir() {
        File d = new File(getContext().getFilesDir(), "voices");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static String safeId(String s) {
        return (s != null && s.matches("[A-Za-z0-9._-]{1,60}")) ? s : null;
    }

    /* ---------------- What is installed ---------------- */

    @PluginMethod
    public void status(PluginCall call) {
        JSArray arr = new JSArray();
        File[] fs = voicesDir().listFiles();
        if (fs != null) for (File f : fs) {
            if (f.isDirectory() && new File(f, ".ready").exists()) {
                JSObject o = new JSObject();
                o.put("id", f.getName());
                o.put("bytes", dirSize(f));
                arr.put(o);
            }
        }
        JSObject r = new JSObject();
        r.put("installed", arr);
        r.put("loaded", loadedId);
        r.put("engine", engineAvailable());
        call.resolve(r);
    }

    private boolean engineAvailable() {
        try { Class.forName("com.k2fsa.sherpa.onnx.OfflineTts"); return true; } catch (Throwable t) { return false; }
    }

    private static long dirSize(File d) {
        long n = 0;
        File[] fs = d.listFiles();
        if (fs != null) for (File f : fs) n += f.isDirectory() ? dirSize(f) : f.length();
        return n;
    }

    private static void deleteTree(File f) {
        File[] fs = f.listFiles();
        if (fs != null) for (File c : fs) deleteTree(c);
        f.delete();
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String id = safeId(call.getString("id"));
        if (id == null) { call.reject("That voice name is not valid."); return; }
        final String fid = id;
        speakExec.execute(() -> {
            if (fid.equals(loadedId)) { try { if (tts != null) tts.release(); } catch (Throwable t) { /* ignore */ } tts = null; loadedId = ""; }
            deleteTree(new File(voicesDir(), fid));
            new File(voicesDir(), fid + ".tar.bz2.part").delete();
            new File(voicesDir(), fid + ".tar.bz2").delete();
            deleteTree(new File(voicesDir(), fid + ".tmp"));
            status(call);
        });
    }

    /* ---------------- Install (download, then unpack) ---------------- */

    @PluginMethod
    public void install(PluginCall call) {
        String id = safeId(call.getString("id"));
        String url = call.getString("url");
        long bytes = call.getData().optLong("bytes", 0);
        JSArray req = call.getArray("require");
        if (id == null || url == null || !url.startsWith("https://")) { call.reject("That download link is not valid."); return; }
        String[] need = new String[req == null ? 0 : req.length()];
        try { for (int i = 0; i < need.length; i++) need[i] = req.getString(i); } catch (Exception e) { need = new String[0]; }
        synchronized (this) {
            if (task != null && task.isActive()) {
                if (task.id.equals(id)) { call.resolve(task.status()); return; }
                call.reject("Another voice is already being installed.");
                return;
            }
            task = new InstallTask(id, url, bytes, need);
            new Thread(task, "kv-voice-install").start();
        }
        call.resolve(task.status());
    }

    @PluginMethod
    public void pauseInstall(PluginCall call) {
        InstallTask t = task;
        if (t != null) t.pauseReq = true;
        call.resolve(t == null ? idle() : t.status());
    }

    @PluginMethod
    public void cancelInstall(PluginCall call) {
        InstallTask t = task;
        if (t != null) { t.cancelReq = true; t.pauseReq = true; }
        else {
            String id = safeId(call.getString("id", "x"));
            if (id != null) { new File(voicesDir(), id + ".tar.bz2.part").delete(); new File(voicesDir(), id + ".tar.bz2").delete(); }
        }
        call.resolve(idle());
    }

    @PluginMethod
    public void installStatus(PluginCall call) {
        InstallTask t = task;
        call.resolve(t == null ? idle() : t.status());
    }

    private JSObject idle() {
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
        } catch (Throwable t) { return true; }
    }

    private static class StopException extends Exception {}
    private static class FatalException extends Exception { FatalException(String m) { super(m); } }

    /** Counts the bytes read so unpacking can show a percentage. */
    private static class CountIn extends FilterInputStream {
        volatile long n = 0;
        CountIn(InputStream in) { super(in); }
        @Override public int read() throws IOException { int b = super.read(); if (b >= 0) n++; return b; }
        @Override public int read(byte[] b, int o, int l) throws IOException { int r = super.read(b, o, l); if (r > 0) n += r; return r; }
    }

    private class InstallTask implements Runnable {
        final String id, url;
        final String[] need;
        final long expected;
        volatile boolean pauseReq = false, cancelReq = false;
        volatile String state = "running";   // running | waiting | paused | unpacking | error | done | idle
        volatile String error = "";
        volatile long done = 0, total = 0;
        volatile double speed = 0;
        volatile int tries = 0, unpackPct = 0;

        InstallTask(String id, String url, long expected, String[] need) {
            this.id = id; this.url = url; this.expected = expected; this.total = expected; this.need = need;
        }
        boolean isActive() { return state.equals("running") || state.equals("waiting") || state.equals("unpacking"); }

        JSObject status() {
            JSObject o = new JSObject();
            o.put("id", id);
            o.put("state", state);
            o.put("error", error);
            o.put("done", done);
            o.put("total", total);
            int pct = state.equals("unpacking") ? 85 + unpackPct * 15 / 100 : (total > 0 ? (int) Math.min(85, done * 85 / total) : 0);
            if (state.equals("done")) pct = 100;
            o.put("pct", pct);
            o.put("speed", Math.round(speed / 104857.6) / 10.0);
            o.put("eta", speed > 1000 && total > done ? (long) ((total - done) / speed) : 0);
            return o;
        }
        void emit() { try { notifyListeners("voice", status()); } catch (Throwable t) { /* ignore */ } }
        void fail(String msg) { state = "error"; error = msg; speed = 0; emit(); }

        @Override public void run() {
            File part = new File(voicesDir(), id + ".tar.bz2.part");
            File arch = new File(voicesDir(), id + ".tar.bz2");
            long deadline = System.currentTimeMillis() + 3L * 3600 * 1000;
            emit();
            while (true) {
                try {
                    state = "running"; error = ""; emit();
                    if (!arch.exists()) {
                        fetch(part);
                        if (cancelReq) { part.delete(); state = "idle"; done = 0; emit(); return; }
                        if (pauseReq) { state = "paused"; speed = 0; emit(); return; }
                        if (total > 0 && part.length() != total) throw new IOException("size mismatch");
                        if (!part.renameTo(arch)) { fail("The voice could not be saved on this phone."); return; }
                    }
                    state = "unpacking"; unpackPct = 0; speed = 0; emit();
                    unpack(arch);
                    arch.delete();
                    state = "done"; done = total; emit();
                    return;
                } catch (StopException e) {
                    if (cancelReq) { part.delete(); arch.delete(); state = "idle"; done = 0; } else state = "paused";
                    speed = 0; emit(); return;
                } catch (FatalException e) {
                    fail(e.getMessage()); return;
                } catch (IOException e) {
                    if (cancelReq) { part.delete(); state = "idle"; done = 0; emit(); return; }
                    if (pauseReq) { state = "paused"; speed = 0; emit(); return; }
                    String m = String.valueOf(e.getMessage());
                    if (m.contains("ENOSPC") || m.toLowerCase().contains("no space")) { fail("There is no free space left on this phone. Free some space, then press Resume. What was downloaded is kept."); return; }
                    if (arch.exists() && state.equals("unpacking")) { fail("The voice could not be unpacked. Press Try again."); arch.delete(); return; }
                    tries++;
                    state = "waiting"; speed = 0; emit();
                    int waited = 0;
                    while (!pauseReq && !cancelReq && (!online() || waited < 3)) {
                        try { Thread.sleep(1500); } catch (InterruptedException ie) { return; }
                        waited++;
                        if (System.currentTimeMillis() > deadline) { fail("The internet did not come back in time. Press Resume when you are online. What was downloaded is kept."); return; }
                    }
                    if (cancelReq) { part.delete(); state = "idle"; done = 0; emit(); return; }
                    if (pauseReq) { state = "paused"; emit(); return; }
                    if (tries > 60) { fail("The download keeps stopping. Check your connection, then press Resume. What was downloaded is kept."); return; }
                } catch (Throwable t) {
                    fail("Something went wrong while installing the voice (" + t.getClass().getSimpleName() + "). Press Try again.");
                    return;
                }
            }
        }

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
                    if (!cur.startsWith("https://")) throw new FatalException("The download link redirected to an unsafe address.");
                    continue;
                }
                break;
            }
            int code = c.getResponseCode();
            if (code == 416) {
                long len = parseTotal(c.getHeaderField("Content-Range"), -1);
                if (len > 0 && len == have) { total = len; done = have; c.disconnect(); return; }
                part.delete(); c.disconnect(); done = 0;
                throw new IOException("restart");
            }
            if (code == 404) throw new FatalException("This voice could not be found at its official source.");
            if (code == 401 || code == 403) throw new FatalException("The voice's source refused the download (HTTP " + code + ").");
            if (code != 200 && code != 206) throw new IOException("HTTP " + code);
            long len = c.getContentLengthLong();
            boolean resumed = code == 206;
            if (!resumed && have > 0) { have = 0; part.delete(); }
            long tot = resumed ? parseTotal(c.getHeaderField("Content-Range"), have + Math.max(len, 0)) : len;
            if (tot > 0) total = tot;
            if (total <= 0) total = expected;
            long needBytes = (total - have) + total * 2;   // the file, then room to unpack it
            try {
                StatFs sf = new StatFs(voicesDir().getAbsolutePath());
                if (sf.getAvailableBytes() < needBytes)
                    throw new FatalException("Not enough free space: this voice needs about " + (needBytes / 1048576) + " MB and the phone has " + (sf.getAvailableBytes() / 1048576) + " MB free. Free some space, then press Resume.");
            } catch (IllegalArgumentException ignore) { /* unknown filesystem */ }
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

        void unpack(File arch) throws IOException, FatalException {
            File tmp = new File(voicesDir(), id + ".tmp");
            deleteTree(tmp);
            tmp.mkdirs();
            long size = Math.max(1, arch.length());
            String root = tmp.getCanonicalPath() + File.separator;
            try (CountIn cin = new CountIn(new BufferedInputStream(new FileInputStream(arch), 1 << 16));
                 BZip2CompressorInputStream bz = new BZip2CompressorInputStream(cin);
                 TarArchiveInputStream tar = new TarArchiveInputStream(bz)) {
                TarArchiveEntry e;
                byte[] buf = new byte[65536];
                long lastEmit = 0;
                while ((e = tar.getNextTarEntry()) != null) {
                    String name = e.getName();
                    int slash = name.indexOf('/');
                    if (slash < 0) { if (e.isDirectory()) continue; } else name = name.substring(slash + 1);   // drop the top folder
                    if (name.isEmpty()) continue;
                    File out = new File(tmp, name);
                    if (!out.getCanonicalPath().startsWith(root)) throw new FatalException("The voice file looks unsafe and was not installed.");
                    if (e.isDirectory()) { out.mkdirs(); continue; }
                    if (!e.isFile()) continue;
                    out.getParentFile().mkdirs();
                    try (FileOutputStream fo = new FileOutputStream(out)) {
                        int n;
                        while ((n = tar.read(buf)) > 0) fo.write(buf, 0, n);
                    }
                    long now = System.currentTimeMillis();
                    unpackPct = (int) Math.min(99, cin.n * 100 / size);
                    if (now - lastEmit > 400) { lastEmit = now; emit(); }
                }
            }
            for (String r : need) if (!new File(tmp, r).exists()) { deleteTree(tmp); throw new FatalException("The voice package is missing a file (" + r + "). Press Try again."); }
            File fin = new File(voicesDir(), id);
            deleteTree(fin);
            if (!tmp.renameTo(fin)) throw new FatalException("The voice could not be saved on this phone.");
            new File(fin, ".ready").createNewFile();
        }
    }

    private static long parseTotal(String contentRange, long dflt) {
        if (contentRange == null) return dflt;
        int i = contentRange.lastIndexOf('/');
        if (i < 0) return dflt;
        try { return Long.parseLong(contentRange.substring(i + 1).trim()); } catch (NumberFormatException e) { return dflt; }
    }

    /* ---------------- Speaking ---------------- */

    @PluginMethod
    public void load(PluginCall call) {
        final String id = safeId(call.getString("id"));
        final String kind = call.getString("kind", "kitten");
        final String model = call.getString("model", "model.onnx");
        final String voices = call.getString("voices", "voices.bin");
        final String tokens = call.getString("tokens", "tokens.txt");
        final String data = call.getString("data", "espeak-ng-data");
        final int threads = Math.max(1, Math.min(4, call.getInt("threads", 2)));
        if (id == null) { call.reject("That voice name is not valid."); return; }
        speakExec.execute(() -> {
            try {
                if (id.equals(loadedId) && tts != null && !Boolean.TRUE.equals(call.getBoolean("force", false))) { call.resolve(info()); return; }
                if (tts != null) { tts.release(); tts = null; loadedId = ""; }
                File d = new File(voicesDir(), id);
                if (!new File(d, ".ready").exists()) { call.reject("This voice is not installed."); return; }
                OfflineTtsConfig cfg = new OfflineTtsConfig();
                cfg.model.numThreads = threads;
                cfg.model.provider = "cpu";
                if (kind.equals("vits")) {
                    cfg.model.vits.model = new File(d, model).getAbsolutePath();
                    cfg.model.vits.tokens = new File(d, tokens).getAbsolutePath();
                    cfg.model.vits.dataDir = new File(d, data).getAbsolutePath();
                } else {
                    cfg.model.kitten.model = new File(d, model).getAbsolutePath();
                    cfg.model.kitten.voices = new File(d, voices).getAbsolutePath();
                    cfg.model.kitten.tokens = new File(d, tokens).getAbsolutePath();
                    cfg.model.kitten.dataDir = new File(d, data).getAbsolutePath();
                }
                long t0 = System.currentTimeMillis();
                tts = new OfflineTts(cfg);
                loadedId = id;
                JSObject r = info();
                r.put("loadMs", System.currentTimeMillis() - t0);
                call.resolve(r);
            } catch (Throwable t) {
                tts = null; loadedId = "";
                call.reject("The voice could not be started: " + t.getMessage());
            }
        });
    }

    private JSObject info() {
        JSObject r = new JSObject();
        r.put("ok", true);
        r.put("id", loadedId);
        try { r.put("rate", tts.sampleRate()); r.put("speakers", tts.speakers()); } catch (Throwable t) { /* ignore */ }
        return r;
    }

    @PluginMethod
    public void speak(PluginCall call) {
        final String text = call.getString("text", "");
        final int sid = call.getInt("sid", 0);
        final float speed = call.getFloat("speed", 1.0f);
        speakExec.execute(() -> {
            OfflineTts t = tts;
            if (t == null) { call.reject("The voice is not loaded."); return; }
            try {
                long t0 = System.currentTimeMillis();
                GeneratedAudio a = t.generate(text, sid, speed);
                long ms = System.currentTimeMillis() - t0;
                float[] s = a.samples;
                byte[] pcm = new byte[s.length * 2];
                for (int i = 0; i < s.length; i++) {
                    int v = Math.round(Math.max(-1f, Math.min(1f, s[i])) * 32767f);
                    pcm[2 * i] = (byte) (v & 0xff);
                    pcm[2 * i + 1] = (byte) ((v >> 8) & 0xff);
                }
                JSObject r = new JSObject();
                r.put("pcm", Base64.encodeToString(pcm, Base64.NO_WRAP));
                r.put("rate", a.sampleRate);
                r.put("genMs", ms);
                r.put("audioMs", a.sampleRate > 0 ? (long) (s.length * 1000.0 / a.sampleRate) : 0);
                call.resolve(r);
            } catch (Throwable e) {
                call.reject("The voice stopped unexpectedly: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void unload(PluginCall call) {
        speakExec.execute(() -> {
            try { if (tts != null) tts.release(); } catch (Throwable t) { /* ignore */ }
            tts = null; loadedId = "";
            call.resolve();
        });
    }
}
