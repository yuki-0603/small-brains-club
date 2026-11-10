'use strict';
// file:// cannot reliably fetch model binaries or start the model Worker.
if (location.protocol === 'file:') {
  document.getElementById('portable-launch').hidden = false;
  document.querySelector('main').hidden = true;
  document.querySelector('.site-footer').hidden = true;
}
