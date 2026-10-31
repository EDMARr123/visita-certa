/* Visita Certa — parte comum do app do promotor e do painel do gestor.
   Fala com a planilha Google do cliente (Apps Script) ou, sem URL configurada, roda em MODO DEMONSTRAÇÃO
   com dados de exemplo guardados no próprio navegador. */
var VC = (function () {
  'use strict';

  // URL do App da Web (Apps Script) do cliente. Vazia = modo demonstração.
  var URL_API = '';

  var DEMO = !URL_API;
  var DEMO_KEY = 'vc_demo_v1';

  /* ---------- utilidades ---------- */
  function distancia(lat1, lon1, lat2, lon2) {
    if ([lat1, lon1, lat2, lon2].some(function (v) { return v == null || isNaN(v); })) return null;
    var R = 6371000, r = Math.PI / 180;
    var dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }
  function fmtDist(m) {
    if (m == null) return '—';
    return m < 1000 ? m + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km';
  }
  function hora(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function dataBR(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR');
  }
  function hojeStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function duracao(min) {
    if (min == null || isNaN(min)) return '—';
    min = Math.max(0, Math.round(min));
    var h = Math.floor(min / 60), m = min % 60;
    return h ? h + 'h' + String(m).padStart(2, '0') : m + ' min';
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* hora oficial do registro: a do servidor; se foi enviado depois (sem internet), a do aparelho */
  function horaOficial(reg) {
    if (!reg) return null;
    return reg.offline ? (reg.aparelho || reg.servidor) : (reg.servidor || reg.aparelho);
  }
  /* aparelho com relógio diferente do servidor (registro feito com internet) */
  function relogioSuspeito(reg) {
    if (!reg || reg.offline || !reg.servidor || !reg.aparelho) return false;
    return Math.abs(new Date(reg.servidor) - new Date(reg.aparelho)) > 10 * 60000;
  }

  /* foto da demonstração: desenho de gôndola com a loja e a hora */
  function fotoUrl(f) {
    if (!f) return '';
    if (String(f).indexOf('demo:') !== 0) return f;
    var p = String(f).slice(5).split('|'), loja = esc(p[0] || ''), hr = esc(p[1] || ''), sem = Number(p[2] || 1);
    var cores = ['#e4572e', '#29335c', '#f3a712', '#669bbc', '#a8c686', '#c1121f', '#2a9d8f', '#e9c46a'];
    var caixas = '';
    for (var lin = 0; lin < 4; lin++) {
      for (var col = 0; col < 7; col++) {
        var c = cores[(lin * 7 + col + sem) % cores.length];
        caixas += '<rect x="' + (18 + col * 52) + '" y="' + (38 + lin * 62) + '" width="44" height="46" rx="4" fill="' + c + '"/>';
      }
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="320" viewBox="0 0 400 320">' +
      '<rect width="400" height="320" fill="#d9d4cc"/><rect x="8" y="20" width="384" height="262" fill="#f4f1ec"/>' +
      [84, 146, 208, 270].map(function (y) { return '<rect x="8" y="' + y + '" width="384" height="8" fill="#8d8478"/>'; }).join('') +
      caixas + '<rect y="284" width="400" height="36" fill="rgba(0,0,0,.65)"/>' +
      '<text x="10" y="307" font-family="Arial" font-size="14" fill="#fff">' + loja + ' · ' + hr + ' · DEMONSTRAÇÃO</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ---------- foto: reduz e carimba data/hora/local ---------- */
  function prepararFoto(arquivo, carimbo) {
    return new Promise(function (ok, falha) {
      var img = new Image(), url = URL.createObjectURL(arquivo);
      img.onload = function () {
        var max = 1280, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var cv = document.createElement('canvas');
        cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        var g = cv.getContext('2d');
        g.drawImage(img, 0, 0, cv.width, cv.height);
        var fs = Math.max(14, Math.round(cv.width / 40)), pad = Math.round(fs * 0.6);
        var linhas = carimbo.filter(Boolean);
        var alt = linhas.length * (fs + 6) + pad * 2;
        g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, cv.height - alt, cv.width, alt);
        g.fillStyle = '#fff'; g.font = 'bold ' + fs + 'px Arial'; g.textBaseline = 'top';
        linhas.forEach(function (t, i) { g.fillText(t, pad, cv.height - alt + pad + i * (fs + 6)); });
        URL.revokeObjectURL(url);
        ok(cv.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = function () { URL.revokeObjectURL(url); falha(new Error('Não consegui abrir a foto.')); };
      img.src = url;
    });
  }

  /* ---------- modo demonstração ---------- */
  var PROMOTORES_DEMO = ['Ana Souza', 'Bruno Lima', 'Carla Mendes', 'Diego Rocha', 'Elaine Costa',
                         'Felipe Alves', 'Gabriela Dias', 'Henrique Moura', 'Isabela Freitas', 'João Pedro Silva'];
  var LOJAS_DEMO = [
    ['Supermercado Bom Preço', 'Av. T-63, Setor Bueno', -16.7067, -49.2712],
    ['Mercado Central', 'Rua 3, Centro', -16.6799, -49.2550],
    ['Atacarejo Goiás', 'Av. Anhanguera, Campinas', -16.6650, -49.2900],
    ['Supermercado Família', 'Av. Ricardo Paranhos, Setor Marista', -16.6995, -49.2626],
    ['Mercadinho da Vila', 'Rua 210, Vila Nova', -16.6720, -49.2420],
    ['Super Econômico', 'Av. C-4, Jardim América', -16.7180, -49.2860],
    ['Empório Sul', 'Rua 83, Setor Sul', -16.6905, -49.2560],
    ['Mercado Universitário', 'Praça Universitária, Setor Universitário', -16.6800, -49.2425],
    ['Hiper Jardim Goiás', 'Av. Jamel Cecílio, Jardim Goiás', -16.7090, -49.2390],
    ['Supermercado Oeste', 'Av. República do Líbano, Setor Oeste', -16.6812, -49.2689],
    ['Mercado Amazônia', 'Av. Rio Verde, Parque Amazônia', -16.7400, -49.2800],
    ['Super Pedro Ludovico', 'Av. 5ª Radial, Pedro Ludovico', -16.7140, -49.2580]
  ];
  function rnd(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

  function gerarDemo() {
    var r = rnd(20261031);
    var promotores = PROMOTORES_DEMO.map(function (n, i) { return { id: 'P' + String(i + 1).padStart(2, '0'), nome: n, pin: '1234' }; });
    var lojas = LOJAS_DEMO.map(function (l, i) {
      return { id: 'L' + String(i + 1).padStart(2, '0'), nome: l[0], endereco: l[1], lat: l[2], lon: l[3], raio: 150 };
    });
    var visitas = [], agora = new Date();
    for (var dia = 6; dia >= 0; dia--) {
      var base = new Date(agora); base.setDate(base.getDate() - dia); base.setHours(0, 0, 0, 0);
      if (base.getDay() === 0) continue;                                   // domingo não tem visita
      promotores.forEach(function (p, pi) {
        var t = new Date(base); t.setHours(7, 30 + Math.floor(r() * 50), 0, 0);
        var nVis = 3 + Math.floor(r() * 3);
        for (var v = 0; v < nVis; v++) {
          var loja = lojas[(pi + v * 3 + dia) % lojas.length];
          var entra = new Date(t);
          if (entra > agora) break;
          var dur = 35 + Math.floor(r() * 85);
          var sai = new Date(entra.getTime() + dur * 60000);
          var foraE = r() < 0.07, ruido = function (m) { return (r() - 0.5) * m / 55000; };
          var latE = loja.lat + ruido(foraE ? 1800 : 90), lonE = loja.lon + ruido(foraE ? 1800 : 90);
          var aberta = sai > agora;
          var vis = {
            id: 'demo-' + dia + '-' + pi + '-' + v, data: hojeStr(entra), promotorId: p.id, promotor: p.nome, lojaId: loja.id, loja: loja.nome,
            entrada: { servidor: entra.toISOString(), aparelho: entra.toISOString(), lat: latE, lon: lonE, precisao: 8 + Math.round(r() * 25),
                       dist: distancia(latE, lonE, loja.lat, loja.lon), foto: 'demo:' + loja.nome + '|' + hora(entra.toISOString()) + '|' + v, offline: false },
            saida: null, duracao: null, obs: ''
          };
          if (!aberta) {
            var latS = loja.lat + ruido(90), lonS = loja.lon + ruido(90);
            vis.saida = { servidor: sai.toISOString(), aparelho: sai.toISOString(), lat: latS, lon: lonS, precisao: 8 + Math.round(r() * 25),
                          dist: distancia(latS, lonS, loja.lat, loja.lon), foto: 'demo:' + loja.nome + '|' + hora(sai.toISOString()) + '|' + (v + 3), offline: false };
            vis.duracao = dur;
            if (r() < 0.25) vis.obs = ['Gôndola reabastecida', 'Faltou produto no estoque', 'Ponta de gôndola montada', 'Preço divergente avisado ao gerente'][Math.floor(r() * 4)];
          }
          visitas.push(vis);
          if (aberta) break;
          t = new Date(sai.getTime() + (15 + Math.floor(r() * 30)) * 60000);
        }
      });
    }
    return { promotores: promotores, lojas: lojas, visitas: visitas, criado: hojeStr() };
  }
  function db() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch (e) { d = null; }
    if (!d || d.criado !== hojeStr()) {                 // refaz os exemplos a cada dia, mantendo o que foi registrado de verdade
      var novo = gerarDemo();
      if (d && d.visitas) novo.visitas = novo.visitas.concat(d.visitas.filter(function (v) { return String(v.id).indexOf('demo-') !== 0; }));
      if (d && d.lojaAqui) { novo.lojas.unshift(d.lojaAqui); novo.lojaAqui = d.lojaAqui; }
      d = novo; salvarDb(d);
    }
    return d;
  }
  function salvarDb(d) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(d)); } catch (e) { /* sem espaço: segue só na memória */ } }
  function esperar(v) { return new Promise(function (ok) { setTimeout(function () { ok(v); }, 350); }); }

  var demo = {
    config: function () {
      var d = db();
      return esperar({ ok: true, promotores: d.promotores.map(function (p) { return { id: p.id, nome: p.nome }; }), lojas: d.lojas, fotoSaida: true });
    },
    login: function (q) {
      var p = db().promotores.filter(function (x) { return x.id === q.promotorId; })[0];
      return esperar(p && String(q.pin) === p.pin ? { ok: true, promotor: { id: p.id, nome: p.nome } } : { ok: false, erro: 'PIN incorreto. Na demonstração o PIN é 1234.' });
    },
    estado: function (q) {
      var d = db(), h = hojeStr();
      var minhas = d.visitas.filter(function (v) { return v.promotorId === q.promotorId; });
      return esperar({ ok: true, aberta: minhas.filter(function (v) { return !v.saida; }).pop() || null,
                       hoje: minhas.filter(function (v) { return v.data === h; }) });
    },
    entrada: function (q) {
      var d = db(), p = d.promotores.filter(function (x) { return x.id === q.promotorId; })[0];
      var loja = d.lojas.filter(function (x) { return x.id === q.lojaId; })[0];
      if (!p || String(q.pin) !== p.pin) return esperar({ ok: false, erro: 'PIN incorreto.' });
      if (!loja) return esperar({ ok: false, erro: 'Loja não encontrada.' });
      var ja = d.visitas.filter(function (v) { return v.id === q.id; })[0];
      if (ja) return esperar({ ok: true, visita: ja });
      var aberta = d.visitas.filter(function (v) { return v.promotorId === p.id && !v.saida; })[0];
      if (aberta) return esperar({ ok: false, erro: 'Você ainda está em visita em ' + aberta.loja + '. Registre a saída primeiro.' });
      var agora = new Date().toISOString();
      var vis = { id: q.id, data: hojeStr(new Date(q.hora)), promotorId: p.id, promotor: p.nome, lojaId: loja.id, loja: loja.nome,
        entrada: { servidor: agora, aparelho: q.hora, lat: q.lat, lon: q.lon, precisao: q.precisao, dist: distancia(q.lat, q.lon, loja.lat, loja.lon),
                   foto: q.foto ? 'data:image/jpeg;base64,' + q.foto : '', offline: !!q.offline },
        saida: null, duracao: null, obs: '' };
      d.visitas.push(vis); salvarDb(d);
      return esperar({ ok: true, visita: vis });
    },
    saida: function (q) {
      var d = db(), p = d.promotores.filter(function (x) { return x.id === q.promotorId; })[0];
      if (!p || String(q.pin) !== p.pin) return esperar({ ok: false, erro: 'PIN incorreto.' });
      var vis = d.visitas.filter(function (v) { return v.id === q.visitaId && v.promotorId === p.id; })[0];
      if (!vis) return esperar({ ok: false, erro: 'Visita não encontrada.' });
      if (vis.saida) return esperar({ ok: true, visita: vis });
      var loja = d.lojas.filter(function (x) { return x.id === vis.lojaId; })[0] || {};
      var agora = new Date().toISOString();
      vis.saida = { servidor: agora, aparelho: q.hora, lat: q.lat, lon: q.lon, precisao: q.precisao, dist: distancia(q.lat, q.lon, loja.lat, loja.lon),
                    foto: q.foto ? 'data:image/jpeg;base64,' + q.foto : '', offline: !!q.offline };
      vis.duracao = (new Date(horaOficial(vis.saida)) - new Date(horaOficial(vis.entrada))) / 60000;
      vis.obs = q.obs || '';
      salvarDb(d);
      return esperar({ ok: true, visita: vis });
    },
    painel: function (q) {
      var d = db();
      return esperar({ ok: true, promotores: d.promotores.map(function (p) { return { id: p.id, nome: p.nome }; }), lojas: d.lojas,
        visitas: d.visitas.filter(function (v) { return v.data >= q.de && v.data <= q.ate; }) });
    },
    /* demonstração em qualquer cidade: cria uma loja de teste onde o aparelho está */
    lojaAqui: function (lat, lon) {
      var d = db();
      if (d.lojaAqui) return d.lojaAqui;
      d.lojaAqui = { id: 'L00', nome: 'Loja de teste (sua localização)', endereco: 'Criada na demonstração', lat: lat, lon: lon, raio: 150 };
      d.lojas.unshift(d.lojaAqui); salvarDb(d);
      return d.lojaAqui;
    }
  };

  /* ---------- planilha Google ---------- */
  function chamar(acao, dados) {
    if (DEMO) return demo[acao](dados || {});
    var corpo = JSON.stringify(Object.assign({ acao: acao }, dados || {}));
    return fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: corpo })
      .then(function (r) { return r.json(); });
  }

  return {
    DEMO: DEMO, chamar: chamar, demo: demo,
    distancia: distancia, fmtDist: fmtDist, hora: hora, dataBR: dataBR, hojeStr: hojeStr, duracao: duracao,
    uuid: uuid, esc: esc, fotoUrl: fotoUrl, prepararFoto: prepararFoto, horaOficial: horaOficial, relogioSuspeito: relogioSuspeito
  };
})();
