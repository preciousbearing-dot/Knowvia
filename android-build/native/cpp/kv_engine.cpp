#include "kv_engine.h"
#include <algorithm>
#include <chrono>
#include <cstring>
#include <sstream>

#ifdef __ANDROID__
#include <android/log.h>
static void kv_log(ggml_log_level lvl, const char *text, void *) {
    int p = lvl == GGML_LOG_LEVEL_ERROR ? ANDROID_LOG_ERROR : lvl == GGML_LOG_LEVEL_WARN ? ANDROID_LOG_WARN : ANDROID_LOG_INFO;
    __android_log_print(p, "KvLlama", "%s", text);
}
#else
static void kv_log(ggml_log_level, const char *, void *) {}
#endif

static double now_ms() {
    using namespace std::chrono;
    return duration_cast<duration<double, std::milli>>(steady_clock::now().time_since_epoch()).count();
}

void KvEngine::backendInit(const std::string &dir) {
    static bool done = false;
    if (done) return;
    llama_log_set(kv_log, nullptr);
    if (!dir.empty()) ggml_backend_load_all_from_path(dir.c_str());
    llama_backend_init();
    done = true;
}

bool KvEngine::load(const std::string &path, int nCtx, int threads, std::string &err) {
    unload();
    llama_model_params mp = llama_model_default_params();
    model_ = llama_model_load_from_file(path.c_str(), mp);
    if (!model_) { err = "The model file could not be opened. It may be damaged or not a supported model."; return false; }
    vocab_ = llama_model_get_vocab(model_);
    int trained = llama_model_n_ctx_train(model_);
    if (trained > 0 && nCtx > trained) nCtx = trained;
    llama_context_params cp = llama_context_default_params();
    cp.n_ctx = (uint32_t) nCtx;
    cp.n_batch = (uint32_t) nBatch_;
    cp.n_ubatch = (uint32_t) nBatch_;
    cp.n_threads = threads;
    cp.n_threads_batch = threads;
    cp.abort_callback = [](void *d) { return ((std::atomic<bool> *) d)->load(); };
    cp.abort_callback_data = &abort_;
    ctx_ = llama_init_from_model(model_, cp);
    if (!ctx_) {
        llama_model_free(model_); model_ = nullptr; vocab_ = nullptr;
        err = "There is not enough free memory to start this model. Close other apps, or choose a smaller model.";
        return false;
    }
    nCtx_ = (int) llama_n_ctx(ctx_);
    cached_.clear();
    abort_.store(false);
    return true;
}

void KvEngine::unload() {
    if (ctx_) { llama_free(ctx_); ctx_ = nullptr; }
    if (model_) { llama_model_free(model_); model_ = nullptr; }
    vocab_ = nullptr;
    cached_.clear();
}

std::string KvEngine::info() const {
    if (!model_) return "";
    char desc[256] = {0};
    llama_model_desc(model_, desc, sizeof(desc));
    std::ostringstream o;
    o << desc << " | " << (llama_model_size(model_) / 1048576) << " MB | ctx " << nCtx_;
    return o.str();
}

std::string KvEngine::formatPrompt(const std::vector<KvMsg> &msgs, std::string &err) const {
    std::vector<llama_chat_message> cm;
    cm.reserve(msgs.size());
    for (auto &m : msgs) cm.push_back({m.role.c_str(), m.content.c_str()});
    const char *tmpl = llama_model_chat_template(model_, nullptr);
    const char *tries[2] = {tmpl, "chatml"};
    for (const char *t : tries) {
        std::vector<char> buf(std::max<size_t>(4096, msgs.size() * 2048));
        for (int pass = 0; pass < 2; pass++) {
            int n = llama_chat_apply_template(t, cm.data(), cm.size(), true, buf.data(), (int32_t) buf.size());
            if (n < 0) break;
            if ((size_t) n > buf.size()) { buf.resize((size_t) n + 64); continue; }
            return std::string(buf.data(), (size_t) n);
        }
    }
    err = "This model's chat format is not supported.";
    return "";
}

std::vector<llama_token> KvEngine::tokenize(const std::string &text) const {
    std::vector<llama_token> toks(text.size() + 16);
    int n = llama_tokenize(vocab_, text.c_str(), (int32_t) text.size(), toks.data(), (int32_t) toks.size(), true, true);
    if (n < 0) { toks.resize((size_t) -n); n = llama_tokenize(vocab_, text.c_str(), (int32_t) text.size(), toks.data(), (int32_t) toks.size(), true, true); }
    toks.resize(n < 0 ? 0 : (size_t) n);
    return toks;
}

// Length of the longest prefix of s that is complete UTF-8 (an unfinished character stays for the next token).
static size_t utf8_complete(const std::string &s) {
    size_t n = s.size();
    if (n == 0) return 0;
    size_t i = n;
    int back = 0;
    while (i > 0 && back < 4 && ((unsigned char) s[i - 1] & 0xC0) == 0x80) { i--; back++; }
    if (i == 0) return n;                       // only continuation bytes: let them through
    unsigned char lead = (unsigned char) s[i - 1];
    int need = lead < 0x80 ? 1 : (lead & 0xE0) == 0xC0 ? 2 : (lead & 0xF0) == 0xE0 ? 3 : (lead & 0xF8) == 0xF0 ? 4 : 1;
    int have = back + 1;
    return have >= need ? n : i - 1;
}

int KvEngine::generate(std::vector<KvMsg> msgs, int maxTokens, float temp,
                       const std::function<bool(const std::string &)> &onToken, KvStats &st, std::string &err) {
    if (!loaded()) { err = "No model is loaded."; return -1; }
    if (msgs.empty()) { err = "Nothing to answer."; return -1; }
    abort_.store(false);
    st = KvStats();
    if (maxTokens < 1) maxTokens = 256;
    if (maxTokens > nCtx_ / 2) maxTokens = nCtx_ / 2;

    // 1. Build the prompt, dropping the oldest turns if the conversation does not fit.
    std::vector<llama_token> toks;
    for (;;) {
        std::string prompt = formatPrompt(msgs, err);
        if (prompt.empty()) return -2;
        toks = tokenize(prompt);
        if ((int) toks.size() + maxTokens + 8 <= nCtx_) break;
        size_t drop = msgs[0].role == "system" ? 1 : 0;
        if (msgs.size() > drop + 1) { msgs.erase(msgs.begin() + (long) drop); st.trimmedMsgs++; continue; }
        int keep = nCtx_ - maxTokens - 8;           // last resort: keep the tail of the prompt
        if (keep < 16) { err = "The context is too small for this request."; return -3; }
        toks.erase(toks.begin(), toks.end() - keep);
        break;
    }
    st.promptTokens = (int) toks.size();

    // 2. Re-use the part of the KV cache that matches the start of this prompt.
    size_t p = 0;
    while (p < cached_.size() && p < toks.size() && cached_[p] == toks[p]) p++;
    if (p >= toks.size()) p = toks.size() - 1;      // always decode at least one token to get logits
    llama_memory_t mem = llama_get_memory(ctx_);
    if (p < cached_.size()) {
        if (p == 0 || !llama_memory_seq_rm(mem, 0, (llama_pos) p, -1)) { llama_memory_clear(mem, true); p = 0; }
    }
    cached_.resize(p);
    st.reusedTokens = (int) p;

    // 3. Process the new part of the prompt.
    double t0 = now_ms();
    for (size_t i = p; i < toks.size();) {
        int n = (int) std::min<size_t>((size_t) nBatch_, toks.size() - i);
        llama_batch b = llama_batch_get_one(toks.data() + i, n);
        int rc = llama_decode(ctx_, b);
        if (abort_.load()) { llama_memory_clear(mem, true); cached_.clear(); st.finish = "cancelled"; return 1; }
        if (rc != 0) { llama_memory_clear(mem, true); cached_.clear(); err = "The model could not read this message (code " + std::to_string(rc) + ")."; return -4; }
        for (int k = 0; k < n; k++) cached_.push_back(toks[i + (size_t) k]);
        i += (size_t) n;
    }
    st.promptMs = now_ms() - t0;

    // 4. Generate.
    llama_sampler_chain_params sp = llama_sampler_chain_default_params();
    llama_sampler *smpl = llama_sampler_chain_init(sp);
    llama_sampler_chain_add(smpl, llama_sampler_init_penalties(llama_vocab_n_tokens(vocab_), 128, 1.08f, 0.0f, 0.0f));
    if (temp <= 0.01f) {
        llama_sampler_chain_add(smpl, llama_sampler_init_greedy());
    } else {
        llama_sampler_chain_add(smpl, llama_sampler_init_top_k(40));
        llama_sampler_chain_add(smpl, llama_sampler_init_top_p(0.92f, 1));
        llama_sampler_chain_add(smpl, llama_sampler_init_min_p(0.05f, 1));
        llama_sampler_chain_add(smpl, llama_sampler_init_temp(temp));
        llama_sampler_chain_add(smpl, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));
    }
    // let the repetition penalty see the prompt's tail
    size_t from = toks.size() > 128 ? toks.size() - 128 : 0;
    for (size_t i = from; i < toks.size(); i++) llama_sampler_accept(smpl, toks[i]);

    std::string pending;
    double t1 = now_ms();
    st.finish = "length";
    int rc = 0;
    for (int i = 0; i < maxTokens; i++) {
        if (abort_.load()) { st.finish = "cancelled"; rc = 1; break; }
        if ((int) cached_.size() + 1 >= nCtx_) { st.finish = "length"; break; }
        llama_token tok = llama_sampler_sample(smpl, ctx_, -1);
        if (llama_vocab_is_eog(vocab_, tok)) { st.finish = "stop"; break; }
        char buf[256];
        int n = llama_token_to_piece(vocab_, tok, buf, sizeof(buf), 0, false);
        if (n > 0) pending.append(buf, (size_t) n);
        llama_batch b = llama_batch_get_one(&tok, 1);
        int d = llama_decode(ctx_, b);
        if (abort_.load()) { llama_memory_clear(mem, true); cached_.clear(); st.finish = "cancelled"; rc = 1; break; }
        if (d != 0) { llama_memory_clear(mem, true); cached_.clear(); err = "The model stopped unexpectedly (code " + std::to_string(d) + ")."; rc = -5; break; }
        cached_.push_back(tok);
        st.genTokens++;
        size_t ok = utf8_complete(pending);
        if (ok > 0) {
            std::string out = pending.substr(0, ok);
            pending.erase(0, ok);
            if (!onToken(out)) { st.finish = "cancelled"; rc = 1; break; }
        }
    }
    size_t ok = utf8_complete(pending);
    if (rc == 0 && ok > 0) onToken(pending.substr(0, ok));
    st.genMs = now_ms() - t1;
    llama_sampler_free(smpl);
    return rc;
}
