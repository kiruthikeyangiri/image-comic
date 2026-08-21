/**
 * GPT Image 2 Web Studio - Frontend Application Logic
 * Multi-Provider support: Free FLUX, Hugging Face, and OpenAI GPT-Image-2
 */

let currentProvider = 'free-flux';
let currentSize = '1k';
let currentCategory = 'all';
let allGalleryCategories = [];
let uploadedRefFiles = [];
let isDrawing = false;
let brushRadius = 25;
let maskCanvas, maskCtx, baseImagePreview;

document.addEventListener('DOMContentLoaded', () => {
  initApiConfig();
  initCanvas();
  loadGalleries();
  loadHistory();
});

/* ========================================================================= */
/* Provider & Key Configuration                                              */
/* ========================================================================= */

function selectProvider(providerId, btn) {
  currentProvider = providerId;
  document.querySelectorAll('.provider-btn').forEach(b => {
    b.className = 'provider-btn px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700 flex flex-col items-center justify-center space-y-0.5 transition';
  });

  if (providerId === 'free-flux') {
    btn.className = 'provider-btn active px-2.5 py-2 rounded-xl bg-emerald-600/90 text-white text-xs font-medium border border-emerald-500 flex flex-col items-center justify-center space-y-0.5 transition shadow-lg shadow-emerald-600/20';
    showToast('Switched to 100% Free FLUX.1 Engine!', 'info');
  } else if (providerId === 'huggingface') {
    btn.className = 'provider-btn active px-2.5 py-2 rounded-xl bg-amber-600/90 text-white text-xs font-medium border border-amber-500 flex flex-col items-center justify-center space-y-0.5 transition shadow-lg shadow-amber-600/20';
    showToast('Switched to Hugging Face FLUX.1 Schnell', 'info');
  } else {
    btn.className = 'provider-btn active px-2.5 py-2 rounded-xl bg-brand-600/90 text-white text-xs font-medium border border-brand-500 flex flex-col items-center justify-center space-y-0.5 transition shadow-lg shadow-brand-600/20';
    showToast('Switched to OpenAI GPT-Image-2', 'info');
  }
}

async function initApiConfig() {
  const savedHf = localStorage.getItem('hf_token');
  const savedOpenai = localStorage.getItem('openai_api_key');
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
  } catch (err) {
    console.error('Config fetch failed:', err);
  }
}

function openSettingsModal() {
  const modal = document.getElementById('settingsModal');
  document.getElementById('modalApiKeyInput').value = localStorage.getItem('openai_api_key') || '';
  document.getElementById('modalHfTokenInput').value = localStorage.getItem('hf_token') || '';
  modal.classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

function saveApiKeys() {
  const openAiKey = document.getElementById('modalApiKeyInput').value.trim();
  const hfToken = document.getElementById('modalHfTokenInput').value.trim();

  if (openAiKey) localStorage.setItem('openai_api_key', openAiKey);
  else localStorage.removeItem('openai_api_key');

  if (hfToken) localStorage.setItem('hf_token', hfToken);
  else localStorage.removeItem('hf_token');

  showToast('Settings saved successfully!', 'success');
  closeSettingsModal();
}

function getStoredApiKey() {
  return localStorage.getItem('openai_api_key') || null;
}

function getStoredHfToken() {
  return localStorage.getItem('hf_token') || null;
}

/* ========================================================================= */
/* Tab Navigation                                                            */
/* ========================================================================= */

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.className = 'tab-btn px-4 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all';
  });

  const activeContent = document.getElementById(`tab-${tabId}`);
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);

  if (activeContent) activeContent.classList.remove('hidden');
  if (activeBtn) {
    activeBtn.className = 'tab-btn px-4 py-1.5 rounded-lg text-xs font-medium transition-all bg-brand-600 text-white shadow-md shadow-brand-600/30';
  }

  if (tabId === 'history') {
    loadHistory();
  }
}

/* ========================================================================= */
/* Generation Studio                                                         */
/* ========================================================================= */

function selectSize(sizeKey, btn) {
  currentSize = sizeKey;
  document.querySelectorAll('.size-btn').forEach(b => {
    b.className = 'size-btn px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700/80 flex flex-col items-center justify-center space-y-1 transition';
  });
  btn.className = 'size-btn active px-2.5 py-2 rounded-xl bg-brand-600 text-white text-xs font-medium border border-brand-500 flex flex-col items-center justify-center space-y-1 transition';
  
  const sizeMap = {
    '1k': '1024x1024 (1k)',
    'portrait': '1024x1536 (Portrait)',
    'landscape': '1536x1024 (Landscape)',
    'wide': '2048x1152 (Widescreen)',
  };
  document.getElementById('activeSizeLabel').textContent = sizeMap[sizeKey] || sizeKey;
}

function appendPrompt(text) {
  const promptArea = document.getElementById('genPrompt');
  if (promptArea.value.trim().length > 0) {
    promptArea.value += `, ${text}`;
  } else {
    promptArea.value = text;
  }
  promptArea.focus();
}

function clearPrompt() {
  document.getElementById('genPrompt').value = '';
}

async function submitGenerate() {
  const prompt = document.getElementById('genPrompt').value.trim();
  if (!prompt) {
    showToast('Please enter a prompt description first.', 'warning');
    return;
  }

  const quality = document.getElementById('genQuality').value;
  const count = parseInt(document.getElementById('genCount').value, 10);
  const apiKey = getStoredApiKey();
  const hfToken = getStoredHfToken();

  const btn = document.getElementById('btnGenerate');
  const emptyState = document.getElementById('emptyState');
  const loadingState = document.getElementById('loadingState');
  const resultsGrid = document.getElementById('resultsGrid');
  const renderStatus = document.getElementById('renderStatusText');
  const subtext = document.getElementById('loadingSubtext');

  btn.disabled = true;
  btn.classList.add('opacity-50', 'cursor-not-allowed');
  emptyState.classList.add('hidden');
  resultsGrid.classList.add('hidden');
  loadingState.classList.remove('hidden');
  renderStatus.textContent = 'Generating...';

  if (currentProvider === 'free-flux') subtext.textContent = 'Rendering with Free FLUX.1 Engine...';
  else if (currentProvider === 'huggingface') subtext.textContent = 'Connecting to Hugging Face Inference...';
  else subtext.textContent = 'Calling OpenAI GPT-Image-2...';

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: prompt,
        provider: currentProvider,
        size: currentSize,
        quality: quality,
        n: count,
        apiKey: apiKey,
        hfToken: hfToken,
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Generation failed');
    }

    renderGeneratedImages(data.images, resultsGrid);
    showToast(`Generated ${data.images.length} image(s) successfully!`, 'success');
    renderStatus.textContent = 'Done';
  } catch (err) {
    showToast(err.message, 'error');
    emptyState.classList.remove('hidden');
    renderStatus.textContent = 'Error';
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'cursor-not-allowed');
    loadingState.classList.add('hidden');
  }
}

function renderGeneratedImages(images, container) {
  container.innerHTML = '';
  images.forEach(img => {
    const card = document.createElement('div');
    card.className = 'glass-card p-3 rounded-xl border border-slate-700/80 flex flex-col space-y-2 w-full max-w-sm group transition hover:border-emerald-500/50';
    card.innerHTML = `
      <div class="relative overflow-hidden rounded-lg bg-slate-950 aspect-square flex items-center justify-center cursor-pointer" onclick="openLightbox('${img.url}')">
        <img src="${img.url}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
        <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center space-x-2 transition">
          <button class="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs backdrop-blur-sm"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
        </div>
      </div>
      <div class="flex items-center justify-between pt-1">
        <div>
          <span class="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60">${img.provider || 'AI'}</span>
          <span class="text-[11px] text-slate-400 font-mono ml-1 truncate max-w-[120px] inline-block align-middle">${img.filename}</span>
        </div>
        <div class="flex space-x-1">
          <button onclick="copyToClipboard('${img.prompt.replace(/'/g, "\\'")}')" title="Copy Prompt" class="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition">
            <i class="fa-regular fa-copy"></i>
          </button>
          <a href="${img.url}" download="${img.filename}" title="Download Image" class="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-emerald-400 text-xs transition">
            <i class="fa-solid fa-download"></i>
          </a>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
  container.classList.remove('hidden');
}

/* ========================================================================= */
/* Image Edit & Inpainting Studio                                            */
/* ========================================================================= */

function initCanvas() {
  maskCanvas = document.getElementById('maskCanvas');
  baseImagePreview = document.getElementById('baseImagePreview');
  if (!maskCanvas) return;

  maskCtx = maskCanvas.getContext('2d');

  function startPosition(e) {
    isDrawing = true;
    draw(e);
  }

  function endPosition() {
    isDrawing = false;
    maskCtx.beginPath();
  }

  function draw(e) {
    if (!isDrawing) return;
    const rect = maskCanvas.getBoundingClientRect();
    const scaleX = maskCanvas.width / rect.width;
    const scaleY = maskCanvas.height / rect.height;

    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    maskCtx.lineWidth = brushRadius * 2;
    maskCtx.lineCap = 'round';
    maskCtx.strokeStyle = 'rgba(236, 72, 153, 0.6)';

    maskCtx.lineTo(x, y);
    maskCtx.stroke();
    maskCtx.beginPath();
    maskCtx.moveTo(x, y);
  }

  maskCanvas.addEventListener('mousedown', startPosition);
  maskCanvas.addEventListener('mouseup', endPosition);
  maskCanvas.addEventListener('mousemove', draw);
  maskCanvas.addEventListener('mouseleave', endPosition);

  maskCanvas.addEventListener('touchstart', startPosition);
  maskCanvas.addEventListener('touchend', endPosition);
  maskCanvas.addEventListener('touchmove', draw);
}

function updateBrushSize(val) {
  brushRadius = parseInt(val, 10);
}

function clearMaskCanvas() {
  if (maskCtx && maskCanvas) {
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  }
}

function handleRefImageSelect(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;

  uploadedRefFiles = files;
  document.getElementById('refCountLabel').textContent = `${files.length} image(s)`;

  const thumbsContainer = document.getElementById('refThumbnails');
  thumbsContainer.innerHTML = '';

  files.forEach((f, idx) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.className = 'w-12 h-12 object-cover rounded-lg border border-slate-700';
      thumbsContainer.appendChild(img);

      if (idx === 0) {
        setupBaseImage(e.target.result);
      }
    };
    reader.readAsDataURL(f);
  });
}

function setupBaseImage(src) {
  const wrapper = document.getElementById('maskCanvasWrapper');
  const empty = document.getElementById('editEmptyState');
  baseImagePreview.src = src;
  baseImagePreview.onload = () => {
    wrapper.classList.remove('hidden');
    empty.classList.add('hidden');
    maskCanvas.width = baseImagePreview.naturalWidth || 1024;
    maskCanvas.height = baseImagePreview.naturalHeight || 1024;
    clearMaskCanvas();
  };
}

function clearEditInputs() {
  uploadedRefFiles = [];
  document.getElementById('refImageInput').value = '';
  document.getElementById('editPrompt').value = '';
  document.getElementById('refThumbnails').innerHTML = '';
  document.getElementById('refCountLabel').textContent = '0 images';
  document.getElementById('maskCanvasWrapper').classList.add('hidden');
  document.getElementById('editEmptyState').classList.remove('hidden');
  document.getElementById('editResultGrid').classList.add('hidden');
  clearMaskCanvas();
}

async function submitEdit() {
  const prompt = document.getElementById('editPrompt').value.trim();
  if (!prompt) {
    showToast('Please provide an edit instruction.', 'warning');
    return;
  }
  if (!uploadedRefFiles.length) {
    showToast('Please upload at least one reference image.', 'warning');
    return;
  }

  const btn = document.getElementById('btnEdit');
  const loading = document.getElementById('editLoadingState');
  const resultGrid = document.getElementById('editResultGrid');
  const status = document.getElementById('editStatusText');

  btn.disabled = true;
  btn.classList.add('opacity-50');
  loading.classList.remove('hidden');
  resultGrid.classList.add('hidden');
  status.textContent = 'Editing...';

  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('size', '1024x1024');
  formData.append('quality', 'high');
  formData.append('n', 1);

  const apiKey = getStoredApiKey();
  if (apiKey) formData.append('apiKey', apiKey);

  uploadedRefFiles.forEach(f => formData.append('images', f));

  // Check if mask was drawn
  const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
  let hasMask = false;
  for (let i = 3; i < maskData.length; i += 4) {
    if (maskData[i] > 0) {
      hasMask = true;
      break;
    }
  }

  if (hasMask) {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = maskCanvas.width;
    exportCanvas.height = maskCanvas.height;
    const expCtx = exportCanvas.getContext('2d');
    
    expCtx.fillStyle = '#FFFFFF';
    expCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    
    expCtx.globalCompositeOperation = 'destination-out';
    expCtx.drawImage(maskCanvas, 0, 0);

    const maskBlob = await new Promise(resolve => exportCanvas.toBlob(resolve, 'image/png'));
    formData.append('mask', maskBlob, 'mask.png');
  }

  try {
    const res = await fetch('/api/edit', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Edit operation failed');

    renderGeneratedImages(data.images, resultGrid);
    showToast('Image edit completed successfully!', 'success');
    status.textContent = 'Done';
  } catch (err) {
    showToast(err.message, 'error');
    status.textContent = 'Error';
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-50');
    loading.classList.add('hidden');
  }
}

/* ========================================================================= */
/* Prompt Gallery Explorer                                                   */
/* ========================================================================= */

async function loadGalleries() {
  try {
    const res = await fetch('/api/galleries');
    const data = await res.json();
    allGalleryCategories = data.categories || [];
    renderGalleryPills();
    renderGalleryItems();
  } catch (err) {
    console.error('Failed to load galleries:', err);
  }
}

function renderGalleryPills() {
  const pillsContainer = document.getElementById('galleryCategoryPills');
  pillsContainer.innerHTML = `
    <button onclick="selectCategory('all', this)" class="category-pill active px-3 py-1 rounded-full text-xs font-medium bg-brand-600 text-white border border-brand-500 transition">
      All Categories
    </button>
  `;

  allGalleryCategories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-pill px-3 py-1 rounded-full text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 transition';
    btn.textContent = `${cat.name} (${cat.count})`;
    btn.onclick = () => selectCategory(cat.id, btn);
    pillsContainer.appendChild(btn);
  });
}

function selectCategory(catId, btn) {
  currentCategory = catId;
  document.querySelectorAll('.category-pill').forEach(b => {
    b.className = 'category-pill px-3 py-1 rounded-full text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 transition';
  });
  btn.className = 'category-pill active px-3 py-1 rounded-full text-xs font-medium bg-brand-600 text-white border border-brand-500 transition';
  renderGalleryItems();
}

function filterGallery(query) {
  renderGalleryItems(query.toLowerCase().trim());
}

function renderGalleryItems(filterText = '') {
  const container = document.getElementById('galleryItemsGrid');
  container.innerHTML = '';

  let itemsToDisplay = [];
  allGalleryCategories.forEach(cat => {
    if (currentCategory === 'all' || currentCategory === cat.id) {
      cat.items.forEach(item => {
        if (!filterText || item.title.toLowerCase().includes(filterText) || item.prompt.toLowerCase().includes(filterText)) {
          itemsToDisplay.push({ ...item, categoryName: cat.name });
        }
      });
    }
  });

  if (!itemsToDisplay.length) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 text-slate-500 text-sm">
        No prompt recipes found matching your search.
      </div>
    `;
    return;
  }

  itemsToDisplay.forEach(item => {
    const card = document.createElement('div');
    card.className = 'glass-card p-4 rounded-2xl border border-slate-800 hover:border-brand-500/50 flex flex-col justify-between space-y-3 transition duration-200 group';
    
    let imgBlock = '';
    if (item.imageUrl) {
      imgBlock = `
        <div class="relative overflow-hidden rounded-xl bg-slate-950 aspect-video mb-1">
          <img src="${item.imageUrl}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" onerror="this.parentElement.style.display='none'" />
        </div>
      `;
    }

    card.innerHTML = `
      <div>
        ${imgBlock}
        <div class="flex items-center justify-between mb-1.5">
          <h4 class="text-xs font-bold text-slate-200 line-clamp-1">${item.title}</h4>
          <span class="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">${item.categoryName}</span>
        </div>
        <p class="text-xs text-slate-400 line-clamp-3 leading-relaxed font-mono bg-slate-950/50 p-2 rounded-lg border border-slate-800/80">${item.prompt}</p>
      </div>
      <div class="flex items-center space-x-2 pt-2 border-t border-slate-800/60">
        <button onclick="usePromptInStudio('${item.prompt.replace(/'/g, "\\'")}')" class="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center justify-center space-x-1.5 transition">
          <i class="fa-solid fa-wand-magic-sparkles text-[10px]"></i>
          <span>Use Prompt</span>
        </button>
        <button onclick="copyToClipboard('${item.prompt.replace(/'/g, "\\'")}')" title="Copy Prompt" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition">
          <i class="fa-regular fa-copy"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function usePromptInStudio(promptText) {
  document.getElementById('genPrompt').value = promptText;
  switchTab('generate');
  showToast('Prompt loaded into Studio!', 'info');
}

/* ========================================================================= */
/* History Gallery                                                           */
/* ========================================================================= */

async function loadHistory() {
  const container = document.getElementById('historyGrid');
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    container.innerHTML = '';

    if (!data.history || !data.history.length) {
      container.innerHTML = `
        <div class="col-span-full text-center py-12 text-slate-500 text-sm">
          No generated images yet.
        </div>
      `;
      return;
    }

    data.history.forEach(item => {
      const card = document.createElement('div');
      card.className = 'glass-card p-2 rounded-xl border border-slate-800 flex flex-col space-y-2 group';
      card.innerHTML = `
        <div class="relative overflow-hidden rounded-lg bg-slate-950 aspect-square cursor-pointer" onclick="openLightbox('${item.url}')">
          <img src="${item.url}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
        </div>
        <div class="flex items-center justify-between text-[11px] text-slate-400 px-1">
          <span class="truncate max-w-[100px]">${item.filename}</span>
          <a href="${item.url}" download="${item.filename}" class="hover:text-emerald-400"><i class="fa-solid fa-download"></i></a>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error('History load failed:', err);
  }
}

/* ========================================================================= */
/* Lightbox & Utility Toast                                                  */
/* ========================================================================= */

function openLightbox(url) {
  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImage');
  const btn = document.getElementById('lightboxDownloadBtn');
  img.src = url;
  btn.href = url;
  modal.classList.remove('hidden');
}

function closeLightbox(e) {
  if (e.target.id === 'lightboxModal') {
    closeLightboxDirect();
  }
}

function closeLightboxDirect() {
  document.getElementById('lightboxModal').classList.add('hidden');
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Prompt copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Failed to copy to clipboard.', 'error');
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');

  const typeStyles = {
    success: 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200',
    warning: 'bg-amber-950/90 border-amber-500/50 text-amber-200',
    error: 'bg-rose-950/90 border-rose-500/50 text-rose-200',
    info: 'bg-slate-900/90 border-slate-700 text-slate-200',
  };

  const icons = {
    success: 'fa-circle-check text-emerald-400',
    warning: 'fa-triangle-exclamation text-amber-400',
    error: 'fa-circle-exclamation text-rose-400',
    info: 'fa-circle-info text-emerald-400',
  };

  toast.className = `p-3.5 rounded-xl border backdrop-blur-md shadow-2xl flex items-center space-x-3 text-xs transition duration-300 ${typeStyles[type] || typeStyles.info}`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info} text-sm"></i>
    <span class="flex-1 font-medium">${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
