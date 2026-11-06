package com.cinefrases.app;

import android.content.Context;
import android.content.SharedPreferences;

/** Configurações salvas no aparelho (endereço do servidor e código de sincronização). */
public final class Prefs {
    private static final String FILE = "cinefrases";
    private static final String KEY_SERVER = "serverUrl";
    private static final String KEY_CODE = "syncCode";

    private Prefs() {}

    private static SharedPreferences sp(Context c) {
        return c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    public static String serverUrl(Context c) {
        return sp(c).getString(KEY_SERVER, "");
    }

    public static String syncCode(Context c) {
        return sp(c).getString(KEY_CODE, "");
    }

    public static boolean isConfigured(Context c) {
        return !serverUrl(c).isEmpty() && ApiClient.isValidCode(syncCode(c));
    }

    public static void save(Context c, String serverUrl, String code) {
        sp(c).edit().putString(KEY_SERVER, serverUrl).putString(KEY_CODE, code).apply();
    }
}
