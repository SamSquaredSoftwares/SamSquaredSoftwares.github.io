/* SAM² site interactions.
   Navigation and footer markup now lives statically in each page; this file
   only wires up behaviour and keeps ARIA state in sync. */
(function () {
  function setExpanded(btn, open) {
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function closeAllDropdowns() {
    document.querySelectorAll('.nav-item.open').forEach(function (item) {
      item.classList.remove('open');
      setExpanded(item.querySelector('.nav-item-toggle'), false);
    });
  }

  function init() {
    // Mobile menu
    var toggle = document.querySelector('.nav-toggle');
    var links = document.querySelector('.nav-links');
    if (toggle && links) {
      toggle.addEventListener('click', function () {
        setExpanded(toggle, links.classList.toggle('open'));
      });
    }

    // Dropdowns: click to toggle (CSS handles hover and focus-within)
    document.querySelectorAll('.nav-item-toggle').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var item = btn.closest('.nav-item');
        var wasOpen = item.classList.contains('open');
        closeAllDropdowns();
        if (!wasOpen) {
          item.classList.add('open');
          setExpanded(btn, true);
        }
      });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.nav-item')) closeAllDropdowns();
    });

    // Escape closes the open dropdown and returns focus to its trigger
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      var openItem = document.querySelector('.nav-item.open');
      if (openItem) {
        var btn = openItem.querySelector('.nav-item-toggle');
        closeAllDropdowns();
        if (btn) btn.focus();
        return;
      }
      if (links && links.classList.contains('open')) {
        links.classList.remove('open');
        setExpanded(toggle, false);
        if (toggle) toggle.focus();
      }
    });

    // Keep the footer copyright year current
    var year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
