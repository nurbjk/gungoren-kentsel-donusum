// ============================================
// GÜNGÖREN BELEDİYESİ - PROJE TAKİP SİSTEMİ
// ============================================

// ===== VERİ DEPOLAMA =====
let projects = JSON.parse(localStorage.getItem('projects')) || [];
let tasks    = JSON.parse(localStorage.getItem('tasks'))    || [];
let personnel = JSON.parse(localStorage.getItem('personnel')) || [];

function save() {
  localStorage.setItem('projects',  JSON.stringify(projects));
  localStorage.setItem('tasks',     JSON.stringify(tasks));
  localStorage.setItem('personnel', JSON.stringify(personnel));
}

// ===== SAYFA GEÇİŞLERİ =====
function navigate(page) {
  // Tüm sayfaları kapat
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Seçili sayfayı aç
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector('[onclick="navigate(\'' + page + '\')"]').classList.add('active');

  // Sayfayı yenile
  if (page === 'dashboard')  renderDashboard();
  if (page === 'projects')   renderProjects();
  if (page === 'tasks')      renderTasks();
  if (page === 'personnel')  renderPersonnel();
  if (page === 'reports')    renderReports();
}

// ===== MODAL AÇ / KAPAT =====
function openModal(id) {
  if (id === 'task-modal') fillProjectDropdown();
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  // Formu sıfırla
  const form = document.querySelector('#' + id + ' form');
  if (form) form.reset();
  document.getElementById('prog-val') && (document.getElementById('prog-val').textContent = '0');
}

// Modal dışına tıklayınca kapat
document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
});

// ===== TOAST BİLDİRİM =====
function toast(msg, type = 'success') {
  const box = document.getElementById('toast-box');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ===== YARDIMCI FONKSİYONLAR =====
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return d + '.' + m + '.' + y;
}

function formatMoney(n) {
  if (!n) return '-';
  return Number(n).toLocaleString('tr-TR') + ' ₺';
}

function getBadgeClass(status) {
  const map = {
    'Planlama':      'badge-planlama',
    'Devam Ediyor':  'badge-devam',
    'Tamamlandı':    'badge-tamamlandi',
    'Askıya Alındı': 'badge-askiya',
    'İptal':         'badge-iptal'
  };
  return map[status] || 'badge-planlama';
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ===== DASHBOARD =====
function renderDashboard() {
  const total   = projects.length;
  const done    = projects.filter(p => p.status === 'Tamamlandı').length;
  const ongoing = projects.filter(p => p.status === 'Devam Ediyor').length;
  
  // Geciken: bitiş tarihi geçmiş ve tamamlanmamış
  const today = new Date().toISOString().split('T')[0];
  const delayed = projects.filter(p => p.end < today && p.status !== 'Tamamlandı').length;

  document.getElementById('kpi-total').textContent   = total;
  document.getElementById('kpi-done').textContent    = done;
  document.getElementById('kpi-ongoing').textContent = ongoing;
  document.getElementById('kpi-delayed').textContent = delayed;

  // Son 5 proje
  const list = document.getElementById('recent-list');
  const recent = [...projects].reverse().slice(0, 5);

  if (recent.length === 0) {
    list.innerHTML = '<p class="empty"><p>Henüz proje yok.</p></p>';
    return;
  }

  list.innerHTML = recent.map(p => `
    <div class="recent-item">
      <div>
        <div class="recent-name">${p.name}</div>
        <div style="font-size:0.75rem;color:#64748b;">${p.type} • ${p.location || '-'}</div>
      </div>
      <span class="badge ${getBadgeClass(p.status)}">${p.status}</span>
    </div>
  `).join('');
}

// ===== PROJELER =====
function renderProjects() {
  const grid  = document.getElementById('projects-list');
  const empty = document.getElementById('projects-list');

  if (projects.length === 0) {
    grid.innerHTML = `
      <div class="empty" style="grid-column:1/-1;">
        <p style="font-size:3rem;">🏗️</p>
        <p><strong>Henüz proje yok</strong></p>
        <p>Yeni proje ekleyerek başlayın</p>
        <br>
        <button class="btn-primary" onclick="openModal('project-modal')">+ İlk Projeyi Ekle</button>
      </div>`;
    return;
  }

  grid.innerHTML = projects.map(p => `
    <div class="project-card">
      <div class="project-card-top">
        <div>
          <div class="project-name">${p.name}</div>
          <div class="project-code">${p.code || 'Kod yok'}</div>
        </div>
        <span class="badge ${getBadgeClass(p.status)}">${p.status}</span>
      </div>
      <span class="project-type-tag">📁 ${p.type}</span>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${p.progress || 0}%"></div>
      </div>
      <div class="progress-text">%${p.progress || 0} tamamlandı</div>
      <div class="project-meta">
        <span>📅 ${formatDate(p.start)}</span>
        <span>🏁 ${formatDate(p.end)}</span>
        <span>💰 ${formatMoney(p.budget)}</span>
      </div>
      ${p.manager ? `<div style="font-size:0.78rem;color:#64748b;margin-top:8px;">👷 ${p.manager}</div>` : ''}
      ${p.location ? `<div style="font-size:0.78rem;color:#64748b;">📍 ${p.location}</div>` : ''}
      <div class="project-actions">
        <button class="btn-edit" onclick="editProject('${p.id}')">✏️ Düzenle</button>
        <button class="btn-del"  onclick="deleteProject('${p.id}')">🗑️ Sil</button>
      </div>
    </div>
  `).join('');
}

// Proje Kaydet
function saveProject(e) {
  e.preventDefault();

  const id = document.getElementById('p-id').value;

  const project = {
    id:       id || uid(),
    name:     document.getElementById('p-name').value,
    code:     document.getElementById('p-code').value,
    desc:     document.getElementById('p-desc').value,
    type:     document.getElementById('p-type').value,
    status:   document.getElementById('p-status').value,
    start:    document.getElementById('p-start').value,
    end:      document.getElementById('p-end').value,
    budget:   document.getElementById('p-budget').value,
    progress: document.getElementById('p-progress').value,
    manager:  document.getElementById('p-manager').value,
    location: document.getElementById('p-location').value,
  };

  if (id) {
    // Düzenleme
    const idx = projects.findIndex(p => p.id === id);
    projects[idx] = project;
    toast('✅ Proje güncellendi!');
  } else {
    // Yeni ekleme
    projects.push(project);
    toast('✅ Proje eklendi!');
  }

  save();
  closeModal('project-modal');
  renderProjects();
  renderDashboard();
}

// Proje Düzenle
function editProject(id) {
  const p = projects.find(p => p.id === id);
  if (!p) return;

  document.getElementById('p-id').value       = p.id;
  document.getElementById('p-name').value     = p.name;
  document.getElementById('p-code').value     = p.code || '';
  document.getElementById('p-desc').value     = p.desc || '';
  document.getElementById('p-type').value     = p.type;
  document.getElementById('p-status').value   = p.status;
  document.getElementById('p-start').value    = p.start || '';
  document.getElementById('p-end').value      = p.end || '';
  document.getElementById('p-budget').value   = p.budget || '';
  document.getElementById('p-progress').value = p.progress || 0;
  document.getElementById('prog-val').textContent = p.progress || 0;
  document.getElementById('p-manager').value  = p.manager || '';
  document.getElementById('p-location').value = p.location || '';

  openModal('project-modal');
}

// Proje Sil
function deleteProject(id) {
  if (!confirm('Bu projeyi silmek istediğinizden emin misiniz?')) return;
  projects = projects.filter(p => p.id !== id);
  save();
  renderProjects();
  renderDashboard();
  toast('🗑️ Proje silindi.', 'info');
}

// ===== GÖREVLER (KANBAN) =====
function fillProjectDropdown() {
  const sel = document.getElementById('t-project');
  sel.innerHTML = '<option value="">-- Proje Seç --</option>';
  projects.forEach(p => {
    sel.innerHTML += `<option value="${p.id}">${p.name}</option>`;
  });
}

function renderTasks() {
  ['bekliyor', 'devam', 'tamam'].forEach(col => {
    document.getElementById('col-' + col).innerHTML = '';
  });

  tasks.forEach(t => {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.draggable = true;
    card.id = 'task-' + t.id;

    const proj = projects.find(p => p.id === t.project);
    const priClass = 'pri-' + (t.priority || 'orta').toLowerCase();

    card.innerHTML = `
      <div class="kanban-card-title">${t.title}</div>
      <div class="kanban-card-info">
        ${proj ? '📁 ' + proj.name : ''}
        ${t.assignee ? ' • 👷 ' + t.assignee : ''}
        ${t.due ? '<br>📅 ' + formatDate(t.due) : ''}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
        <span class="priority-badge ${priClass}">${t.priority || 'Orta'}</span>
        <div>
          <button onclick="editTask('${t.id}')" style="background:none;border:none;cursor:pointer;color:#64748b;font-size:0.85rem;">✏️</button>
          <button onclick="deleteTask('${t.id}')" style="background:none;border:none;cursor:pointer;color:#64748b;font-size:0.85rem;">🗑️</button>
        </div>
      </div>
    `;

    card.addEventListener('dragstart', () => {
      card.style.opacity = '0.5';
      card.setAttribute('data-id', t.id);
    });
    card.addEventListener('dragend', () => card.style.opacity = '1');

    const colEl = document.getElementById('col-' + t.status);
    if (colEl) colEl.appendChild(card);
  });
}

// Sürükle-bırak
document.querySelectorAll('[id^="col-"]').forEach(col => {
  col.addEventListener('dragover', e => e.preventDefault());
  col.addEventListener('drop', e => {
    e.preventDefault();
    const id = document.querySelector('.kanban-card[style*="0.5"]')?.id?.replace('task-','');
    if (!id) return;
    const newStatus = col.id.replace('col-', '');
    const task = tasks.find(t => t.id === id);
    if (task) {
      task.status = newStatus;
      save();
      renderTasks();
      toast('✅ Görev taşındı!');
    }
  });
});

function saveTask(e) {
  e.preventDefault();
  const id = document.getElementById('t-id').value;

  const task = {
    id:       id || uid(),
    title:    document.getElementById('t-title').value,
    project:  document.getElementById('t-project').value,
    assignee: document.getElementById('t-assignee').value,
    status:   document.getElementById('t-status').value,
    priority: document.getElementById('t-priority').value,
    due:      document.getElementById('t-due').value,
  };

  if (id) {
    const idx = tasks.findIndex(t => t.id === id);
    tasks[idx] = task;
    toast('✅ Görev güncellendi!');
  } else {
    tasks.push(task);
    toast('✅ Görev eklendi!');
  }

  save();
  closeModal('task-modal');
  renderTasks();
}

function editTask(id) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  fillProjectDropdown();
  document.getElementById('t-id').value       = t.id;
  document.getElementById('t-title').value    = t.title;
  document.getElementById('t-project').value  = t.project || '';
  document.getElementById('t-assignee').value = t.assignee || '';
  document.getElementById('t-status').value   = t.status;
  document.getElementById('t-priority').value = t.priority || 'Orta';
  document.getElementById('t-due').value      = t.due || '';
  openModal('task-modal');
}

function deleteTask(id) {
  if (!confirm('Görevi silmek istediğinizden emin misiniz?')) return;
  tasks = tasks.filter(t => t.id !== id);
  save();
  renderTasks();
  toast('🗑️ Görev silindi.', 'info');
}

// ===== PERSONEL =====
function renderPersonnel() {
  const grid = document.getElementById('personnel-list');

  if (personnel.length === 0) {
    grid.innerHTML = `
      <div class="empty" style="grid-column:1/-1;">
        <p style="font-size:3rem;">👷</p>
        <p><strong>Henüz personel yok</strong></p>
        <br>
        <button class="btn-primary" onclick="openModal('personnel-modal')">+ Personel Ekle</button>
      </div>`;
    return;
  }

  grid.innerHTML = personnel.map(per => `
    <div class="personnel-card">
      <div class="avatar">${getInitials(per.name)}</div>
      <div class="personnel-name">${per.name}</div>
      <div class="personnel-title">${per.title}</div>
      <div class="personnel-dept">${per.dept || ''}</div>
      ${per.phone ? `<div style="font-size:0.78rem;color:#64748b;margin-top:4px;">📞 ${per.phone}</div>` : ''}
      ${per.email ? `<div style="font-size:0.78rem;color:#64748b;">✉️ ${per.email}</div>` : ''}
      <div class="personnel-actions">
        <button class="btn-edit" onclick="editPersonnel('${per.id}')">✏️ Düzenle</button>
        <button class="btn-del"  onclick="deletePersonnel('${per.id}')">🗑️ Sil</button>
      </div>
    </div>
  `).join('');
}

function savePersonnel(e) {
  e.preventDefault();
  const id = document.getElementById('per-id').value;

  const per = {
    id:    id || uid(),
    name:  document.getElementById('per-name').value,
    title: document.getElementById('per-title').value,
    dept:  document.getElementById('per-dept').value,
    phone: document.getElementById('per-phone').value,
    email: document.getElementById('per-email').value,
  };

  if (id) {
    const idx = personnel.findIndex(p => p.id === id);
    personnel[idx] = per;
    toast('✅ Personel güncellendi!');
  } else {
    personnel.push(per);
    toast('✅ Personel eklendi!');
  }

  save();
  closeModal('personnel-modal');
  renderPersonnel();
}

function editPersonnel(id) {
  const per = personnel.find(p => p.id === id);
  if (!per) return;
  document.getElementById('per-id').value    = per.id;
  document.getElementById('per-name').value  = per.name;
  document.getElementById('per-title').value = per.title;
  document.getElementById('per-dept').value  = per.dept || '';
  document.getElementById('per-phone').value = per.phone || '';
  document.getElementById('per-email').value = per.email || '';
  openModal('personnel-modal');
}

function deletePersonnel(id) {
  if (!confirm('Personeli silmek istediğinizden emin misiniz?')) return;
  personnel = personnel.filter(p => p.id !== id);
  save();
  renderPersonnel();
  toast('🗑️ Personel silindi.', 'info');
}

// ===== RAPORLAR =====
function renderReports() {
  const total   = projects.length;
  const done    = projects.filter(p => p.status === 'Tamamlandı').length;
  const ongoing = projects.filter(p => p.status === 'Devam Ediyor').length;
  const planned = projects.filter(p => p.status === 'Planlama').length;
  const today   = new Date().toISOString().split('T')[0];
  const delayed = projects.filter(p => p.end < today && p.status !== 'Tamamlandı').length;
  
  const totalBudget = projects.reduce((s, p) => s + (Number(p.budget) || 0), 0);
  const avgProgress = total ? Math.round(projects.reduce((s,p) => s + (Number(p.progress)||0), 0) / total) : 0;

  document.getElementById('report-content').innerHTML = `
    <div class="card">
      <h2>📊 Genel Özet</h2>
      <div class="report-stat"><span>Toplam Proje</span><span>${total}</span></div>
      <div class="report-stat"><span>Tamamlanan</span><span>${done}</span></div>
      <div class="report-stat"><span>Devam Eden</span><span>${ongoing}</span></div>
      <div class="report-stat"><span>Planlama Aşamasında</span><span>${planned}</span></div>
      <div class="report-stat"><span>Geciken</span><span>${delayed}</span></div>
      <div class="report-stat"><span>Ortalama İlerleme</span><span>%${avgProgress}</span></div>
      <div class="report-stat"><span>Toplam Bütçe</span><span>${formatMoney(totalBudget)}</span></div>
      <div class="report-stat"><span>Toplam Görev</span><span>${tasks.length}</span></div>
      <div class="report-stat"><span>Toplam Personel</span><span>${personnel.length}</span></div>
    </div>

    <div class="card" style="margin-top:20px;">
      <h2>📋 Tüm Projeler</h2>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
          <thead>
            <tr style="border-bottom:2px solid #334155;color:#94a3b8;">
              <th style="padding:10px;text-align:left;">Proje Adı</th>
              <th style="padding:10px;text-align:left;">Tür</th>
              <th style="padding:10px;text-align:left;">Durum</th>
              <th style="padding:10px;text-align:left;">İlerleme</th>
              <th style="padding:10px;text-align:left;">Bitiş</th>
              <th style="padding:10px;text-align:left;">Bütçe</th>
            </tr>
          </thead>
          <tbody>
            ${projects.length === 0 
              ? '<tr><td colspan="6" style="text-align:center;padding:20px;color:#64748b;">Proje yok</td></tr>'
              : projects.map(p => `
                <tr style="border-bottom:1px solid #334155;">
                  <td style="padding:10px;color:#f1f5f9;">${p.name}</td>
                  <td style="padding:10px;color:#94a3b8;">${p.type}</td>
                  <td style="padding:10px;"><span class="badge ${getBadgeClass(p.status)}">${p.status}</span></td>
                  <td style="padding:10px;color:#60a5fa;">%${p.progress || 0}</td>
                  <td style="padding:10px;color:#94a3b8;">${formatDate(p.end)}</td>
                  <td style="padding:10px;color:#94a3b8;">${formatMoney(p.budget)}</td>
                </tr>`).join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ===== SAYFA İLK YÜKLEME =====
renderDashboard();
