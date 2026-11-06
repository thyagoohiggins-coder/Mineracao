# CineFrases 🎬❝

Copie **instantaneamente** a frase (legenda) que está na tela enquanto assiste a um filme, série ou vídeo — e receba ela **na hora** no app Android.

```
 ┌───────────────────────┐      POST /phrases       ┌──────────────┐   tempo real (SSE)   ┌─────────────────┐
 │ Extensão do navegador │ ───────────────────────▶ │   Servidor   │ ───────────────────▶ │ App Android     │
 │ Netflix, Disney+, Max │ ◀─────────────────────── │  (Node.js)   │ ◀─────────────────── │ (Java)          │
 │ Prime, YouTube...     │   lista ao vivo (SSE)    └──────────────┘  favoritar / apagar  └─────────────────┘
 └───────────────────────┘
```

Extensão e app usam o **mesmo código de sincronização** (ex.: `lua-7K2Q9P`). Tudo o que é copiado na extensão aparece no app em menos de um segundo; favoritar ou apagar no app também reflete na extensão.

## Estrutura

| Pasta        | O que é |
|--------------|---------|
| `extension/` | Extensão para Chrome/Edge/Brave/Opera (Manifest V3) |
| `server/`    | Servidor de sincronização em Node.js, **sem dependências** |
| `android/`   | App Android nativo em **Java** |

---

## 1. Servidor

Requer Node.js 18+.

```bash
cd server
npm start
```

Ele sobe em `http://0.0.0.0:3000` e salva as frases em `server/data/db.json`.
Variáveis opcionais: `PORT`, `HOST`, `DATA_FILE`. Testes: `npm test`.

> Para usar de qualquer lugar (fora da sua rede Wi-Fi), hospede o servidor em qualquer serviço que rode Node (Render, Railway, Fly.io, uma VPS…) e use o endereço público na extensão e no app.

## 2. Extensão

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta `extension/`.
4. Clique no ícone do CineFrases → **Gerar** um código → **Salvar**.
   (Em *Avançado* você troca o endereço do servidor; o padrão é `http://localhost:3000`.)

### Como usar

- Ative as **legendas** no player.
- **`Alt + C`** → copia a frase que está na tela e envia para o app.
- **`Alt + X`** → mostra as últimas falas (deu tempo de a legenda sumir? clique na fala anterior).
- Ou passe o mouse sobre o vídeo e use o botão **❝ Copiar frase**.
- Também existe o atalho global `Alt + Shift + C` (configurável em `chrome://extensions/shortcuts`).
- Funciona em tela cheia.
- Sem internet/servidor? A frase é copiada mesmo assim e fica numa fila; é enviada automaticamente quando a conexão voltar (o número pendente aparece no ícone).

Serviços suportados: **Netflix, YouTube, Disney+, Max (HBO), Prime Video, Globoplay, Paramount+, Crunchyroll, Apple TV+**, e qualquer player que use legendas nativas do HTML5.
Cada frase vai com o nome do filme/série, o serviço, o minuto do vídeo e o link (no YouTube, o link já abre no segundo exato da fala).

> Os sites de streaming mudam o HTML com frequência. Se algum parar de funcionar, os seletores ficam no topo de `extension/content.js` (lista `SITES`).

## 3. App Android (Java)

**Baixar pronto:** cada push gera o APK no GitHub Actions → aba *Actions* → último *Build* → artefato **CineFrases-apk**. Instale o `app-debug.apk` no celular (permita "instalar apps desconhecidos").

**Compilar:** abra a pasta `android/` no Android Studio e clique em ▶ Run, ou:

```bash
cd android
./gradlew assembleDebug
```

O APK fica em `android/app/build/outputs/apk/debug/app-debug.apk`. (minSdk 26 / Android 8.0+.)

### Conectando o app

1. No computador, descubra o IP na rede (Windows: `ipconfig`; macOS/Linux: `ip addr` ou `ifconfig`), ex.: `192.168.0.10`.
2. No app, informe o servidor `http://192.168.0.10:3000` e **o mesmo código** da extensão.
3. Celular e computador precisam estar na mesma rede Wi-Fi (ou use um servidor hospedado na internet).
   Se não conectar, libere a porta 3000 no firewall do computador.

### O que o app faz

- Recebe as frases **em tempo real** (com reconexão automática) e destaca a que acabou de chegar.
- Busca por texto, título ou serviço; filtros por **favoritas** e por serviço.
- Copiar, favoritar ★, abrir o vídeo no ponto da fala, compartilhar e apagar (com **Desfazer**).
- Exportar/compartilhar a lista inteira.
- Guarda uma cópia local: abre e mostra as frases mesmo sem conexão.

## API do servidor

| Método | Rota | Descrição |
|--------|------|-----------|
| GET    | `/api/health` | Status |
| GET    | `/api/rooms/:codigo/phrases` | Lista (mais recentes primeiro) |
| POST   | `/api/rooms/:codigo/phrases` | Adiciona `{ text, source, sourceName, title, videoTime, url, id?, createdAt? }` — reenvio com o mesmo `id` é ignorado |
| POST/PATCH | `/api/rooms/:codigo/phrases/:id` | Atualiza `{ favorite?, note?, text? }` |
| DELETE | `/api/rooms/:codigo/phrases/:id` | Apaga |
| GET    | `/api/rooms/:codigo/stream` | Server-Sent Events: `add`, `update`, `delete` |

O código de sincronização funciona como senha da sua lista: use um código difícil de adivinhar (o botão *Gerar* já faz isso).
