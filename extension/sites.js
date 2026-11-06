// Estudos Plus — onde a extensão fica ativa.
// Usado pelo content script e pelo popup. (Atribuição em globalThis para poder ser injetado mais de uma vez.)
globalThis.EP_SITES = {
  // Redes sociais: vídeos curtos sem legenda de filme — extensão desligada por padrão.
  blockedByDefault: [
    'instagram.com', 'facebook.com', 'fb.com', 'messenger.com', 'threads.net', 'threads.com',
    'tiktok.com', 'x.com', 'twitter.com', 'linkedin.com', 'whatsapp.com', 'web.whatsapp.com',
    'snapchat.com', 'pinterest.com', 'reddit.com', 'kwai.com',
  ],

  hostKey(hostname) {
    return String(hostname || '').toLowerCase().replace(/^www\./, '');
  },

  // prefs: { "site.com": true | false } — escolha do usuário no popup (sobrepõe o padrão)
  isBlocked(hostname, prefs) {
    const host = this.hostKey(hostname);
    if (!host) return true;
    const p = prefs || {};
    if (p[host] === false) return true;
    if (p[host] === true) return false;
    return this.blockedByDefault.some((d) => host === d || host.endsWith('.' + d));
  },
};
