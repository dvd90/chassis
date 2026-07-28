/**
 * The docs page's client script, inlined at build time. No framework, no
 * fetch: the search index is embedded in the page, so everything works
 * from a file:// URL with no server.
 */
export const JS = String.raw`
(function () {
  var index = window.__DOCS__ || [];

  // ── Search ───────────────────────────────────────────
  var input = document.getElementById('search');
  var results = document.getElementById('results');
  var nav = document.getElementById('nav');

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function search(query) {
    var q = query.trim().toLowerCase();
    if (!q) return null;
    var hits = [];
    for (var i = 0; i < index.length; i++) {
      var entry = index[i];
      var haystack = entry.t.toLowerCase();
      var at = haystack.indexOf(q);
      if (at === -1) continue;
      // Headings outrank body text, and an earlier match outranks a later one.
      hits.push({ e: entry, score: (entry.h ? 0 : 1000) + at });
      if (hits.length > 400) break;
    }
    hits.sort(function (a, b) { return a.score - b.score; });
    return hits.slice(0, 10).map(function (x) { return x.e; });
  }

  function render(hits) {
    if (!hits) { results.className = 'results'; results.innerHTML = ''; return; }
    results.className = 'results is-open';
    if (!hits.length) {
      results.innerHTML = '<li class="r-empty">No matches.</li>';
      return;
    }
    results.innerHTML = hits.map(function (h) {
      return '<li><a href="#' + h.id + '"><span class="r-doc">' + escapeHtml(h.d) +
        '</span>' + escapeHtml(h.h || h.t.slice(0, 80)) + '</a></li>';
    }).join('');
  }

  if (input) {
    input.addEventListener('input', function () { render(search(input.value)); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; render(null); input.blur(); }
      if (e.key === 'Enter') {
        var first = results.querySelector('a');
        if (first) { first.click(); input.blur(); }
      }
    });
    results.addEventListener('click', function () { render(null); input.value = ''; });
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      }
    });
  }

  // ── Copy buttons ─────────────────────────────────────
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.copy');
    if (!btn) return;
    var code = btn.closest('.code').querySelector('code');
    navigator.clipboard.writeText(code.innerText).then(function () {
      btn.textContent = 'copied';
      btn.classList.add('is-done');
      setTimeout(function () {
        btn.textContent = 'copy';
        btn.classList.remove('is-done');
      }, 1400);
    });
  });

  // ── Mobile nav ───────────────────────────────────────
  var toggle = document.getElementById('nav-toggle');
  var scrim = document.getElementById('scrim');
  function closeNav() {
    nav.classList.remove('is-open');
    scrim.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      scrim.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    scrim.addEventListener('click', closeNav);
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeNav();
    });
  }

  // ── Scroll spy: highlight the active doc and heading ─
  var docLinks = {};
  var headingLinks = {};
  Array.prototype.forEach.call(nav.querySelectorAll('a[data-doc]'), function (a) {
    docLinks[a.getAttribute('data-doc')] = a;
  });
  Array.prototype.forEach.call(nav.querySelectorAll('a[data-heading]'), function (a) {
    headingLinks[a.getAttribute('data-heading')] = a;
  });

  var docs = Array.prototype.slice.call(document.querySelectorAll('.doc'));
  var headings = Array.prototype.slice.call(document.querySelectorAll('.doc h2[id]'));
  var activeDoc = null;

  function setActive() {
    var line = window.scrollY + 140;

    var current = docs[0];
    for (var i = 0; i < docs.length; i++) {
      if (docs[i].offsetTop <= line) current = docs[i];
    }
    if (current && current.id !== activeDoc) {
      activeDoc = current.id;
      for (var id in docLinks) {
        var on = id === activeDoc;
        docLinks[id].classList.toggle('is-active', on);
        var sub = docLinks[id].parentNode.querySelector('.sub-nav');
        if (sub) sub.classList.toggle('is-open', on);
      }
    }

    var currentHeading = null;
    for (var j = 0; j < headings.length; j++) {
      if (headings[j].offsetTop <= line) currentHeading = headings[j];
    }
    for (var hid in headingLinks) {
      headingLinks[hid].classList.toggle(
        'is-active',
        !!currentHeading && hid === currentHeading.id
      );
    }

    toTop.classList.toggle('is-visible', window.scrollY > 600);
  }

  var toTop = document.getElementById('to-top');
  toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { setActive(); ticking = false; });
  }, { passive: true });

  setActive();
})();
`;
