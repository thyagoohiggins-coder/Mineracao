# Estudos Plus

Copie **instantaneamente** a frase (legenda) que está na tela enquanto assiste a um filme, série ou vídeo — e receba ela **na hora** no app Android.

```
 ┌───────────────────────┐      POST /phrases       ┌──────────────┐   tempo real (SSE)   ┌─────────────────┐
 │ Extensão do navegador │ ───────────────────────▶ │   Servidor   │ ───────────────────▶ │ App Android     │
 │ Netflix, Disney+, Max │ ◀─────────────────────── │ (Cloudflare) │ ◀─────────────────── │ (Java)          │
 │ Prime, YouTube...     │   lista ao vivo (SSE)    └──────────────┘  favoritar / apagar  └─────────────────┘
 └───────────────────────┘
```

Extensão e app usam o **mesmo código de sincronização** (ex.: `lua-7K2Q9P`). Tudo o que é copiado na extensão aparece no app em menos de um segundo; favoritar ou apagar no app também reflete na extensão.

## Prints do app

| Conectar | Frases sincronizadas | Frase chegando ao vivo | Tema escuro |
|---|---|---|---|
| <img src="docs/prints/01-conectar.png" width="200"> | <img src="docs/prints/02-lista.png" width="200"> | <img src="docs/prints/04-frase-recebida.png" width="200"> | <img src="docs/prints/07-lista-escuro.png" width="200"> |

| Busca | Favoritas |
|---|---|
| <img src="docs/prints/05-busca.png" width="200"> | <img src="docs/prints/06-favoritas.png" width="200"> |

> Gerados automaticamente num emulador Android pelo workflow *Prints do app* (`.github/workflows/screenshots.yml`).

## Estrutura

| Pasta        | O que é |
|--------------|---------|
| `extension/` | Extensão para Chrome/Edge/Brave/Opera (Manifest V3) |
| `cloudflare/`| Servidor de sincronização na **Cloudflare** (Workers + Durable Objects) — recomendado |
| `server/`    | Mesmo servidor em Node.js, para rodar no seu PC (alternativa) |
| `android/`   | App Android nativo em **Java** |

---

## 1. Servidor (Cloudflare)

O servidor já está publicado em **`https://cinefrases.thyagohikins.workers.dev`**, e esse endereço vem **fixo** na extensão (`extension/config.js`) e no app (`android/app/build.gradle`, campo `SERVER_URL`). O usuário não precisa configurar nada além do código.

Para publicar de novo depois de mudar o código do servidor, veja o [TUTORIAL-CLOUDFLARE.md](TUTORIAL-CLOUDFLARE.md):

```bash
cd cloudflare
npm install
npm run deploy
```

Cada código de sincronização vira um *Durable Object* que guarda as frases (SQLite) e mantém as conexões em tempo real.
Testes locais (sobe o Worker com `wrangler dev`): `npm test`.

> `server/` tem o mesmo servidor em Node.js, usado nos testes e nos prints automáticos.

## 2. Extensão

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta `extension/`.
4. Clique no ícone do Estudos Plus e depois no **ícone de celular** (canto superior direito): aparece o seu **código** (ex.: `lua-7K2Q9P`), criado automaticamente. É só digitar esse código no app.

### Como usar

- Ative as **legendas** no player.
- **`Alt + C`** → copia a frase que está na tela e envia para o app.
- **`Alt + X`** → mostra as últimas falas (deu tempo de a legenda sumir? clique na fala anterior).
- Ou passe o mouse sobre o vídeo e use o botão **❝ Copiar frase**.
- Também existe o atalho global `Alt + Shift + C` (configurável em `chrome://extensions/shortcuts`).
- Funciona em tela cheia.
- Sem internet/servidor? A frase é copiada mesmo assim e fica numa fila; é enviada automaticamente quando a conexão voltar (o número pendente aparece no ícone).

Serviços: **Netflix, YouTube, Disney+, Max (HBO), Prime Video, Globoplay, Paramount+, Crunchyroll, Apple TV+** e, em geral, **qualquer site com vídeo legendado**. A detecção combina seletores conhecidos de cada serviço, legendas nativas do HTML5, players dentro de *shadow DOM* e uma busca genérica por elementos de legenda sobre o vídeo.
Se nenhuma legenda for encontrada, o Alt+C copia o texto que você tiver selecionado.
Em **redes sociais** (Instagram, Facebook, TikTok, X, Threads…) a extensão fica **desligada por padrão**; em sites que não são de streaming, o botão só aparece depois que uma legenda é detectada. O menu da extensão tem a chave **“Ativa em <site>”** para ligar/desligar em qualquer site (lista padrão em `extension/sites.js`).
Cada frase vai com o nome do filme/série, o serviço, o minuto do vídeo e o link (no YouTube, o link já abre no segundo exato da fala).

> Os sites de streaming mudam o HTML com frequência. Se algum parar de funcionar, os seletores ficam no topo de `extension/content.js` (lista `SITES`). Depois de instalar ou atualizar a extensão, as abas já abertas passam a funcionar sem precisar recarregar.

## 3. App Android (Java)

**Baixar pronto:** cada push gera o APK no GitHub Actions → aba *Actions* → último *Build* → artefato **EstudosPlus-apk**. Instale o `EstudosPlus-<versão>.apk` no celular. Para instalar e atualizar sem erro, e sobre o aviso do Play Protect, veja **[docs/INSTALAR-E-ATUALIZAR.md](docs/INSTALAR-E-ATUALIZAR.md)**.

**Compilar:** abra a pasta `android/` no Android Studio e clique em ▶ Run, ou:

```bash
cd android
./gradlew assembleRelease -PkeystoreFile=/caminho/estudosplus.jks -PkeystorePassword=SENHA
```

O APK fica em `android/app/build/outputs/apk/release/`. (Android 8.0 ou mais novo.)
Para apontar o app para outro servidor: `./gradlew assembleDebug -PserverUrl=https://outro-endereco`.

### Conectando o app

Na primeira tela, digite o **código** que aparece no ícone da extensão e toque em **Conectar**. Pronto.

### O que o app faz

- Recebe as frases **em tempo real** (com reconexão automática) e destaca a que acabou de chegar.
- Busca por texto, título ou serviço; filtros por **favoritas** e por serviço.
- Copiar, favoritar ★, abrir o vídeo no ponto da fala, compartilhar e apagar (com **Desfazer**).
- Exportar/compartilhar a lista inteira.
- Guarda uma cópia local: abre e mostra as frases mesmo sem conexão.
- **Leitor de imagens** (botão *Ler imagem*): tira a frase de um print, foto da câmera ou imagem compartilhada de outro app (*Compartilhar → Salvar frase do print*).
  - Reconhecimento de texto (OCR) **no próprio celular**, sem internet (Google ML Kit, modelo embutido no APK).
  - **Detecta a legenda sozinha** (texto centralizado na parte de baixo do print) e ignora ruído como relógio e bateria.
  - Toque ou **arraste** sobre as linhas para escolher o texto; **pinça com dois dedos** para dar zoom; botão para **girar** a imagem.
  - Limpa o texto: junta linhas quebradas, desfaz hifenização (“fá-” + “cil” → “fácil”), remove ♪ e marcações `<i>`, corrige `|` lido no lugar de `l`.
  - **Segunda leitura com zoom** só da legenda: recorta e amplia o trecho antes de ler de novo — bem mais preciso em foto da TV.
  - Junta as duas linhas da legenda numa frase só e arruma diálogos (`-Why?` lido como `FWhy?` → `- Why?`).
  - Botões para **remover a foto** e **tirar nova foto**; depois de salvar, o leitor continua aberto (com atalho *Ver lista*) e não perde a foto se o Android fechar o app enquanto a câmera está aberta.
  - Texto editável antes de salvar, campo de filme/série (lembrado para o próximo print) e opção de salvar **cada bloco como uma frase separada**.
  - A frase entra na lista com a etiqueta *Imagem* e é sincronizada com a extensão como qualquer outra.

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
