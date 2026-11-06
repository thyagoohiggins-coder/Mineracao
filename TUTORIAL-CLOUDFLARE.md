# Colocar o CineFrases na Cloudflare (passo a passo)

Tempo: uns 10 minutos. Custo: **grátis**.
Depois disso, a extensão e o app conversam pela internet, de qualquer lugar, sem precisar deixar o computador ligado.

---

### 1. Crie a conta
Entre em **https://dash.cloudflare.com/sign-up** e crie uma conta grátis (só e-mail e senha).

### 2. Instale o Node.js
Baixe a versão **LTS** em **https://nodejs.org** e instale (é só avançar).

### 3. Publique o servidor
Abra o terminal (no Windows: *Prompt de Comando* ou *PowerShell*) **dentro da pasta `cloudflare`** do projeto e rode, um de cada vez:

```bash
npm install
```

```bash
npx wrangler login
```
> Abre o navegador: clique em **Allow** (Permitir).

```bash
npm run deploy
```
> Na primeira vez ele pode pedir para escolher um **subdomínio** (ex.: `joao`). Escolha qualquer nome livre.

No final aparece o endereço do seu servidor, assim:

```
https://cinefrases.joao.workers.dev
```

**Copie esse endereço.** Para conferir, abra ele no navegador: deve aparecer `"Servidor do CineFrases no ar"`.

### 4. Pronto: extensão e app já usam esse endereço
O endereço `https://cinefrases.thyagohikins.workers.dev` já vem fixo na extensão e no app; ninguém precisa digitá-lo.

1. Clique no ícone do **CineFrases** no navegador e veja o seu **código** (ex.: `lua-7K2Q9P`), criado automaticamente.
2. No app do celular, digite esse código e toque em **Conectar**.
3. Abra um vídeo com legenda e aperte **Alt + C**. A frase aparece no celular na hora. 🎉

> Não precisa criar registro de DNS. Se quiser usar um domínio próprio, depois do deploy vá em
> *Workers & Pages → cinefrases → Settings → Domains & Routes → Add → Custom Domain* e troque o endereço em
> `extension/config.js` e em `android/app/build.gradle` (`SERVER_URL`).

---

## Dúvidas rápidas

**Preciso fazer isso de novo?** Não. O servidor fica no ar para sempre. Só rode `npm run deploy` de novo se alterar o código da pasta `cloudflare`.

**A bolinha da extensão fica vermelha ("sem conexão").** Confira se o deploy foi feito (abra o endereço no navegador). As frases copiadas nesse meio-tempo não se perdem: são enviadas sozinhas quando a conexão voltar.

**Quero ver se está funcionando.** No painel da Cloudflare: *Workers & Pages* → *cinefrases* → *Logs*.

**Quanto custa?** O plano grátis cobre 100 mil requisições por dia, muito mais do que uma pessoa usa.

**O código é uma senha?** Sim: quem souber seu código vê suas frases. Use o botão **Gerar**, que cria um código difícil de adivinhar.
