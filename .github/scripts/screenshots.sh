#!/usr/bin/env bash
# Roda dentro do emulador (android-emulator-runner): instala o app e tira os prints.
set -euxo pipefail
PKG=com.cinefrases.app
OUT=screenshots
mkdir -p "$OUT"
shot() { sleep "${2:-3}"; adb exec-out screencap -p > "$OUT/$1.png"; }

# Barra de status "limpa" (modo demonstração)
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command enter
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 2130
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
adb shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4
adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false

adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# 1) Primeira abertura: tela de conexão
adb shell am start -W -n $PKG/.MainActivity
shot 01-conectar 4

# 2) Configura servidor + código (o emulador enxerga o PC em 10.0.2.2)
adb shell am force-stop $PKG
cat > /tmp/cinefrases.xml <<XML
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="serverUrl">http://10.0.2.2:3000</string>
    <string name="syncCode">lua-7K2Q9P</string>
</map>
XML
adb shell "run-as $PKG mkdir -p shared_prefs"
adb shell "run-as $PKG sh -c 'cat > shared_prefs/cinefrases.xml'" < /tmp/cinefrases.xml
adb shell am start -W -n $PKG/.MainActivity
shot 02-lista 6

# 3) Frase chegando ao vivo (como se a extensão tivesse enviado agora)
curl -fsS -X POST http://localhost:3000/api/rooms/lua-7K2Q9P/phrases -H 'Content-Type: application/json' \
  -d "{\"id\":\"demo000099\",\"text\":\"A vida é curta demais para assistir sem legenda.\",\"source\":\"youtube\",\"sourceName\":\"YouTube\",\"title\":\"Curta-metragem: Domingo\",\"videoTime\":92,\"url\":\"https://www.youtube.com/watch?v=xyz&t=92s\",\"createdAt\":$(($(date +%s)*1000))}"
shot 03-frase-ao-vivo 0.25
shot 04-frase-recebida 2

# 4) Busca
adb shell input keyevent KEYCODE_SEARCH || true
adb shell uiautomator dump /sdcard/ui.xml
adb shell cat /sdcard/ui.xml > /tmp/ui.xml
bounds=$(grep -o 'resource-id="'$PKG':id/searchInput"[^>]*bounds="[^"]*"' /tmp/ui.xml | grep -o 'bounds="[^"]*"' | grep -o '[0-9]\+' | tr '\n' ' ')
read -r x1 y1 x2 y2 <<< "$bounds"
adb shell input tap $(((x1+x2)/2)) $(((y1+y2)/2))
adb shell input text "coragem"
adb shell input keyevent KEYCODE_BACK   # fecha o teclado
shot 05-busca 2

# 5) Filtro de favoritas
adb shell am force-stop $PKG
adb shell am start -W -n $PKG/.MainActivity
sleep 4
adb shell uiautomator dump /sdcard/ui.xml
adb shell cat /sdcard/ui.xml > /tmp/ui.xml
fav=$(grep -o 'text="★ Favoritas"[^>]*bounds="[^"]*"' /tmp/ui.xml | grep -o 'bounds="[^"]*"' | grep -o '[0-9]\+' | tr '\n' ' ')
read -r x1 y1 x2 y2 <<< "$fav"
adb shell input tap $(((x1+x2)/2)) $(((y1+y2)/2))
shot 06-favoritas 2

# 6) Tema escuro
adb shell cmd uimode night yes
adb shell am force-stop $PKG
adb shell am start -W -n $PKG/.MainActivity
shot 07-lista-escuro 6
