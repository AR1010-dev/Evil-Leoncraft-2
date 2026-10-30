const status = document.getElementById('status');

try {
  status.textContent = 'Loading game renderer…';
  if (window.__lc2Up) await window.__lc2Up;
  if (window.__lc2Go) window.__lc2Go();
  window.THREE = await import('./three.module.js');
  status.textContent = 'Loading game modules…';
  await import('./main.js?v=117');
} catch (error) {
  console.error('Leoncraft startup failed', error);
  status.textContent = 'Game startup failed: ' + (error && error.message ? error.message : String(error));
  document.querySelector('#bar').style.width = '100%';
}
