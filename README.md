# Knowvia

A path to knowing. Courses and your study companion Amani.

Open the live app: https://preciousbearing-dot.github.io/Knowvia/

## Android app

Every push to `main` builds the Android app automatically (GitHub Actions, workflow "Build Android app").
Download the newest build: https://github.com/preciousbearing-dot/Knowvia/releases/tag/apk-latest

The app is the same Knowvia web app inside an Android shell (Capacitor). Test builds are signed with the key in `android-build/knowvia-test.jks`, which is public and meant only for sideload testing. A separate private key will be used for the Play Store.
