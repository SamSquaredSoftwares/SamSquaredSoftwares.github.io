/* Users & permissions page.
   Preview only: data lives in this browser's localStorage. Swap load/save
   for real API calls once a login backend exists. */
(function () {
  var KEY = 'sam2-users';

  var ROLES = [
    { id: 'owner', label: 'Owner' },
    { id: 'admin', label: 'Admin' },
    { id: 'manager', label: 'Manager' },
    { id: 'staff', label: 'Staff' },
    { id: 'viewer', label: 'Viewer' }
  ];

  // Which roles get each permission.
  var PERMISSIONS = [
    { label: 'View sales and stock', roles: ['owner', 'admin', 'manager', 'staff', 'viewer'] },
    { label: 'Ring up sales', roles: ['owner', 'admin', 'manager', 'staff'] },
    { label: 'Stocktake and cash-up', roles: ['owner', 'admin', 'manager', 'staff'] },
    { label: 'Approve voids and comps', roles: ['owner', 'admin', 'manager'] },
    { label: 'Edit products and prices', roles: ['owner', 'admin', 'manager'] },
    { label: 'View reports and loss alerts', roles: ['owner', 'admin', 'manager'] },
    { label: 'Add and edit users', roles: ['owner', 'admin'] },
    { label: 'Billing and licences', roles: ['owner'] }
  ];

  var SEED = [
    { id: 'u1', name: 'Venue Owner', email: 'owner@example.com', role: 'owner', status: 'active', lastActive: Date.now() }
  ];

  var users = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* storage blocked: fall back to seed */ }
    return SEED.slice();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(users)); } catch (e) { /* ignore */ }
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text != null) node.textContent = text;
    return node;
  }

  function roleOptions(select, current) {
    select.textContent = '';
    ROLES.forEach(function (r) {
      var opt = el('option', { value: r.id }, r.label);
      if (r.id === current) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function activeOwners() {
    return users.filter(function (u) { return u.role === 'owner' && u.status === 'active'; }).length;
  }

  // Blocks any change that would leave the account with no active owner.
  function isLastOwner(u) {
    return u.role === 'owner' && u.status === 'active' && activeOwners() <= 1;
  }

  function timeAgo(ts) {
    if (!ts) return 'Never';
    var mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + ' min ago';
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + ' h ago';
    return Math.round(hrs / 24) + ' d ago';
  }

  function render() {
    var q = document.getElementById('u-search').value.trim().toLowerCase();
    var status = document.getElementById('u-filter').value;
    var tbody = document.getElementById('user-rows');
    tbody.textContent = '';

    var shown = users.filter(function (u) {
      var hit = !q || u.name.toLowerCase().indexOf(q) > -1 || u.email.toLowerCase().indexOf(q) > -1;
      return hit && (status === 'all' || u.status === status);
    });

    shown.forEach(function (u) {
      var tr = el('tr');

      var who = el('td');
      who.appendChild(el('span', { class: 'u-name' }, u.name));
      who.appendChild(el('span', { class: 'u-email' }, u.email));
      tr.appendChild(who);

      var st = el('td');
      st.appendChild(el('span', { class: 'pill pill-' + u.status }, u.status));
      tr.appendChild(st);

      var roleCell = el('td');
      var sel = el('select', { 'aria-label': 'Permission level for ' + u.name });
      roleOptions(sel, u.role);
      sel.addEventListener('change', function () {
        if (isLastOwner(u) && sel.value !== 'owner') {
          sel.value = 'owner';
          alert('You need at least one active Owner.');
          return;
        }
        u.role = sel.value;
        save();
        render();
      });
      roleCell.appendChild(sel);
      tr.appendChild(roleCell);

      tr.appendChild(el('td', null, u.status === 'invited' ? 'Pending invite' : timeAgo(u.lastActive)));

      var actions = el('td', { class: 'u-actions' });
      if (u.status === 'invited') {
        actions.appendChild(button('Mark active', function () {
          u.status = 'active';
          u.lastActive = Date.now();
        }));
      } else {
        actions.appendChild(button(u.status === 'active' ? 'Suspend' : 'Reactivate', function () {
          if (u.status === 'active' && isLastOwner(u)) return alert('You need at least one active Owner.');
          u.status = u.status === 'active' ? 'suspended' : 'active';
        }));
      }
      actions.appendChild(button('Remove', function () {
        if (isLastOwner(u)) return alert('You need at least one active Owner.');
        if (!confirm('Remove ' + u.name + '?')) return;
        users = users.filter(function (x) { return x !== u; });
      }, 'danger'));
      tr.appendChild(actions);

      tbody.appendChild(tr);
    });

    document.getElementById('users-empty').hidden = shown.length > 0;
    ['active', 'invited', 'suspended'].forEach(function (s) {
      document.getElementById('stat-' + s).textContent =
        users.filter(function (u) { return u.status === s; }).length;
    });
    document.getElementById('stat-total').textContent = users.length;
  }

  function button(label, onClick, variant) {
    var b = el('button', { type: 'button', class: 'btn-sm' + (variant ? ' btn-sm-' + variant : '') }, label);
    b.addEventListener('click', function () {
      if (onClick() === false) return;
      save();
      render();
    });
    return b;
  }

  function renderPermTable() {
    var table = document.getElementById('perm-table');
    var head = el('tr');
    head.appendChild(el('th', { scope: 'col' }, 'Permission'));
    ROLES.forEach(function (r) { head.appendChild(el('th', { scope: 'col' }, r.label)); });
    var thead = el('thead');
    thead.appendChild(head);
    table.appendChild(thead);

    var tbody = el('tbody');
    PERMISSIONS.forEach(function (p) {
      var tr = el('tr');
      tr.appendChild(el('th', { scope: 'row' }, p.label));
      ROLES.forEach(function (r) {
        var yes = p.roles.indexOf(r.id) > -1;
        var td = el('td', { class: yes ? 'perm-yes' : 'perm-no' }, yes ? '✓' : '–');
        td.appendChild(el('span', { class: 'sr-only' }, yes ? ' allowed' : ' not allowed'));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function initForm() {
    var form = document.getElementById('add-user');
    var msg = document.getElementById('add-msg');
    roleOptions(document.getElementById('u-role'), 'staff');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.name.value.trim();
      var email = form.email.value.trim().toLowerCase();

      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        msg.textContent = 'Enter a name and a valid email.';
        msg.className = 'users-msg is-error';
        return;
      }
      if (users.some(function (u) { return u.email === email; })) {
        msg.textContent = 'That email is already on the team.';
        msg.className = 'users-msg is-error';
        return;
      }

      users.push({
        id: 'u' + Date.now(),
        name: name,
        email: email,
        role: form.role.value,
        status: 'invited',
        lastActive: null
      });
      save();
      form.reset();
      roleOptions(document.getElementById('u-role'), 'staff');
      msg.textContent = name + ' added as invited.';
      msg.className = 'users-msg is-ok';
      render();
    });
  }

  function init() {
    initForm();
    renderPermTable();
    document.getElementById('u-search').addEventListener('input', render);
    document.getElementById('u-filter').addEventListener('change', render);
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
