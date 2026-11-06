package com.cinefrases.app;

import android.content.Context;
import android.content.SharedPreferences;

/** Configurações salvas no aparelho (só o código de sincronização; o servidor é fixo). */
public final class Prefs {
    private static final String FILE = "cinefrases";
    private static final String KEY_CODE = "syncCode";

    private Prefs() {}

    private static SharedPreferences sp(Context c) {
        return c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    /** Endereço do servidor de sincronização (definido na compilação). */
    public static String serverUrl() {
        return BuildConfig.SERVER_URL;
    }

    public static String syncCode(Context c) {
        return sp(c).getString(KEY_CODE, "");
    }

    public static boolean isConfigured(Context c) {
        return ApiClient.isValidCode(syncCode(c));
    }

    public static void saveCode(Context c, String code) {
        sp(c).edit().putString(KEY_CODE, code).apply();
    }
}
