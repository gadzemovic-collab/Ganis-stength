// Exercise image overrides are independent of existing app data and progress photos.
(() => {
  'use strict';

  const catalog = fetch('exercise-images/catalog.json')
    .then(response => response.ok ? response.json() : {})
    .catch(() => ({}));
  const placeholder = 'exercise-images/placeholder.svg';
  let database;
  let current;
  let sourceImage;
  let sourceBlob;
  let previewBlob;
  let rotation = 0;
  let generation = 0;
  let previewGeneration = 0;
  const thumbnailURLs = new Map();

  function openDatabase() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('rep-harbor-exercise-images', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('images');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    }).catch(error => {
      database = null;
      throw error;
    });
    return database;
  }

  async function transaction(mode, operation) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('images', mode);
      const request = operation(tx.objectStore('images'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || new Error('Image storage was interrupted'));
    });
  }

  const read = key => transaction('readonly', store => store.get(key));
  const save = (key, image) => transaction('readwrite', store => store.put(image, key));
  const remove = key => transaction('readwrite', store => store.delete(key));
  const $ = id => document.getElementById(id);
  const dialog = () => $('exerciseImageDialog');
  const status = message => { $('exerciseImageStatus').textContent = message; };
  const controlIDs = ['exerciseImageZoom', 'exerciseImageX', 'exerciseImageY'];
  const getTransform = () => [...controlIDs.map(id => Number($(id).value)), rotation];

  function setTransform([zoom, x, y, angle] = [1, 0, 0, 0]) {
    [zoom, x, y].forEach((value, index) => { $(controlIDs[index]).value = value; });
    rotation = angle;
  }

  async function getDefault(group, name) {
    return (BASE_MENU[group]?.includes(name) && (await catalog)[name]) || null;
  }

  function setThumbnail(button, file, blob) {
    const old = thumbnailURLs.get(button);
    if (old) URL.revokeObjectURL(old);
    thumbnailURLs.delete(button);
    const url = blob && URL.createObjectURL(blob);
    if (url) thumbnailURLs.set(button, url);
    button.querySelector('img').src = url || file || placeholder;
  }

  function renderThumbnails() {
    for (const [button, url] of thumbnailURLs) {
      if (!button.isConnected) {
        URL.revokeObjectURL(url);
        thumbnailURLs.delete(button);
      }
    }
    for (const button of document.querySelectorAll('[data-exercise-image]')) {
      const { exerciseImage: name, imageGroup: group } = button.dataset;
      const key = JSON.stringify([group, name]);
      Promise.all([getDefault(group, name), read(key).catch(() => null)]).then(([asset, saved]) => {
        if (button.isConnected) setThumbnail(button, saved?.deleted ? null : asset?.file, saved?.preview);
      });
    }
  }

  function setPreview(url) {
    const image = $('exerciseImagePreview');
    if (image.dataset.objectUrl) URL.revokeObjectURL(image.dataset.objectUrl);
    delete image.dataset.objectUrl;
    if (url.startsWith('blob:')) image.dataset.objectUrl = url;
    image.src = url;
  }

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image preview unavailable')), 'image/jpeg', 0.85);
    });
  }

  async function decode(blob) {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    try {
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function renderPreview() {
    if (!sourceImage) return;
    const request = ++previewGeneration;
    const canvas = $('exerciseImageCanvas');
    const context = canvas.getContext('2d');
    const [zoom, x, y, angle] = getTransform();
    const { width, height } = canvas;
    const turned = angle % 180 !== 0;
    const sourceWidth = sourceImage.naturalWidth;
    const sourceHeight = sourceImage.naturalHeight;
    const scale = Math.max(width / (turned ? sourceHeight : sourceWidth),
      height / (turned ? sourceWidth : sourceHeight)) * zoom;
    const excessX = (turned ? sourceHeight : sourceWidth) * scale - width;
    const excessY = (turned ? sourceWidth : sourceHeight) * scale - height;
    context.resetTransform();
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.translate(width / 2 + x * excessX / 200, height / 2 + y * excessY / 200);
    context.rotate(angle * Math.PI / 180);
    context.scale(scale, scale);
    context.drawImage(sourceImage, -sourceWidth / 2, -sourceHeight / 2);
    canvas.hidden = false;
    $('exerciseImagePreview').hidden = true;
    previewBlob = null;
    $('exerciseImageSave').disabled = true;
    const blob = await canvasBlob(canvas);
    if (request === previewGeneration && dialog().open) {
      previewBlob = blob;
      $('exerciseImageSave').disabled = false;
    }
  }

  async function show(button) {
    const { exerciseImage: name, imageGroup: group } = button.dataset;
    const key = JSON.stringify([group, name]);
    const request = ++generation;
    ++previewGeneration;
    current = { key, name };
    sourceImage = sourceBlob = previewBlob = null;
    const image = $('exerciseImagePreview');
    image.alt = 'Exercise demonstration for ' + name;
    image.hidden = false;
    $('exerciseImageCanvas').hidden = true;
    $('exerciseImageEditor').hidden = true;
    $('exerciseImageSave').disabled = true;
    $('exerciseImageFile').value = '';
    $('exerciseImageTitle').textContent = name;
    $('exerciseImageEdit').hidden = true;
    $('exerciseImageDelete').disabled = true;
    $('exerciseImageRestore').disabled = true;
    setPreview(placeholder);
    status('Loading image…');
    if (!dialog().open) dialog().showModal();
    try {
      const [asset, saved] = await Promise.all([getDefault(group, name), read(key)]);
      if (request !== generation) return;
      current.asset = asset;
      $('exerciseImageDelete').disabled = saved?.deleted || !(asset || saved?.preview);
      $('exerciseImageRestore').disabled = !saved;
      if (saved?.preview) {
        setPreview(URL.createObjectURL(saved.preview));
        status('Your saved image.');
      } else if (asset && !saved?.deleted) {
        setPreview(asset.file);
        status('Demonstration: ' + asset.label);
      } else {
        status('No demonstration image. You can upload one.');
      }
        $('exerciseImageEdit').hidden = !saved?.source;
      current.saved = saved;
    } catch (error) {
      if (request === generation) {
        const asset = await getDefault(group, name);
        if (request !== generation) return;
        setPreview(asset?.file || placeholder);
        status('Image storage is unavailable. You can still view bundled demonstrations.');
      }
    }
  }

  async function loadEditor(blob, transform) {
    const request = generation;
    const image = await decode(blob);
    if (request !== generation || !dialog().open) return;
    sourceImage = image;
    sourceBlob = blob;
    setTransform(transform);
    $('exerciseImageEditor').hidden = false;
    await renderPreview();
  }

  function report(error) {
    console.error('Rep Harbor exercise image:', error);
    status('The image could not be processed or saved. Try a smaller image or check device storage.');
  }

  function reopenCurrent(key) {
    const button = Array.from(document.querySelectorAll('[data-exercise-image]')).find(item =>
      JSON.stringify([item.dataset.imageGroup, item.dataset.exerciseImage]) === key);
    if (button && current?.key === key && dialog().open) return show(button);
  }

  async function changeSavedImage(action) {
    if (!current) return;
    const key = current.key;
    const controls = Array.from(dialog().querySelectorAll('button, input'));
    const enabled = controls.filter(control => !control.disabled);
    enabled.forEach(control => { control.disabled = true; });
    try {
      await action(key);
      enabled.forEach(control => { control.disabled = false; });
      renderThumbnails();
      await reopenCurrent(key);
    } catch (error) {
      enabled.forEach(control => { control.disabled = false; });
      report(error);
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-exercise-image]');
    if (!button) return;
    event.preventDefault();
    show(button);
  });
  document.addEventListener('DOMContentLoaded', () => {
    renderThumbnails();
    $('exerciseImageFile').addEventListener('change', async event => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type) || file.size > 15 * 1024 * 1024) {
        status('Choose a JPEG, PNG, WebP, GIF, or AVIF image up to 15 MB.');
        return;
      }
      const request = generation;
      try {
        const decoded = await decode(file);
        if (request !== generation) return;
        if (decoded.naturalWidth * decoded.naturalHeight > 60_000_000) throw new Error("Image dimensions are too large");
        const scale = Math.min(1, 1600 / Math.max(decoded.naturalWidth, decoded.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(decoded.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(decoded.naturalHeight * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(decoded, 0, 0, canvas.width, canvas.height);
        const source = await canvasBlob(canvas);
        if (request === generation) await loadEditor(source);
      } catch (error) { if (request === generation) report(error); }
    });
    for (const id of controlIDs) $(id).addEventListener('input', () => renderPreview().catch(report));
    $('exerciseImageRotate').addEventListener('click', () => {
      rotation = (rotation + 90) % 360;
      renderPreview().catch(report);
    });
    $('exerciseImageEdit').addEventListener('click', () => {
      if (current?.saved?.source) loadEditor(current.saved.source, current.saved.transform).catch(report);
    });
    $('exerciseImageSave').addEventListener('click', () => {
      if (!previewBlob || !sourceBlob) return;
      const image = { source: sourceBlob, preview: previewBlob, transform: getTransform() };
      changeSavedImage(key => save(key, image));
    });
    $('exerciseImageDelete').addEventListener('click', () => {
      if (confirm('Delete or hide this exercise image?')) {
        const hasDefault = Boolean(current?.asset);
        changeSavedImage(key => hasDefault ? save(key, { deleted: true }) : remove(key));
      }
    });
    $('exerciseImageRestore').addEventListener('click', () => {
      if (confirm('Discard your image changes and restore the default?')) changeSavedImage(remove);
    });
    dialog().addEventListener('close', () => {
      ++generation;
      ++previewGeneration;
      current = sourceImage = sourceBlob = previewBlob = null;
      setPreview(placeholder);
    });
  });
  window.renderExerciseThumbnails = renderThumbnails;
})();
