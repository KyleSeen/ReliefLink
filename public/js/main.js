// public/js/main.js — shared client-side JS for ReliefLink
// Team members can add small UI helpers here. Keep it lightweight.

document.addEventListener('DOMContentLoaded', function () {
  // Auto-dismiss flash alerts after 5 seconds.
  document.querySelectorAll('.alert').forEach(function (el) {
    if (el.classList.contains('alert-danger')) return; // keep errors visible
    setTimeout(function () {
      el.style.transition = 'opacity 0.4s ease';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 400);
    }, 5000);
  });
});
