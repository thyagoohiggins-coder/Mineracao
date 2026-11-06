#!/usr/bin/env bash
# Roda dentro do emulador (android-emulator-runner): instala o app e tira os prints.
set -euxo pipefail
PKG=com.estudosplus.app
OUT=docs/prints
mkdir -p "$OUT"
shot() { sleep "${2:-3}"; adb exec-out screencap -p > "$OUT/$1.png"; }
# Toca no centro do elemento cujo atributo casa com o valor (ex.: resource-id ... ou text ...)
tap() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null
  adb shell cat /sdcard/ui.xml > /tmp/ui.xml
  read -r x y < <(python3 - "$1" "$2" <<'PY'
import re, sys, xml.etree.ElementTree as ET
attr, val = sys.argv[1], sys.argv[2]
for n in ET.parse('/tmp/ui.xml').iter('node'):
    if n.get(attr) == val:
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', n.get('bounds')))
        print((x1 + x2) // 2, (y1 + y2) // 2); break
else:
    sys.exit(f'elemento {attr}={val} nao encontrado')
PY
)
  adb shell input tap "$x" "$y"
}

# Barra de status "limpa" (modo demonstração)
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command enter
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 2130
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
adb shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4
adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false

adb install -r android/app/build/outputs/apk/debug/*.apk

# 1) Primeira abertura: tela de conexão
adb shell am start -W -n $PKG/.MainActivity
shot 01-conectar 4

# 2) Configura o código (o APK dos prints aponta para o servidor local, 10.0.2.2)
adb shell am force-stop $PKG
cat > /tmp/estudosplus.xml <<XML
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="syncCode">lua-7K2Q9P</string>
</map>
XML
adb shell "run-as $PKG mkdir -p shared_prefs"
adb shell "run-as $PKG sh -c 'cat > shared_prefs/estudosplus.xml'" < /tmp/estudosplus.xml
adb shell am start -W -n $PKG/.MainActivity
shot 02-lista 6

# 3) Frase chegando ao vivo (como se a extensão tivesse enviado agora)
curl -fsS -X POST http://localhost:3000/api/rooms/lua-7K2Q9P/phrases -H 'Content-Type: application/json' \
  -d "{\"id\":\"demo000099\",\"text\":\"A vida é curta demais para assistir sem legenda.\",\"source\":\"youtube\",\"sourceName\":\"YouTube\",\"title\":\"Curta-metragem: Domingo\",\"videoTime\":92,\"url\":\"https://www.youtube.com/watch?v=xyz&t=92s\",\"createdAt\":$(($(date +%s)*1000))}"
shot 03-frase-ao-vivo 0.25
shot 04-frase-recebida 2

# 4) Busca
tap resource-id "$PKG:id/searchInput" || echo "busca: campo não encontrado"
sleep 1
adb shell input text "coragem"
adb shell input keyevent KEYCODE_BACK   # fecha o teclado
shot 05-busca 2

# 5) Filtro de favoritas
adb shell am force-stop $PKG
adb shell am start -W -n $PKG/.MainActivity
sleep 4
tap text "Favoritas" || echo "filtro: chip não encontrado"
shot 06-favoritas 2

# 6) Tema escuro
adb shell cmd uimode night yes
adb shell am force-stop $PKG
adb shell am start -W -n $PKG/.MainActivity
shot 07-lista-escuro 6
