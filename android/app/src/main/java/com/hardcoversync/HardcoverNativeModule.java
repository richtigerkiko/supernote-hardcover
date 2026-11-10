package com.hardcoversync;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

/**
 * The SDK and React Native have no file write, so this is the whole native surface of the plugin:
 * read a text file, write one atomically, and stat one. Files under MyStyle or Document need the FILE:READ /
 * FILE:WRITE grant before the first call (the host enforces it even for plain java.io); the plugin's private
 * directory needs none.
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

    /** Writes via a temp file and a rename, so a crash cannot leave a half-written file. Creates parent folders. */
    @ReactMethod
    public void writeFile(String path, String content, Promise promise) {
        try {
            File f = new File(path);
            File dir = f.getParentFile();
            if (dir != null && !dir.isDirectory() && !dir.mkdirs() && !dir.isDirectory()) {
                throw new IOException("cannot create " + dir);
            }
            File tmp = new File(path + ".tmp");
            Files.write(tmp.toPath(), content.getBytes(StandardCharsets.UTF_8));
            try {
                Files.move(tmp.toPath(), f.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp.toPath(), f.toPath(), StandardCopyOption.REPLACE_EXISTING);
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("WRITE_FAILED", e.getClass().getSimpleName() + ": " + e.getMessage(), e);
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
