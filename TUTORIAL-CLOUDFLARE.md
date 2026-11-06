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

### 4. Configure a extensão
1. Clique no ícone do **CineFrases** no navegador.
2. Em **Servidor**, cole o endereço.
3. Clique em **Gerar** (cria seu código, ex.: `lua-7K2Q9P`) e depois em **Salvar**.
4. A bolinha no topo fica **verde: "sincronizado"**.

### 5. Configure o app no celular
1. Abra o app **CineFrases**.
2. Cole o **mesmo endereço** e digite o **mesmo código** da extensão.
3. Toque em **Conectar**.

### 6. Teste
Abra um vídeo com legenda e aperte **Alt + C**. A frase aparece no celular na hora. 🎉

---

## Dúvidas rápidas

**Preciso fazer isso de novo?** Não. O servidor fica no ar para sempre. Só rode `npm run deploy` de novo se alterar o código da pasta `cloudflare`.

**Não quero colar o endereço toda vez que instalar.** Troque `SEU-USUARIO` pelo seu subdomínio nestes dois arquivos:
- `extension/config.js` (extensão)
- `android/app/src/main/res/values/config.xml` (app)

**A bolinha da extensão fica vermelha ("offline").** Confira se o endereço está certo (com `https://` e sem espaço no final). As frases copiadas nesse meio-tempo não se perdem: são enviadas sozinhas quando a conexão voltar.

**Quero ver se está funcionando.** No painel da Cloudflare: *Workers & Pages* → *cinefrases* → *Logs*.

**Quanto custa?** O plano grátis cobre 100 mil requisições por dia, muito mais do que uma pessoa usa.

**O código é uma senha?** Sim: quem souber seu código vê suas frases. Use o botão **Gerar**, que cria um código difícil de adivinhar.
