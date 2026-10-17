// Knowvia on-device engine: a small, stateless-looking chat API on top of llama.cpp.
// Each call gets the whole conversation; the engine re-uses whatever prefix it already
// processed (system prompt + earlier turns), so follow-up messages start fast.
#pragma once
#include <atomic>
#include <functional>
#include <string>
#include <vector>
#include "llama.h"

struct KvMsg { std::string role, content; };

struct KvStats {
    int promptTokens = 0;   // tokens in the prompt
    int reusedTokens = 0;   // tokens that were already processed (cache hit)
    int genTokens = 0;      // tokens generated
    int trimmedMsgs = 0;    // oldest messages dropped to fit the context
    double promptMs = 0, genMs = 0;
    std::string finish;     // "stop" | "length" | "cancelled"
};

class KvEngine {
public:
    ~KvEngine() { unload(); }
    // dir may be empty (static backends). Safe to call more than once.
    static void backendInit(const std::string &dir);
    bool load(const std::string &path, int nCtx, int threads, std::string &err);
    // onToken gets valid UTF-8 text; return false from it to stop. Returns 0 ok, <0 error.
    int generate(std::vector<KvMsg> msgs, int maxTokens, float temp,
                 const std::function<bool(const std::string &)> &onToken, KvStats &st, std::string &err);
    void stop() { abort_.store(true); }
    void unload();
    bool loaded() const { return model_ != nullptr && ctx_ != nullptr; }
    std::string info() const;
    int nCtx() const { return nCtx_; }
private:
    std::string formatPrompt(const std::vector<KvMsg> &msgs, std::string &err) const;
    std::vector<llama_token> tokenize(const std::string &text) const;
    llama_model *model_ = nullptr;
    llama_context *ctx_ = nullptr;
    const llama_vocab *vocab_ = nullptr;
    std::vector<llama_token> cached_;   // tokens currently in the KV cache
    std::atomic<bool> abort_{false};
    int nCtx_ = 0;
    int nBatch_ = 512;
};
