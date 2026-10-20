package com.k2fsa.sherpa.onnx;

/** Java face of the sherpa-onnx text-to-speech engine (the native library is the official prebuilt release). */
public class OfflineTts {
    static { System.loadLibrary("sherpa-onnx-jni"); }
    private long ptr;

    public OfflineTts(OfflineTtsConfig config) {
        ptr = newFromFile(config);
        if (ptr == 0) throw new IllegalStateException("The voice model could not be started.");
    }
    public int sampleRate() { return getSampleRate(ptr); }
    public int speakers() { return getNumSpeakers(ptr); }
    public GeneratedAudio generate(String text, int sid, float speed) { return generateImpl(ptr, text, sid, speed); }
    public void release() { if (ptr != 0) { delete(ptr); ptr = 0; } }

    private native long newFromFile(OfflineTtsConfig config);
    private native void delete(long ptr);
    private native int getSampleRate(long ptr);
    private native int getNumSpeakers(long ptr);
    private native GeneratedAudio generateImpl(long ptr, String text, int sid, float speed);
}
