package com.hardcoversync;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * The plugin's own native surface: read a text file, delete one, and stat one. Persistent data is in SQLite
 * (op-sqlite); read and delete exist for the one-time import of the old JSON files, stat for the
 * size check of the metadata cache. Files under MyStyle or Document need the FILE:READ grant before the first call
 * (the host enforces it even for plain java.io); the plugin's private directory needs none.
 */
public class HardcoverNativeModule extends ReactContextBaseJavaModule {
    HardcoverNativeModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "HardcoverNative";
    }

    /** The file's text, or "" when it does not exist. */
    @ReactMethod
    public void readTextFile(String path, Promise promise) {
        try {
            File f = new File(path);
            if (!f.isFile()) {
                promise.resolve("");
                return;
            }
            promise.resolve(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8));
        } catch (Exception e) {
            promise.reject("READ_FAILED", e.getClass().getSimpleName() + ": " + e.getMessage(), e);
        }
    }

    /** Deletes a file; false when there was none. Removes the old JSON files after their import into SQLite. */
    @ReactMethod
    public void deleteFile(String path, Promise promise) {
        try {
            promise.resolve(Files.deleteIfExists(new File(path).toPath()));
        } catch (Exception e) {
            promise.reject("DELETE_FAILED", e.getClass().getSimpleName() + ": " + e.getMessage(), e);
        }
    }

    /** {exists, size}. No modification time on purpose: the document app updates it every time a book is opened. */
    @ReactMethod
    public void stat(String path, Promise promise) {
        try {
            File f = new File(path);
            WritableMap m = Arguments.createMap();
            m.putBoolean("exists", f.isFile());
            m.putDouble("size", f.isFile() ? (double) f.length() : 0);
            promise.resolve(m);
        } catch (Exception e) {
            promise.reject("STAT_FAILED", e.getClass().getSimpleName() + ": " + e.getMessage(), e);
        }
    }
}
