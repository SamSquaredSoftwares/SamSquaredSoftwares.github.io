/* SAM² site shared navigation + footer + interactions */
(function () {
  var NAV = ''
    + '<nav class="nav">'
    +   '<div class="nav-inner">'
    +     '<a class="nav-brand" href="/index.html"><img src="/logo.png" alt="SAM²" /></a>'
    +     '<button class="nav-toggle" aria-label="Toggle menu">&#9776;</button>'
    +     '<ul class="nav-links">'
    +       '<li><a href="/index.html">Home</a></li>'
    +       '<li class="nav-item">'
    +         '<button class="nav-item-toggle">Product <span class="caret"></span></button>'
    +         '<div class="dropdown">'
    +           '<a href="/product.html#echo">Echo Engine<small>Universal POS data interchange</small></a>'
    +           '<a href="/product.html#invoice">AI Invoice-to-Stock<small>Automated supplier processing</small></a>'
    +           '<a href="/product.html#detection">Loss Prevention<small>Real-time anomaly detection</small></a>'
    +           '<a href="/product.html#stocktake">Stocktake &amp; Cash-up<small>Scan, weigh, reconcile</small></a>'
    +         '</div>'
    +       '</li>'
    +       '<li class="nav-item">'
    +         '<button class="nav-item-toggle">Solutions <span class="caret"></span></button>'
    +         '<div class="dropdown">'
    +           '<a href="/how-it-works.html#full">Full POS Mode<small>Replace your point of sale</small></a>'
    +           '<a href="/how-it-works.html#sidecar">Stock Sidecar Mode<small>Add on to your existing POS</small></a>'
    +           '<a href="/how-it-works.html">How It Works<small>The end-to-end flow</small></a>'
    +         '</div>'
    +       '</li>'
    +       '<li class="nav-item">'
    +         '<button class="nav-item-toggle">Company <span class="caret"></span></button>'
    +         '<div class="dropdown">'
    +           '<a href="/about.html">About<small>Who we are</small></a>'
    +           '<a href="/pricing.html">Pricing<small>Plans &amp; licensing</small></a>'
    +           '<a href="/contact.html">Contact<small>Talk to us</small></a>'
    +         '</div>'
    +       '</li>'
    +       '<li><a class="nav-cta" href="/contact.html">Book a demo</a></li>'
    +     '</ul>'
    +   '</div>'
    + '</nav>';

  var YEAR = new Date().getFullYear();
  var FOOTER = ''
    + '<footer class="footer"><div class="container">'
    +   '<div class="footer-grid">'
    +     '<div class="footer-brand">'
    +       '<img src="/logo.png" alt="SAM²" />'
    +       '<p>SAMePOS by Sam Squared Softwares — an AI-integrated point-of-sale and stock-control platform for hospitality and retail.</p>'
    +     '</div>'
    +     '<div><h4>Product</h4><ul>'
    +       '<li><a href="/product.html">Features</a></li>'
    +       '<li><a href="/how-it-works.html">How It Works</a></li>'
    +       '<li><a href="/pricing.html">Pricing</a></li>'
    +     '</ul></div>'
    +     '<div><h4>Company</h4><ul>'
    +       '<li><a href="/about.html">About</a></li>'
    +       '<li><a href="/contact.html">Contact</a></li>'
    +       '<li><a href="/contact.html">Book a demo</a></li>'
    +     '</ul></div>'
    +   '</div>'
    +   '<div class="footer-bottom">&copy; ' + YEAR + ' Sam Squared Softwares (Pty) Ltd. All rights reserved. &nbsp;•&nbsp; Smarter Softwares. Squared.</div>'
    + '</div></footer>';

  function mount() {
    var navEl = document.getElementById('nav-placeholder');
    var footEl = document.getElementById('footer-placeholder');
    if (navEl) navEl.innerHTML = NAV;
    if (footEl) footEl.innerHTML = FOOTER;

    // Mobile menu toggle
    var toggle = document.querySelector('.nav-toggle');
    var links = document.querySelector('.nav-links');
    if (toggle && links) {
      toggle.addEventListener('click', function () { links.classList.toggle('open'); });
    }

    // Dropdown toggles (click on mobile, hover handled by CSS on desktop)
    document.querySelectorAll('.nav-item-toggle').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var item = btn.closest('.nav-item');
        var wasOpen = item.classList.contains('open');
        document.querySelectorAll('.nav-item').forEach(function (i) { i.classList.remove('open'); });
        if (!wasOpen) item.classList.add('open');
      });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.nav-item')) {
        document.querySelectorAll('.nav-item').forEach(function (i) { i.classList.remove('open'); });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
