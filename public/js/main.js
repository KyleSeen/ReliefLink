// Tabs: plain JS, no framework. Buttons carry data-target; panes match by id.
document.addEventListener('DOMContentLoaded', function () {
  var groups = document.querySelectorAll('[data-tabs]');
  groups.forEach(function (group) {
    var buttons = group.querySelectorAll('.tab-btn');
    var panes = group.querySelectorAll('.tab-pane');
    function activate(name) {
      buttons.forEach(function (b) { b.classList.toggle('active', b.dataset.target === name); });
      panes.forEach(function (p) { p.classList.toggle('active', p.id === name); });
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function () { activate(b.dataset.target); });
    });
    var start = group.dataset.tabs;
    if (!start && buttons[0]) start = buttons[0].dataset.target;
    if (start) activate(start);
  });

  // Toast: the single permitted slide animation.
  var toast = document.querySelector('.toast');
  if (toast) {
    requestAnimationFrame(function () { toast.classList.add('show'); });
    setTimeout(function () { toast.classList.remove('show'); }, 6000);
  }
});
