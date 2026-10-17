cmake_minimum_required(VERSION 3.22.1)
project(kvllama LANGUAGES C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# llama.cpp is cloned by the build workflow; its folder is passed in.
if(NOT DEFINED KV_LLAMA_DIR OR KV_LLAMA_DIR STREQUAL "")
    message(FATAL_ERROR "KV_LLAMA_DIR (the llama.cpp folder) was not provided")
endif()

if(ANDROID_ABI STREQUAL "arm64-v8a")
    set(GGML_SYSTEM_ARCH "ARM")
endif()

add_subdirectory(${KV_LLAMA_DIR} build-llama)

add_library(kvllama SHARED kv_engine.cpp kv_jni.cpp)
target_include_directories(kvllama PRIVATE ${KV_LLAMA_DIR}/include ${KV_LLAMA_DIR}/ggml/include)
target_link_libraries(kvllama llama android log)
