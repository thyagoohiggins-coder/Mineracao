#!/usr/bin/env bash
# Popula o servidor local com frases de exemplo (títulos fictícios) para os prints.
set -euo pipefail
BASE="${BASE:-http://localhost:3000}/api/rooms/${CODE:-lua-7K2Q9P}/phrases"
now=$(($(date +%s) * 1000))
add() { # id texto source sourceName titulo tempo minutos_atras url fav
  curl -fsS -X POST "$BASE" -H 'Content-Type: application/json' -d "$(node -e '
    const [id,text,source,sourceName,title,t,ago,url]=process.argv.slice(1);
    console.log(JSON.stringify({id,text,source,sourceName,title,videoTime:Number(t),url,createdAt:Number(process.env.NOW)-ago*60000}))' \
    "$1" "$2" "$3" "$4" "$5" "$6" "$7" "$8")" > /dev/null
  if [ "${9:-}" = "fav" ]; then curl -fsS -X POST "$BASE/$1" -H 'Content-Type: application/json' -d '{"favorite":true}' > /dev/null; fi
}
export NOW=$now
add demo000001 "Nem todo mundo que se perde está perdido. Às vezes a gente só está procurando o caminho certo." netflix Netflix "A Última Estação · T1:E3" 1325 2 "https://www.netflix.com/watch/1" fav
add demo000002 "Coragem não é não ter medo. É ir mesmo com ele." disney "Disney+" "O Farol do Norte" 3610 9 "https://www.disneyplus.com/video/1"
add demo000003 "O segredo para começar é simplesmente começar." youtube YouTube "Como aprender qualquer coisa em 20 horas" 247 25 "https://www.youtube.com/watch?v=abc123&t=247s" fav
add demo000004 "Você não precisa ver a escada inteira. Só dê o primeiro passo." max Max "Noite em Lisboa · T2:E1" 2780 61 "https://play.max.com/video/1"
add demo000005 "Algumas pessoas valem a pena derreter." prime "Prime Video" "Inverno em Copacabana" 5122 180 "https://www.primevideo.com/detail/1"
add demo000006 "Quando tudo parecer dar errado, lembre-se: o avião decola contra o vento." netflix Netflix "A Última Estação · T1:E5" 845 1500 "https://www.netflix.com/watch/2"
