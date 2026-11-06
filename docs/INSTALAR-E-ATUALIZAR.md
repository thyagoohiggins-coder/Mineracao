# Instalar, atualizar e o aviso do Play Protect

## 1. Configurar a chave de assinatura (uma vez só)

O Android só instala uma atualização **por cima** se ela for assinada com **a mesma chave** da versão instalada.
Por isso o APK oficial é sempre assinado com a chave do Estudos Plus, guardada nos *Secrets* do GitHub
(ela **não** fica no repositório, que é público).

1. No GitHub, abra o repositório → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Crie dois secrets:
   | Nome | Valor |
   |------|-------|
   | `ANDROID_KEYSTORE_BASE64` | todo o conteúdo do arquivo `estudosplus.jks.base64` |
   | `ANDROID_KEYSTORE_PASSWORD` | a senha do arquivo `senha.txt` |
3. Em **Actions → Build → Run workflow** (ou com qualquer novo commit), o APK sai assinado.
   No log do passo *Conferir assinatura* deve aparecer o certificado com SHA-256:
   `4F:1B:09:16:B3:7C:FB:09:33:8C:BB:3D:2E:09:A6:C0:A2:8F:37:E9:95:81:DF:23:AA:3F:77:D0:43:DE:5F:AB`

> **Guarde uma cópia do arquivo `estudosplus.jks` e da senha em lugar seguro** (ex.: gerenciador de senhas).
> Se a chave for perdida, não será possível publicar atualizações para quem já tem o app instalado.

Se os secrets não existirem, o build mostra um aviso e o APK sai com uma chave temporária — que **não** atualiza por cima.

## 2. Instalar no celular

- **Primeira vez com o nome Estudos Plus:** desinstale o app antigo **CineFrases** (ele tinha outro identificador e outra
  assinatura) e instale o `EstudosPlus-<versão>.apk` do artefato **EstudosPlus-apk**.
- **Daqui para frente:** é só instalar o APK novo por cima. Cada build tem um número de versão maior e a mesma assinatura,
  então o Android atualiza mantendo os dados.

## 3. Aviso do Play Protect / "app não verificado"

Desde **30 de setembro de 2026**, em aparelhos Android certificados no **Brasil** (também Indonésia, Singapura e Tailândia),
o Google exige que apps instalados fora da Play Store sejam **registrados por um desenvolvedor verificado**.
Apps sem registro geram avisos/bloqueios do Play Protect — não é um problema do código do app (ele só usa a permissão de internet).

**Como resolver de vez — registrar o app:**

1. Crie uma conta no **Android Developer Console** (página oficial: <https://developer.android.com/developer-verification>).
   - **Distribuição limitada** (estudantes/hobby): gratuita, sem documento, para até **20 aparelhos**.
   - **Distribuição completa**: taxa única de US$ 25 e documento de identidade.
2. Registre o app com:
   - **Nome do pacote:** `com.estudosplus.app`
   - **Certificado de assinatura (SHA-256):** `4F:1B:09:16:B3:7C:FB:09:33:8C:BB:3D:2E:09:A6:C0:A2:8F:37:E9:95:81:DF:23:AA:3F:77:D0:43:DE:5F:AB`
3. Siga o passo de comprovação de posse da chave que o console pedir (ele pode pedir um APK assinado com a chave acima —
   gere pelo GitHub Actions depois de configurar os secrets).

**Enquanto o registro não sai:**

- Na tela do Play Protect, toque em **Mais detalhes → Instalar mesmo assim** (quando a opção aparecer), ou
- instale pelo computador com ADB, que continua permitido para apps não registrados:
  ```bash
  adb install -r EstudosPlus-<versão>.apk
  ```

Fontes: [Android developer verification](https://developer.android.com/developer-verification) ·
[Android Developers Blog (mar/2026)](https://android-developers.googleblog.com/2026/03/android-developer-verification-rolling-out-to-all-developers.html)
