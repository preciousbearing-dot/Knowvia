#include <jni.h>
#include <memory>
#include <mutex>
#include "kv_engine.h"

static KvEngine g_engine;
static std::mutex g_mu;   // one operation at a time; stop() does not take it

static std::string jstr(JNIEnv *env, jstring s) {
    if (!s) return "";
    const char *c = env->GetStringUTFChars(s, nullptr);
    std::string r(c ? c : "");
    if (c) env->ReleaseStringUTFChars(s, c);
    return r;
}
static std::string jesc(const std::string &s) {
    std::string o;
    for (char c : s) { if (c == '"' || c == '\\') { o += '\\'; o += c; } else if (c == '\n') o += "\\n"; else if ((unsigned char) c >= 32) o += c; }
    return o;
}

extern "C" JNIEXPORT void JNICALL
Java_app_knowvia_study_KvLlama_nativeInit(JNIEnv *env, jclass, jstring libDir) {
    KvEngine::backendInit(jstr(env, libDir));
}

// returns "" on success, otherwise a plain-language error
extern "C" JNIEXPORT jstring JNICALL
Java_app_knowvia_study_KvLlama_nativeLoad(JNIEnv *env, jclass, jstring path, jint nCtx, jint threads) {
    std::lock_guard<std::mutex> lk(g_mu);
    std::string err;
    bool ok = g_engine.load(jstr(env, path), nCtx, threads, err);
    return env->NewStringUTF(ok ? "" : err.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_app_knowvia_study_KvLlama_nativeUnload(JNIEnv *, jclass) {
    g_engine.stop();
    std::lock_guard<std::mutex> lk(g_mu);
    g_engine.unload();
}

extern "C" JNIEXPORT void JNICALL
Java_app_knowvia_study_KvLlama_nativeStop(JNIEnv *, jclass) { g_engine.stop(); }

extern "C" JNIEXPORT jstring JNICALL
Java_app_knowvia_study_KvLlama_nativeInfo(JNIEnv *env, jclass) {
    std::lock_guard<std::mutex> lk(g_mu);
    return env->NewStringUTF(g_engine.info().c_str());
}

// sink.onToken(byte[]) -> boolean (false = stop). Returns a small JSON text: {"ok":true,...} or {"ok":false,"error":"..."}
extern "C" JNIEXPORT jstring JNICALL
Java_app_knowvia_study_KvLlama_nativeGenerate(JNIEnv *env, jclass, jobjectArray roles, jobjectArray contents,
                                              jint maxTokens, jfloat temp, jobject sink) {
    std::lock_guard<std::mutex> lk(g_mu);
    std::vector<KvMsg> msgs;
    jsize n = env->GetArrayLength(roles);
    for (jsize i = 0; i < n; i++) {
        auto r = (jstring) env->GetObjectArrayElement(roles, i);
        auto c = (jstring) env->GetObjectArrayElement(contents, i);
        msgs.push_back({jstr(env, r), jstr(env, c)});
        env->DeleteLocalRef(r); env->DeleteLocalRef(c);
    }
    jclass cls = env->GetObjectClass(sink);
    jmethodID mid = env->GetMethodID(cls, "onToken", "([B)Z");
    KvStats st; std::string err;
    int rc = g_engine.generate(msgs, maxTokens, temp, [&](const std::string &piece) {
        jbyteArray arr = env->NewByteArray((jsize) piece.size());
        env->SetByteArrayRegion(arr, 0, (jsize) piece.size(), (const jbyte *) piece.data());
        jboolean go = env->CallBooleanMethod(sink, mid, arr);
        env->DeleteLocalRef(arr);
        if (env->ExceptionCheck()) { env->ExceptionClear(); return false; }
        return go == JNI_TRUE;
    }, st, err);
    char buf[512];
    if (rc < 0) {
        std::string j = "{\"ok\":false,\"error\":\"" + jesc(err) + "\"}";
        return env->NewStringUTF(j.c_str());
    }
    snprintf(buf, sizeof(buf), "{\"ok\":true,\"finish\":\"%s\",\"promptTokens\":%d,\"reusedTokens\":%d,\"genTokens\":%d,\"trimmed\":%d,\"promptMs\":%.0f,\"genMs\":%.0f}",
             st.finish.c_str(), st.promptTokens, st.reusedTokens, st.genTokens, st.trimmedMsgs, st.promptMs, st.genMs);
    return env->NewStringUTF(buf);
}
