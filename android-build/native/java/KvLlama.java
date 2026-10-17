package app.knowvia.study;

/** Thin bridge to the llama.cpp engine (see cpp/kv_jni.cpp). */
public final class KvLlama {
    static { System.loadLibrary("kvllama"); }

    public interface Sink { boolean onToken(byte[] utf8); }

    static native void nativeInit(String libDir);
    static native String nativeLoad(String path, int nCtx, int threads);
    static native void nativeUnload();
    static native void nativeStop();
    static native String nativeInfo();
    static native String nativeGenerate(String[] roles, String[] contents, int maxTokens, float temp, Sink sink);

    private KvLlama() {}
}
