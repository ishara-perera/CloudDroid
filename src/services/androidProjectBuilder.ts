// Client-side ZIP archive builder for generating a complete Android Studio / Gradle APK project

interface ZipEntry {
  name: string;
  content: string;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipBlob(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const encodedEntries = entries.map((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = encoder.encode(entry.content);
    const crc = crc32(dataBytes);
    return { nameBytes, dataBytes, crc };
  });

  let localHeadersSize = 0;
  let centralDirSize = 0;

  for (const item of encodedEntries) {
    localHeadersSize += 30 + item.nameBytes.length + item.dataBytes.length;
    centralDirSize += 46 + item.nameBytes.length;
  }

  const totalSize = localHeadersSize + centralDirSize + 22;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let offset = 0;
  const offsets: number[] = [];

  for (const item of encodedEntries) {
    offsets.push(offset);
    // Local file header signature
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true); // version needed
    view.setUint16(offset + 6, 0, true); // flags
    view.setUint16(offset + 8, 0, true); // compression: store (0)
    view.setUint16(offset + 10, 0, true); // mod time
    view.setUint16(offset + 12, 0, true); // mod date
    view.setUint32(offset + 14, item.crc, true);
    view.setUint32(offset + 18, item.dataBytes.length, true);
    view.setUint32(offset + 22, item.dataBytes.length, true);
    view.setUint16(offset + 26, item.nameBytes.length, true);
    view.setUint16(offset + 28, 0, true); // extra length
    offset += 30;

    bytes.set(item.nameBytes, offset);
    offset += item.nameBytes.length;

    bytes.set(item.dataBytes, offset);
    offset += item.dataBytes.length;
  }

  const centralDirStart = offset;

  for (let i = 0; i < encodedEntries.length; i++) {
    const item = encodedEntries[i];
    view.setUint32(offset, 0x02014b50, true); // central file header signature
    view.setUint16(offset + 4, 20, true); // version made by
    view.setUint16(offset + 6, 20, true); // version needed
    view.setUint16(offset + 8, 0, true); // flags
    view.setUint16(offset + 10, 0, true); // compression: store
    view.setUint16(offset + 12, 0, true); // mod time
    view.setUint16(offset + 14, 0, true); // mod date
    view.setUint32(offset + 16, item.crc, true);
    view.setUint32(offset + 20, item.dataBytes.length, true);
    view.setUint32(offset + 24, item.dataBytes.length, true);
    view.setUint16(offset + 28, item.nameBytes.length, true);
    view.setUint16(offset + 30, 0, true); // extra field length
    view.setUint16(offset + 32, 0, true); // comment length
    view.setUint16(offset + 34, 0, true); // disk number
    view.setUint16(offset + 36, 0, true); // internal attrs
    view.setUint32(offset + 38, 0, true); // external attrs
    view.setUint32(offset + 42, offsets[i], true); // relative offset
    offset += 46;

    bytes.set(item.nameBytes, offset);
    offset += item.nameBytes.length;
  }

  // End of central directory record
  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, encodedEntries.length, true);
  view.setUint16(offset + 10, encodedEntries.length, true);
  view.setUint32(offset + 12, centralDirSize, true);
  view.setUint32(offset + 16, centralDirStart, true);
  view.setUint16(offset + 20, 0, true);

  return new Blob([buffer], { type: "application/zip" });
}

export function downloadAndroidProjectZip(appUrl: string): void {
  const entries: ZipEntry[] = [
    {
      name: "CloudDroid-Android/README.md",
      content: `# CloudDroid Android Mobile App Project

This Android project wraps your live CloudDroid workspace (\`${appUrl}\`) into a native Android APK with full-screen obsidian chrome, hardware back-button support, DOM storage persistence, and WebRTC streaming permissions.

## Option 1: Build APK in Android Studio (Recommended)
1. Extract this \`CloudDroid-Android.zip\` folder.
2. Open **Android Studio** -> **Open** -> select the \`CloudDroid-Android\` directory.
3. Wait for Gradle sync to finish, then click **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
4. Transfer \`app/build/outputs/apk/debug/app-debug.apk\` to your Android phone and tap to install.

## Option 2: Command-Line Build
Run \`./build-apk.sh\` (macOS/Linux) or \`build-apk.bat\` (Windows) with Android SDK installed.
`,
    },
    {
      name: "CloudDroid-Android/settings.gradle",
      content: `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "CloudDroid"
include ':app'
`,
    },
    {
      name: "CloudDroid-Android/build.gradle",
      content: `plugins {
    id 'com.android.application' version '8.2.2' apply false
    id 'org.jetbrains.kotlin.android' version '1.9.22' apply false
}
`,
    },
    {
      name: "CloudDroid-Android/gradle.properties",
      content: `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
`,
    },
    {
      name: "CloudDroid-Android/app/build.gradle",
      content: `plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
}

android {
    namespace 'com.clouddroid.workspace'
    compileSdk 34

    defaultConfig {
        applicationId "com.clouddroid.workspace"
        minSdk 26
        targetSdk 34
        versionCode 1
        versionName "1.0.0"
    }

    buildTypes {
        release {
            minifyEnabled false
        }
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = '17'
    }
}

dependencies {
    implementation 'androidx.core:core-ktx:1.12.0'
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'androidx.webkit:webkit:1.10.0'
}
`,
    },
    {
      name: "CloudDroid-Android/app/src/main/AndroidManifest.xml",
      content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />

    <application
        android:allowBackup="true"
        android:hardwareAccelerated="true"
        android:label="CloudDroid"
        android:supportsRtl="true"
        android:usesCleartextTraffic="true"
        android:theme="@style/Theme.CloudDroid">
        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`,
    },
    {
      name: "CloudDroid-Android/app/src/main/res/values/themes.xml",
      content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.CloudDroid" parent="Theme.AppCompat.NoActionBar">
        <item name="android:statusBarColor">#111018</item>
        <item name="android:navigationBarColor">#17131F</item>
        <item name="android:windowBackground">#111018</item>
    </style>
</resources>
`,
    },
    {
      name: "CloudDroid-Android/app/src/main/java/com/clouddroid/workspace/MainActivity.kt",
      content: `package com.clouddroid.workspace

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val workspaceUrl = "${appUrl}"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            setSupportZoom(false)
        }

        webView.webViewClient = WebViewClient()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest?) {
                request?.grant(request.resources)
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        webView.loadUrl(workspaceUrl)
    }
}
`,
    },
    {
      name: "CloudDroid-Android/build-apk.sh",
      content: `#!/usr/bin/env bash
set -e
echo "Building CloudDroid Android APK..."
gradle assembleDebug
echo "APK built at: app/build/outputs/apk/debug/app-debug.apk"
`,
    },
    {
      name: "CloudDroid-Android/build-apk.bat",
      content: `@echo off
echo Building CloudDroid Android APK...
gradle assembleDebug
echo APK built at: app\\build\\outputs\\apk\\debug\\app-debug.apk
`,
    },
  ];

  const blob = createZipBlob(entries);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "CloudDroid-Android-Project.zip";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
