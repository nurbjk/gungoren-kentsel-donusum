/**
 * ====================================================================
 * GÜNGÖREN BELEDİYESİ - YARISI BİZDEN DOSYA PORTALI & ARAAD SİSTEMİ
 * SADELEŞTİRİLMİŞ İKİLİ SİSTEM:
 * 1. MÜTEAHHİT BAŞVURU FORMU (HESAP YOK, ŞİFRE YOK)
 * 2. BELEDİYE ORTAK PERSONEL HAVUZU (SİZ + 3 ÇALIŞMA ARKADAŞINIZ)
 * ====================================================================
 */

// --- AKTİF PERSONEL TANIMLARI (3 KİŞİLİK MASA) ---
const STAFF_LIST = {
  nur: { id: "nur", name: "Hatice Nur Okumuş (Sistem Yöneticisi)", avatar: "HN", role: "Sistem Yöneticisi" },
  personel1: { id: "personel1", name: "Emrah Gürdamur (İnceleme Personeli 1)", avatar: "EG", role: "Kentsel Dönüşüm Personeli" },
  personel2: { id: "personel2", name: "Sabri Gökhan Öztürk (İnceleme Personeli 2)", avatar: "SG", role: "Kentsel Dönüşüm Personeli" }
};

let currentStaff = STAFF_LIST.nur;
let currentPortalView = "contractor"; // "contractor" | "staff"
let selectedAppId = null;

// --- MÜTEAHHİT HESAPLARI & OTURUM DURUMU ---
let contractorUsers = [
  {
    id: "user_demo",
    companyName: "Güngören Prestij İnşaat Ltd. Şti.",
    repName: "Mustafa Güven",
    email: "ornek@insaat.com",
    password: "123456",
    phone: "5354442211",
    registeredAt: "20.10.2024",
    lastLoginAt: "30.10.2026 22:45",
    loginCount: 4
  },
  {
    id: "user_demo2",
    companyName: "Marmara Kentsel Yapı A.Ş.",
    repName: "Serdar Özkan",
    email: "marmara@insaat.com",
    password: "123456",
    phone: "5329876543",
    registeredAt: "25.10.2024",
    lastLoginAt: null,
    loginCount: 0
  }
];
let activeContractorUser = null;
let activeChatAppId = null;
let activeContractorEditingAppId = null;

// Formdaki geçici hak sahipleri
let formOwners = [];

// Formdaki geçici bina geneli evrakları (Toplu Sözleşmeler, Toplu Vekaletnameler ve Birleştirilmiş Daire Evrakı)
let formBuildingDocs = {
  contracts: null,
  proxies: null,
  mergedUnitsDoc: null
};

// Tüm Başvurular Havuzu (LocalStorage destekli)
let applicationsList = [];

// --- PROJE VE PARSEL / BLOK YAPILANDIRMA DURUMU ---
let currentStructureType = "single"; // "single" | "tevhid" | "blocks"
let projectActiveBlocks = ["A Blok", "B Blok"];
let projectActiveParcels = ["260/5", "260/6"];
let projectParcelsMap = { "260/5": 450, "260/6": 550 };
let projectBlocksMap = { "A Blok": 500, "B Blok": 600 };
let activeInputBlock = "A Blok";
let activeInputParcel = "260/5";
let activeSchematicBlock = "A Blok";

function parseSingleAdaParsel(str) {
  let ada = "";
  let parsel = "";
  let parts = [];
  if (str.includes("/")) {
    parts = str.split("/").map(s => s.trim());
  } else if (str.includes("-")) {
    parts = str.split("-").map(s => s.trim());
  } else if (/\s+/.test(str) && !/^\d+$/.test(str)) {
    parts = str.split(/\s+/).map(s => s.trim());
  }

  if (parts.length >= 2) {
    ada = parts[0];
    parsel = parts[1];
  } else {
    ada = "";
    parsel = str;
  }

  if (ada === "0" || ada === "00" || ada === "000" || ada === "……" || ada === "---") {
    ada = "";
  }

  let displayText = "";
  if (ada && parsel) {
    displayText = `${ada} Ada ${parsel} Parsel`;
  } else if (parsel) {
    displayText = `${parsel} Parsel`;
  } else if (ada) {
    displayText = `${ada} Ada`;
  } else {
    displayText = str;
  }
  return { ada, parsel, displayText };
}

// --- KADASTRO & ADA PARSEL PARSER (TEVHİD / ÇOKLU PARSEL DESTEKLİ) ---
function parseAdaParsel(input) {
  if (!input) return { ada: "", parsel: "", displayText: "" };
  let str = String(input).trim();

  // Tevhid: Virgülle ayrılmış 2-3 eski parsel girilmişse (Örn: 260/5, 260/6 veya 1965, 1966)
  if (str.includes(",")) {
    const subParts = str.split(",").map(s => s.trim()).filter(Boolean);
    const parsedSub = subParts.map(s => parseSingleAdaParsel(s));
    const combinedText = parsedSub.map(p => p.displayText).join(" & ");
    return {
      ada: parsedSub[0]?.ada || "",
      parsel: parsedSub.map(p => p.parsel).filter(Boolean).join(", "),
      displayText: `${combinedText} (Tevhid)`,
      isTevhid: true,
      raw: str
    };
  }

  const single = parseSingleAdaParsel(str);
  return { ...single, raw: str };
}

// --- MÜTEAHHİT DOSYASI VE AKTİF BAŞVURU TESPİT YARDIMCILARI ---
function getActiveContractorApps() {
  const activeDraftId = activeContractorEditingAppId || localStorage.getItem("yb_active_editing_app_id");

  if (!activeContractorUser) {
    // Firma oturumu açılmamışsa bile tarayıcıda kayıtlı tüm taslakları göster (veri kaybını önler)
    return applicationsList.filter(a => a.isDraft || a.status === "Taslak" || a.status === "draft" || a.id === activeDraftId);
  }

  const uEmail = (activeContractorUser.email || "").toLowerCase().trim();
  const uCompany = (activeContractorUser.companyName || "").toLowerCase().trim();
  const uTax = (activeContractorUser.taxNo || "").trim();

  return applicationsList.filter(a => {
    // Halen üzerinde çalışılan aktif taslak ise koşulsuz listele
    if (activeDraftId && a.id === activeDraftId) return true;

    const sEmail = (a.submittedByEmail || "").toLowerCase().trim();
    const rEmail = (a.company?.repEmail || "").toLowerCase().trim();
    const cName = (a.company?.name || "").toLowerCase().trim();
    const cTax = (a.company?.taxNo || "").trim();

    const matchesUser = (uEmail && (sEmail === uEmail || rEmail === uEmail)) ||
      (uTax && cTax === uTax) ||
      (uCompany && cName && (cName.includes(uCompany) || uCompany.includes(cName)));

    // Taslak ise ve e-posta eşleşiyorsa veya genel yerel taslaksa listele
    if (a.isDraft || a.status === "Taslak" || a.status === "draft") {
      return matchesUser || !sEmail || sEmail === uEmail;
    }

    return matchesUser;
  });
}

function getContractorActiveApp() {
  if (activeContractorEditingAppId) {
    const a = applicationsList.find(app => app.id === activeContractorEditingAppId);
    if (a) return a;
  }
  const savedId = localStorage.getItem("yb_active_editing_app_id");
  if (savedId) {
    const a = applicationsList.find(app => app.id === savedId);
    if (a) {
      activeContractorEditingAppId = a.id;
      return a;
    }
  }
  return null;
}

// PROJE TÜRÜ GEÇİŞİ (Standart Tek Parsel, Tevhidli Çoklu Parsel, Çoklu Bloklu)
function setProjectStructureType(type) {
  if (type === "both") type = "blocks";
  currentStructureType = type;

  // Buton aktiflik sınıfları
  const btnSingle = document.getElementById("btn-struct-single");
  const btnTevhid = document.getElementById("btn-struct-tevhid");
  const btnBlocks = document.getElementById("btn-struct-blocks");

  if (btnSingle) btnSingle.className = `btn-struct-pill ${type === 'single' ? 'active' : ''}`;
  if (btnTevhid) btnTevhid.className = `btn-struct-pill ${type === 'tevhid' ? 'active' : ''}`;
  if (btnBlocks) btnBlocks.className = `btn-struct-pill ${type === 'blocks' ? 'active' : ''}`;

  const hintEl = document.getElementById("struct-type-hint");
  const tevhidBox = document.getElementById("tevhid-info-box");
  const blocksBox = document.getElementById("blocks-info-box");
  const ownersTabsBar = document.getElementById("owners-block-tabs-bar");
  const ownersTabsTitle = document.getElementById("owners-tabs-title-label");
  const btnAddGroup = document.getElementById("btn-add-unit-group");

  const isTevhid = (type === "tevhid");
  const isBlocks = (type === "blocks");

  if (tevhidBox) tevhidBox.style.display = isTevhid ? "block" : "none";
  if (blocksBox) blocksBox.style.display = isBlocks ? "block" : "none";
  if (ownersTabsBar) ownersTabsBar.style.display = (isTevhid || isBlocks) ? "flex" : "none";

  if (hintEl) {
    hintEl.innerText = "";
  }

  if (ownersTabsTitle) {
    ownersTabsTitle.innerText = isTevhid ? "🔄 Düzenlenen Parsel:" : "🏢 Düzenlenen Blok:";
  }
  if (btnAddGroup) {
    btnAddGroup.innerText = isTevhid ? "➕ Parsel Ekle" : "➕ Blok Ekle";
  }

  // Tevhid ise birleşen parselleri inputa senkronize et
  if (isTevhid) {
    syncMergedParcelsToInput();
  }

  // Tüm satırlara varsayılan blok ve parsel ata (eğer atanmamışsa)
  formOwners.forEach(o => {
    if (!o.block) o.block = projectActiveBlocks[0] || "A Blok";
    if (!o.parcel) o.parcel = projectActiveParcels[0] || "260/5";
  });

  renderProjectParcelsTable();
  renderProjectBlocksTable();
  renderOwnersBlockTabs();
  renderContractorOwnersTable();

  if (typeof syncOwnersToSectionSchematic === "function") {
    syncOwnersToSectionSchematic(true);
  }
  if (typeof updatePreSubmitChecklist === "function") {
    updatePreSubmitChecklist();
  }
  calculate15RuleContractor();
}

function handleAddNewGroupClick() {
  if (currentStructureType === "tevhid") {
    openAddParcelModal();
  } else {
    openAddBlockModal();
  }
}

function syncMergedParcelsToInput() {
  const inputOld = document.getElementById("b-old-ada-parsel");
  if (inputOld && projectActiveParcels.length > 0) {
    inputOld.value = projectActiveParcels.join(", ");
  }
}

// 2. Adımdaki Tevhid Parselleri Dağılım Tablosunu Render Et
function renderProjectParcelsTable() {
  const container = document.getElementById("dynamic-parcels-table-container");
  if (!container) return;

  const totalOldM2 = projectActiveParcels.reduce((sum, p) => sum + (parseFloat(projectParcelsMap[p]) || 0), 0);
  const maxAllowedM2 = totalOldM2 * 1.5;

  let rowsHtml = projectActiveParcels.map(p => {
    const m2Val = projectParcelsMap[p] !== undefined ? projectParcelsMap[p] : 400;
    const assignedCount = formOwners.filter(o => (o.parcel || projectActiveParcels[0]) === p).length;
    return `
      <tr style="border-bottom:1px solid #e2e8f0; transition:background 0.2s;">
        <td style="padding:10px 14px; font-weight:800; color:#1e40af; font-family:'JetBrains Mono', monospace; font-size:13px;">
          📍 ${escapeHtml(p)}
        </td>
        <td style="padding:8px 14px;">
          <div style="display:inline-flex; align-items:center; gap:6px;">
            <input type="number" step="0.01" value="${m2Val}" onchange="updateParcelM2('${escapeHtml(p)}', this.value)"
              style="width:115px; padding:6px 10px; font-weight:700; font-size:13px; border:1.5px solid #93c5fd; border-radius:6px; background:#ffffff; color:#0f172a; text-align:right;">
            <span style="font-size:12px; font-weight:700; color:#475569;">m²</span>
          </div>
        </td>
        <td style="padding:10px 14px; font-size:12.5px; color:#475569;">
          <span class="badge-status-pill" style="background:#e0f2fe; color:#0369a1; font-weight:700; font-size:11.5px;">
            👥 ${assignedCount} Bağımsız Bölüm
          </span>
        </td>
        <td style="padding:8px 14px; text-align:center;">
          ${projectActiveParcels.length > 1 ? `
            <button type="button" onclick="removeProjectParcel('${escapeHtml(p)}')"
              style="background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; padding:5px 10px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;"
              title="${escapeHtml(p)} parselini sil">
              🗑️ Sil
            </button>
          ` : `
            <span style="font-size:11px; color:#94a3b8; font-style:italic;">Ana Parsel</span>
          `}
        </td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <div style="background:#ffffff; border:1px solid #bfdbfe; border-radius:10px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.03);">
      <table style="width:100%; border-collapse:collapse; text-align:left; font-size:12.5px;">
        <thead>
          <tr style="background:#eff6ff; color:#1e40af; border-bottom:1.5px solid #bfdbfe; font-size:12px;">
            <th style="padding:10px 14px;">📍 Parsel No</th>
            <th style="padding:10px 14px;">📐 Eski Yıkım Alanı (m²)</th>
            <th style="padding:10px 14px;">👥 Hak Sahipleri</th>
            <th style="padding:10px 14px; text-align:center;">İşlem</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr style="background:#f8fafc; border-top:2px solid #93c5fd; font-weight:800;">
            <td style="padding:12px 14px; color:#1e40af; font-size:13px;">TOPLAM:</td>
            <td style="padding:12px 14px; color:#1e40af; font-size:13.5px;">
              ${totalOldM2.toFixed(1)} m²
            </td>
            <td colspan="2" style="padding:12px 14px; color:#15803d; font-size:12.5px;">
              ➜ 1.5 Kat Azami Yeni Net Alan Sınırı: <strong>${maxAllowedM2.toFixed(1)} m²</strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function updateParcelM2(parcelName, newM2) {
  projectParcelsMap[parcelName] = parseFloat(newM2) || 0;
  renderProjectParcelsTable();
  calculate15RuleContractor();
  autoSaveContractorDraft();
}

// 2. Adımdaki Bloklar Dağılım Tablosunu Render Et
function renderProjectBlocksTable() {
  const container = document.getElementById("dynamic-blocks-table-container");
  if (!container) return;

  const totalOldM2 = projectActiveBlocks.reduce((sum, b) => sum + (parseFloat(projectBlocksMap[b]) || 0), 0);
  const maxAllowedM2 = totalOldM2 * 1.5;

  let rowsHtml = projectActiveBlocks.map(b => {
    const m2Val = projectBlocksMap[b] !== undefined ? projectBlocksMap[b] : 500;
    const assignedCount = formOwners.filter(o => (o.block || projectActiveBlocks[0]) === b).length;
    return `
      <tr style="border-bottom:1px solid #e2e8f0; transition:background 0.2s;">
        <td style="padding:10px 14px; font-weight:800; color:#166534; font-size:13px;">
          🏢 ${escapeHtml(b)}
        </td>
        <td style="padding:8px 14px;">
          <div style="display:inline-flex; align-items:center; gap:6px;">
            <input type="number" step="0.01" value="${m2Val}" onchange="updateBlockM2('${escapeHtml(b)}', this.value)"
              style="width:115px; padding:6px 10px; font-weight:700; font-size:13px; border:1.5px solid #86efac; border-radius:6px; background:#ffffff; color:#0f172a; text-align:right;">
            <span style="font-size:12px; font-weight:700; color:#475569;">m²</span>
          </div>
        </td>
        <td style="padding:10px 14px; font-size:12.5px; color:#475569;">
          <span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:700; font-size:11.5px;">
            👥 ${assignedCount} Bağımsız Bölüm
          </span>
        </td>
        <td style="padding:8px 14px; text-align:center;">
          ${projectActiveBlocks.length > 1 ? `
            <button type="button" onclick="removeProjectBlock('${escapeHtml(b)}')"
              style="background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; padding:5px 10px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;"
              title="${escapeHtml(b)} bloğunu sil">
              🗑️ Sil
            </button>
          ` : `
            <span style="font-size:11px; color:#94a3b8; font-style:italic;">Ana Blok</span>
          `}
        </td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <div style="background:#ffffff; border:1px solid #86efac; border-radius:10px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.03);">
      <table style="width:100%; border-collapse:collapse; text-align:left; font-size:12.5px;">
        <thead>
          <tr style="background:#f0fdf4; color:#166534; border-bottom:1.5px solid #86efac; font-size:12px;">
            <th style="padding:10px 14px;">🏢 Blok Adı</th>
            <th style="padding:10px 14px;">📐 Eski Yıkım Alanı (m²)</th>
            <th style="padding:10px 14px;">👥 Hak Sahipleri</th>
            <th style="padding:10px 14px; text-align:center;">İşlem</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr style="background:#f8fafc; border-top:2px solid #86efac; font-weight:800;">
            <td style="padding:12px 14px; color:#166534; font-size:13px;">TOPLAM:</td>
            <td style="padding:12px 14px; color:#166534; font-size:13.5px;">
              ${totalOldM2.toFixed(1)} m²
            </td>
            <td colspan="2" style="padding:12px 14px; color:#15803d; font-size:12.5px;">
              ➜ 1.5 Kat Azami Yeni Net Alan Sınırı: <strong>${maxAllowedM2.toFixed(1)} m²</strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function updateBlockM2(blockName, newM2) {
  projectBlocksMap[blockName] = parseFloat(newM2) || 0;
  renderProjectBlocksTable();
  calculate15RuleContractor();
  autoSaveContractorDraft();
}

// ========================================================
// ÖZEL MODAL: YENİ PARSEL EKLEME (TEVHİD)
// ========================================================
function openAddParcelModal() {
  const modal = document.getElementById("add-parcel-modal");
  const inputName = document.getElementById("modal-parcel-name");
  const inputM2 = document.getElementById("modal-parcel-m2");
  const chipsContainer = document.getElementById("modal-parcel-quick-chips");
  if (!modal) return;

  const nextIdx = projectActiveParcels.length + 1;
  const suggestedName = `260/${nextIdx + 4}`;
  if (inputName) inputName.value = suggestedName;
  if (inputM2) inputM2.value = "450";

  if (chipsContainer) {
    const candidates = [`260/${nextIdx + 4}`, `260/${nextIdx + 5}`, `1967/${nextIdx}`, `1452/${nextIdx + 1}`];
    chipsContainer.innerHTML = candidates.map(c => `
      <button type="button" class="btn-copy-chip" onclick="document.getElementById('modal-parcel-name').value='${c}'"
        style="font-size:11.5px; padding:3px 8px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:6px; cursor:pointer;">
        📍 ${c}
      </button>
    `).join("");
  }

  modal.style.display = "flex";
  if (inputName) {
    inputName.focus();
    inputName.select();
  }
}

function closeAddParcelModal() {
  const modal = document.getElementById("add-parcel-modal");
  if (modal) modal.style.display = "none";
}

function submitAddParcelModal() {
  const inputName = document.getElementById("modal-parcel-name");
  const inputM2 = document.getElementById("modal-parcel-m2");
  if (!inputName) return;

  const finalName = inputName.value.trim();
  const m2Val = parseFloat(inputM2?.value) || 0;

  if (!finalName) {
    showToast("Lütfen ada/parsel numarası giriniz.", "warning");
    return;
  }
  if (projectActiveParcels.includes(finalName)) {
    showToast(`"${finalName}" parseli zaten listede mevcut.`, "warning");
    return;
  }

  projectActiveParcels.push(finalName);
  projectParcelsMap[finalName] = m2Val;
  activeInputParcel = finalName;
  activeSchematicBlock = finalName;

  syncMergedParcelsToInput();
  renderProjectParcelsTable();
  renderOwnersBlockTabs();
  renderContractorOwnersTable();

  if (typeof syncOwnersToSectionSchematic === "function") {
    syncOwnersToSectionSchematic(true);
  }

  calculate15RuleContractor();
  autoSaveContractorDraft();
  closeAddParcelModal();
  showToast(`✅ "${finalName}" parseli (${m2Val} m²) başarıyla eklendi.`, "success");
}

function promptAddNewParcel() {
  openAddParcelModal();
}

// Birleşen Parsel Silme
async function removeProjectParcel(parcelName) {
  if (projectActiveParcels.length <= 1) {
    showToast("En az bir parsel bulunmalıdır.", "warning");
    return;
  }

  const assignedCount = formOwners.filter(o => o.parcel === parcelName).length;
  if (assignedCount > 0) {
    const ok = await showCustomConfirm({
      title: "Parseli Sil",
      message: `"${parcelName}" parselinde kayıtlı ${assignedCount} bağımsız bölüm var. Bu parseli silerseniz kayıtlar "${projectActiveParcels[0]}" parseline aktarılacaktır. Devam edilsin mi?`,
      confirmText: "Evet, Aktar ve Sil",
      cancelText: "Vazgeç",
      type: "warning"
    });
    if (!ok) return;
  }

  projectActiveParcels = projectActiveParcels.filter(p => p !== parcelName);
  delete projectParcelsMap[parcelName];

  formOwners.forEach(o => {
    if (o.parcel === parcelName) o.parcel = projectActiveParcels[0];
  });

  if (activeInputParcel === parcelName) activeInputParcel = projectActiveParcels[0];
  if (activeSchematicBlock === parcelName) activeSchematicBlock = projectActiveParcels[0];

  syncMergedParcelsToInput();
  renderProjectParcelsTable();
  renderOwnersBlockTabs();
  renderContractorOwnersTable();

  if (typeof syncOwnersToSectionSchematic === "function") {
    syncOwnersToSectionSchematic(true);
  }

  calculate15RuleContractor();
  autoSaveContractorDraft();
  showToast(`"${parcelName}" parseli silindi.`, "info");
}

// ========================================================
// ÖZEL MODAL: YENİ BLOK EKLEME
// ========================================================
function openAddBlockModal() {
  const modal = document.getElementById("add-block-modal");
  const inputName = document.getElementById("modal-block-name");
  const inputM2 = document.getElementById("modal-block-m2");
  const chipsContainer = document.getElementById("modal-block-quick-chips");
  if (!modal) return;

  const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
  let suggested = "";
  for (let l of letters) {
    const candidate = `${l} Blok`;
    if (!projectActiveBlocks.includes(candidate)) {
      suggested = candidate;
      break;
    }
  }
  if (!suggested) suggested = `${projectActiveBlocks.length + 1}. Blok`;

  if (inputName) inputName.value = suggested;
  if (inputM2) inputM2.value = "500";

  if (chipsContainer) {
    const candidates = [suggested, "Doğu Kule", "Batı Kule", `${projectActiveBlocks.length + 1}. Blok`];
    chipsContainer.innerHTML = candidates.map(c => `
      <button type="button" class="btn-copy-chip" onclick="document.getElementById('modal-block-name').value='${c}'"
        style="font-size:11.5px; padding:3px 8px; background:#f0fdf4; color:#15803d; border:1px solid #86efac; border-radius:6px; cursor:pointer;">
        🏢 ${c}
      </button>
    `).join("");
  }

  modal.style.display = "flex";
  if (inputName) {
    inputName.focus();
    inputName.select();
  }
}

function closeAddBlockModal() {
  const modal = document.getElementById("add-block-modal");
  if (modal) modal.style.display = "none";
}

function submitAddBlockModal() {
  const inputName = document.getElementById("modal-block-name");
  const inputM2 = document.getElementById("modal-block-m2");
  if (!inputName) return;

  let finalName = inputName.value.trim();
  const m2Val = parseFloat(inputM2?.value) || 0;

  if (!finalName) {
    showToast("Lütfen blok ismi giriniz.", "warning");
    return;
  }
  if (/^[a-zA-ZğüşıöçĞÜŞİÖÇ\d]$/.test(finalName)) {
    finalName = `${finalName.toUpperCase()} Blok`;
  }

  if (projectActiveBlocks.includes(finalName)) {
    showToast(`"${finalName}" zaten mevcut.`, "warning");
    return;
  }

  projectActiveBlocks.push(finalName);
  projectBlocksMap[finalName] = m2Val;
  activeInputBlock = finalName;
  activeSchematicBlock = finalName;

  renderProjectBlocksTable();
  renderOwnersBlockTabs();
  renderContractorOwnersTable();

  if (typeof syncOwnersToSectionSchematic === "function") {
    syncOwnersToSectionSchematic(true);
  }

  calculate15RuleContractor();
  autoSaveContractorDraft();
  closeAddBlockModal();
  showToast(`✅ "${finalName}" (${m2Val} m²) başarıyla eklendi.`, "success");
}

function promptAddNewBlock() {
  openAddBlockModal();
}

// Blok Silme
async function removeProjectBlock(blockName) {
  if (projectActiveBlocks.length <= 1) {
    showToast("En az bir blok bulunmalıdır.", "warning");
    return;
  }

  const assignedCount = formOwners.filter(o => o.block === blockName).length;
  if (assignedCount > 0) {
    const ok = await showCustomConfirm({
      title: "Bloğu Sil",
      message: `"${blockName}" içinde ${assignedCount} adet bağımsız bölüm kayıtlı. Bu bloğu silerseniz bu bölümler "${projectActiveBlocks[0]}" bloğuna aktarılacaktır. Devam edilsin mi?`,
      confirmText: "Evet, Aktar ve Sil",
      cancelText: "Vazgeç",
      type: "warning"
    });
    if (!ok) return;
  }

  projectActiveBlocks = projectActiveBlocks.filter(b => b !== blockName);
  delete projectBlocksMap[blockName];

  formOwners.forEach(o => {
    if (o.block === blockName) o.block = projectActiveBlocks[0];
  });

  if (activeInputBlock === blockName) activeInputBlock = projectActiveBlocks[0];
  if (activeSchematicBlock === blockName) activeSchematicBlock = projectActiveBlocks[0];

  renderProjectBlocksTable();
  renderOwnersBlockTabs();
  renderContractorOwnersTable();

  if (typeof syncOwnersToSectionSchematic === "function") {
    syncOwnersToSectionSchematic(true);
  }

  calculate15RuleContractor();
  autoSaveContractorDraft();
  showToast(`"${blockName}" silindi.`, "info");
}

// 3. Adımdaki Hak Sahipleri Sekmelerini Render Et (Tevhid Parselleri veya Bloklar)
function renderOwnersBlockTabs() {
  const container = document.getElementById("owners-block-tabs-list");
  const summaryBadge = document.getElementById("active-block-summary-badge");
  if (!container) return;

  if (currentStructureType === "tevhid") {
    if (!projectActiveParcels.includes(activeInputParcel)) {
      activeInputParcel = projectActiveParcels[0] || "260/5";
    }

    container.innerHTML = projectActiveParcels.map(p => {
      const count = formOwners.filter(o => (o.parcel || projectActiveParcels[0]) === p).length;
      const isActive = (p === activeInputParcel);
      return `
        <button type="button" class="btn-struct-pill ${isActive ? 'active' : ''}"
          onclick="switchActiveInputParcel('${escapeHtml(p)}')"
          style="padding:6px 14px; font-size:12.5px; font-weight:800;">
          📍 ${escapeHtml(p)} Parseli <span style="opacity:0.85; font-size:11px; margin-left:3px;">(${count} BB)</span>
        </button>
      `;
    }).join("");

    if (summaryBadge) {
      const activeCount = formOwners.filter(o => (o.parcel || projectActiveParcels[0]) === activeInputParcel).length;
      summaryBadge.innerText = `${activeInputParcel} Parseli: ${activeCount} Bağımsız Bölüm`;
    }
  } else if (currentStructureType === "blocks") {
    if (!projectActiveBlocks.includes(activeInputBlock)) {
      activeInputBlock = projectActiveBlocks[0] || "A Blok";
    }

    container.innerHTML = projectActiveBlocks.map(b => {
      const count = formOwners.filter(o => (o.block || projectActiveBlocks[0]) === b).length;
      const isActive = (b === activeInputBlock);
      return `
        <button type="button" class="btn-struct-pill ${isActive ? 'active' : ''}"
          onclick="switchActiveInputBlock('${escapeHtml(b)}')"
          style="padding:6px 14px; font-size:12.5px; font-weight:800;">
          🏢 ${escapeHtml(b)} <span style="opacity:0.85; font-size:11px; margin-left:3px;">(${count} BB)</span>
        </button>
      `;
    }).join("");

    if (summaryBadge) {
      const activeCount = formOwners.filter(o => (o.block || projectActiveBlocks[0]) === activeInputBlock).length;
      summaryBadge.innerText = `${activeInputBlock}: ${activeCount} Bağımsız Bölüm`;
    }
  }
}

// Hak Sahipleri Tablosunda Aktif Parseli Değiştir
function switchActiveInputParcel(parcelName) {
  activeInputParcel = parcelName;
  activeSchematicBlock = parcelName;

  renderOwnersBlockTabs();
  renderContractorOwnersTable();

  if (typeof syncOwnersToSectionSchematic === "function") {
    syncOwnersToSectionSchematic(true);
  }
  if (typeof updatePreSubmitChecklist === "function") {
    updatePreSubmitChecklist();
  }
}

// Hak Sahipleri Tablosunda Aktif Bloğu Değiştir
function switchActiveInputBlock(blockName) {
  activeInputBlock = blockName;
  activeSchematicBlock = blockName;

  renderOwnersBlockTabs();
  renderContractorOwnersTable();

  if (typeof syncOwnersToSectionSchematic === "function") {
    syncOwnersToSectionSchematic(true);
  }
  if (typeof updatePreSubmitChecklist === "function") {
    updatePreSubmitChecklist();
  }
}

// 4. Adım Şematik Kesit Blok / Parsel Değiştirme
function switchSchematicBlock(name) {
  activeSchematicBlock = name;
  if (typeof syncOwnersToSectionSchematic === "function") {
    syncOwnersToSectionSchematic(true);
  }
  if (typeof updatePreSubmitChecklist === "function") {
    updatePreSubmitChecklist();
  }
}

function formatDateTr(dateStr) {
  if (!dateStr) return "";
  const parts = String(dateStr).split("-");
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return dateStr;
}

// --- SAYFA AÇILIŞI ---
document.addEventListener("DOMContentLoaded", () => {
  loadDataFromStorage();

  // Müteahhit oturum durumunu UI'a yansıt
  updateContractorAuthUI();

  if (activeContractorUser) {
    updateContractorBadges();
    const allApps = getActiveContractorApps();
    const drafts = allApps.filter(a => a.isDraft || a.status === "Taslak" || a.status === "draft");
    checkContractorRevisions();
    if (activeContractorEditingAppId) {
      const editApp = applicationsList.find(a => a.id === activeContractorEditingAppId);
      if (editApp) {
        populateContractorFormFromApp(editApp);
        unlockContractorForm();
        switchContractorPortalTab("form");
      } else {
        switchContractorPortalTab(drafts.length > 0 ? "drafts" : "my-apps");
      }
    } else {
      switchContractorPortalTab(drafts.length > 0 ? "drafts" : "my-apps");
      loadContractorDraft();
    }
  }

  if (formOwners.length === 0) {
    // Müteahhit formuna ilk boş satırı ekle
    addNewOwnerRow();
  } else {
    renderContractorOwnersTable();
  }

  // Havuzda hiç başvuru yoksa test için 2 örnek dosya yükle
  if (applicationsList.length === 0) {
    seedInitialApplications();
  }

  updateHeaderCounts();
  renderApplicationsPool();
  renderRegisteredContractorsList();
  initSchematicSection();
  calculate15RuleContractor();
  renderBuildingDocsUI();
  if (typeof updatePreSubmitChecklist === "function") {
    updatePreSubmitChecklist();
  }

  // Form üzerindeki her değişiklikte taslağı otomatik kaydet ve bildirim göster
  const appForm = document.getElementById("contractor-application-form");
  if (appForm) {
    appForm.addEventListener("input", () => {
      autoSaveContractorDraft();
      notifyContentUpdated();
      calculate15RuleContractor();
      if (typeof updatePreSubmitChecklist === "function") updatePreSubmitChecklist();
    });
    appForm.addEventListener("change", () => {
      autoSaveContractorDraft();
      notifyContentUpdated();
      calculate15RuleContractor();
      if (typeof updatePreSubmitChecklist === "function") updatePreSubmitChecklist();
    });
  }

  // Sekmeler arası canlı senkronizasyon (Yetkili veya Müteahhit sekmeleri)
  window.addEventListener("storage", (e) => {
    if (e.key === "yb_applications_list" || e.key === "yb_last_submitted_app") {
      try {
        const rawApps = localStorage.getItem("yb_applications_list");
        if (rawApps) applicationsList = JSON.parse(rawApps);
        const rawLast = localStorage.getItem("yb_last_submitted_app");
        if (rawLast) {
          const lastApp = JSON.parse(rawLast);
          if (lastApp && lastApp.id) {
            const idx = applicationsList.findIndex(a => a.id === lastApp.id || a.appNo === lastApp.appNo);
            if (idx !== -1) applicationsList[idx] = lastApp;
          }
        }
      } catch (err) { }
      if (typeof updateHeaderCounts === "function") updateHeaderCounts();
      if (typeof renderApplicationsPool === "function") renderApplicationsPool();
      if (typeof renderContractorMyApps === "function") renderContractorMyApps();
      if (typeof checkContractorRevisions === "function") checkContractorRevisions();
    }
  });

  // DİKKAT: focus olayında formOwners'ı ASLA ezme!
  // Müteahhit bilgisayarından dosya seçip geri döndüğünde formun silinmesini engeller
  window.addEventListener("focus", () => {
    try {
      const rawApps = localStorage.getItem("yb_applications_list");
      if (rawApps) applicationsList = JSON.parse(rawApps);
      const rawLast = localStorage.getItem("yb_last_submitted_app");
      if (rawLast) {
        const lastApp = JSON.parse(rawLast);
        if (lastApp && lastApp.id) {
          const idx = applicationsList.findIndex(a => a.id === lastApp.id || a.appNo === lastApp.appNo);
          if (idx !== -1) applicationsList[idx] = lastApp;
        }
      }
    } catch (err) { }
    if (typeof updateHeaderCounts === "function") updateHeaderCounts();
    if (typeof renderApplicationsPool === "function") renderApplicationsPool();
    if (typeof renderContractorMyApps === "function") renderContractorMyApps();
    if (typeof checkContractorRevisions === "function") checkContractorRevisions();
  });
});

// --- TOAST BİLDİRİMİ ---
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>🔔</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// =========================================================================
// ÖZEL MODERN ONAY PENCERESİ (TARAYICI CONFIRM YERİNE MODERN POPUP)
// =========================================================================
let _confirmResolve = null;

function showCustomConfirm({
  title = "İşlemi Onaylayın",
  message = "Bu işlemi gerçekleştirmek istediğinize emin misiniz?",
  confirmText = "Evet, Onayla",
  cancelText = "Vazgeç",
  type = "danger",
  icon = null
} = {}) {
  return new Promise((resolve) => {
    _confirmResolve = resolve;
    const modal = document.getElementById("custom-confirm-modal");
    const titleEl = document.getElementById("confirm-modal-title");
    const msgEl = document.getElementById("confirm-modal-message");
    const btnConfirm = document.getElementById("confirm-modal-btn-confirm");
    const btnCancel = document.getElementById("confirm-modal-btn-cancel");
    const iconWrap = document.getElementById("confirm-modal-icon-wrap");

    if (!modal) {
      const ok = window.confirm(message);
      resolve(ok);
      return;
    }

    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerText = message;
    if (btnConfirm) {
      btnConfirm.innerText = confirmText;
      if (type === "danger") {
        btnConfirm.style.background = "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)";
      } else if (type === "warning") {
        btnConfirm.style.background = "linear-gradient(135deg, #d97706 0%, #b45309 100%)";
      } else {
        btnConfirm.style.background = "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)";
      }
    }
    if (btnCancel) btnCancel.innerText = cancelText;

    if (iconWrap) {
      if (icon) {
        iconWrap.innerText = icon;
      } else if (type === "danger") {
        iconWrap.innerText = "🗑️";
        iconWrap.style.background = "#fee2e2";
        iconWrap.style.color = "#dc2626";
      } else if (type === "warning") {
        iconWrap.innerText = "⚠️";
        iconWrap.style.background = "#fef3c7";
        iconWrap.style.color = "#b45309";
      } else {
        iconWrap.innerText = "ℹ️";
        iconWrap.style.background = "#eff6ff";
        iconWrap.style.color = "#1d4ed8";
      }
    }

    btnConfirm.onclick = () => {
      modal.style.display = "none";
      if (_confirmResolve) _confirmResolve(true);
      _confirmResolve = null;
    };

    btnCancel.onclick = () => {
      modal.style.display = "none";
      if (_confirmResolve) _confirmResolve(false);
      _confirmResolve = null;
    };

    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.style.display = "none";
        if (_confirmResolve) _confirmResolve(false);
        _confirmResolve = null;
      }
    };

    modal.style.display = "flex";
  });
}

// =========================================================================
// GÜVENLİ VERİ VE DOKÜMAN DEPOLAMA SİSTEMİ (IndexedDB + RAM + Lightweight LocalStorage)
// QuotaExceededError Kesin Önleme Mimarisi
// =========================================================================
const VALID_MINIMAL_PDF = "data:application/pdf;base64,JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovUmVzb3VyY2VzIDw8Pj4KPj4KZW5kb2JqCnhyZWYKMCA0CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxOCAwMDAwMCBuIAowMDAwMDAwMDY5IDAwMDAwIG4gCjAwMDAwMDAxMjUgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA0Ci9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgoyMjUKJSVFT0YK";

window.YB_DOC_STORE = window.YB_DOC_STORE || {};

const YB_DB_NAME = "YarisiBizdenDocDB";
const YB_STORE_NAME = "documents";

function openDocDB() {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(YB_DB_NAME, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(YB_STORE_NAME)) {
          db.createObjectStore(YB_STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

async function saveDocToDB(docKey, dataUrl) {
  if (!docKey || !dataUrl) return;
  window.YB_DOC_STORE[docKey] = dataUrl;
  try {
    sessionStorage.setItem(docKey, dataUrl);
  } catch (e) { }
  try {
    const db = await openDocDB();
    if (!db) return;
    const tx = db.transaction(YB_STORE_NAME, "readwrite");
    const store = tx.objectStore(YB_STORE_NAME);
    store.put({ id: docKey, dataUrl: dataUrl, timestamp: Date.now() });
  } catch (e) { }
}

async function getDocFromDB(docKey) {
  if (!docKey) return null;
  if (window.YB_DOC_STORE && window.YB_DOC_STORE[docKey]) return window.YB_DOC_STORE[docKey];
  try {
    const sess = sessionStorage.getItem(docKey);
    if (sess) {
      window.YB_DOC_STORE[docKey] = sess;
      return sess;
    }
  } catch (e) { }
  try {
    const db = await openDocDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(YB_STORE_NAME, "readonly");
        const store = tx.objectStore(YB_STORE_NAME);
        const req = store.get(docKey);
        req.onsuccess = () => {
          if (req.result && req.result.dataUrl) {
            window.YB_DOC_STORE[docKey] = req.result.dataUrl;
            resolve(req.result.dataUrl);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  } catch (e) {
    return null;
  }
}

async function preloadDocsFromDB() {
  try {
    const db = await openDocDB();
    if (!db) return;
    const tx = db.transaction(YB_STORE_NAME, "readonly");
    const store = tx.objectStore(YB_STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      if (req.result && Array.isArray(req.result)) {
        req.result.forEach(item => {
          if (item && item.id && item.dataUrl) {
            window.YB_DOC_STORE[item.id] = item.dataUrl;
          }
        });
      }
    };
  } catch (e) { }
}
try { preloadDocsFromDB(); } catch (e) { }

function sanitizeForStorage(data) {
  if (!data) return data;
  try {
    const copy = JSON.parse(JSON.stringify(data));
    const processOwner = (o, prefix) => {
      if (o && o.attachedDoc) {
        if (!o.attachedDoc.docKey) {
          o.attachedDoc.docKey = `doc_${prefix}_${o.oldUnitNo || Math.random().toString(36).substring(2, 7)}`;
        }
        if (o.attachedDoc.dataUrl && o.attachedDoc.dataUrl.length > 500) {
          const docKey = o.attachedDoc.docKey;
          window.YB_DOC_STORE[docKey] = o.attachedDoc.dataUrl;
          try { sessionStorage.setItem(docKey, o.attachedDoc.dataUrl); } catch (e) { }
          saveDocToDB(docKey, o.attachedDoc.dataUrl);
          o.attachedDoc.dataUrl = VALID_MINIMAL_PDF;
        }
      }
      if (o && o.individualDocs && typeof o.individualDocs === "object") {
        for (const [k, doc] of Object.entries(o.individualDocs)) {
          if (doc && typeof doc === "object") {
            if (!doc.docKey) {
              doc.docKey = `doc_${prefix}_${k}_${o.oldUnitNo || Math.random().toString(36).substring(2, 7)}`;
            }
            if (doc.dataUrl && doc.dataUrl.length > 500) {
              const docKey = doc.docKey;
              window.YB_DOC_STORE[docKey] = doc.dataUrl;
              try { sessionStorage.setItem(docKey, doc.dataUrl); } catch (e) { }
              saveDocToDB(docKey, doc.dataUrl);
              doc.dataUrl = VALID_MINIMAL_PDF;
            }
          }
        }
      }
    };

    const processBuildingDocs = (bDocs, prefix) => {
      if (!bDocs || typeof bDocs !== "object") return;
      ["contracts", "proxies", "mergedUnitsDoc"].forEach(type => {
        const doc = bDocs[type];
        if (doc && typeof doc === "object") {
          if (!doc.docKey) {
            doc.docKey = `bdoc_${prefix}_${type}_${Date.now()}`;
          }
          if (doc.dataUrl && doc.dataUrl.length > 500) {
            const docKey = doc.docKey;
            window.YB_DOC_STORE[docKey] = doc.dataUrl;
            try { sessionStorage.setItem(docKey, doc.dataUrl); } catch (e) { }
            saveDocToDB(docKey, doc.dataUrl);
            doc.dataUrl = VALID_MINIMAL_PDF;
          }
        }
      });
    };

    if (Array.isArray(copy)) {
      copy.forEach((item, idx) => {
        if (item && item.owners && Array.isArray(item.owners)) {
          item.owners.forEach((o, oIdx) => processOwner(o, `${item.id || idx}_${oIdx}`));
        } else if (item && (item.oldUnitNo || item.firstName)) {
          processOwner(item, `owner_${idx}`);
        }
        if (item && item.buildingDocs) {
          processBuildingDocs(item.buildingDocs, item.id || `app_${idx}`);
        }
      });
    } else if (typeof copy === "object") {
      if (copy.owners && Array.isArray(copy.owners)) {
        copy.owners.forEach((o, oIdx) => processOwner(o, `${copy.id || 'single'}_${oIdx}`));
      }
      if (copy.attachedDoc) {
        processOwner(copy, "single");
      }
      if (copy.buildingDocs) {
        processBuildingDocs(copy.buildingDocs, copy.id || "single");
      }
    }
    return copy;
  } catch (err) {
    return data;
  }
}

function cleanupStorageQuota() {
  try {
    const rawApps = localStorage.getItem("yb_applications_list");
    if (rawApps && rawApps.length > 80000) {
      try {
        const apps = JSON.parse(rawApps);
        const clean = sanitizeForStorage(apps);
        localStorage.setItem("yb_applications_list", JSON.stringify(clean));
      } catch (e) {
        try {
          const apps = JSON.parse(rawApps);
          const topApps = sanitizeForStorage(apps.slice(0, 5));
          localStorage.setItem("yb_applications_list", JSON.stringify(topApps));
        } catch (e2) { }
      }
    }

    const rawLast = localStorage.getItem("yb_last_submitted_app");
    if (rawLast && rawLast.length > 40000) {
      try {
        const lastApp = JSON.parse(rawLast);
        localStorage.setItem("yb_last_submitted_app", JSON.stringify(sanitizeForStorage(lastApp)));
      } catch (e) {
        localStorage.removeItem("yb_last_submitted_app");
      }
    }

    const rawOwners = localStorage.getItem("yb_form_owners");
    if (rawOwners && rawOwners.length > 40000) {
      try {
        const owners = JSON.parse(rawOwners);
        localStorage.setItem("yb_form_owners", JSON.stringify(sanitizeForStorage(owners)));
      } catch (e) {
        localStorage.removeItem("yb_form_owners");
      }
    }

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("yb_draft_")) {
        const val = localStorage.getItem(key);
        if (val && val.length > 40000) {
          try {
            const draft = JSON.parse(val);
            if (draft.owners) draft.owners = sanitizeForStorage(draft.owners);
            localStorage.setItem(key, JSON.stringify(draft));
          } catch (e) {
            localStorage.removeItem(key);
          }
        }
      }
    }
  } catch (err) {
    console.warn("Storage quota cleanup warning:", err);
  }
}

function safeSetLocalStorage(key, value) {
  let valStr = typeof value === "string" ? value : JSON.stringify(value);
  try {
    localStorage.setItem(key, valStr);
  } catch (quotaError) {
    console.warn(`Quota exceeded for "${key}", running storage cleanup...`, quotaError);
    cleanupStorageQuota();
    try {
      if (typeof value !== "string") {
        valStr = JSON.stringify(sanitizeForStorage(value));
      } else {
        try {
          const parsed = JSON.parse(value);
          valStr = JSON.stringify(sanitizeForStorage(parsed));
        } catch (e) { }
      }
      localStorage.setItem(key, valStr);
    } catch (secondError) {
      console.warn(`Second quota failure for "${key}". Purging temporary draft keys...`, secondError);
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("yb_draft_") || k === "yb_form_owners")) {
            localStorage.removeItem(k);
          }
        }
        localStorage.setItem(key, valStr);
      } catch (thirdError) {
        console.error(`Final quota failure for "${key}":`, thirdError);
      }
    }
  }
}

try { cleanupStorageQuota(); } catch (e) { }

// Formdaki tüm güncel alanları dosya nesnesine aktarma yardımcısı
function syncFormToAppObject(app) {
  if (!app) return;
  const companyName = document.getElementById("c-company-name")?.value.trim() || "";
  const taxNo = document.getElementById("c-tax-no")?.value.trim() || "";
  const iban = document.getElementById("c-iban")?.value.trim() || "";
  const repName = document.getElementById("c-rep-name")?.value.trim() || "";
  const repTc = document.getElementById("c-rep-tc")?.value.trim() || "";
  const repBirth = document.getElementById("c-rep-birth")?.value || "";
  const repEmail = document.getElementById("c-rep-email")?.value.trim() || "";
  const repPhone = document.getElementById("c-rep-phone")?.value.trim() || "";
  const companyAddress = document.getElementById("c-company-address")?.value.trim() || "";

  const ykn = document.getElementById("b-ykn")?.value.trim() || "";
  const neighborhood = document.getElementById("b-neighborhood")?.value || "";
  const permitDate = document.getElementById("b-permit-date")?.value || "";
  const oldAdaParsel = document.getElementById("b-old-ada-parsel")?.value.trim() || "";
  const newAdaParsel = document.getElementById("b-new-ada-parsel")?.value.trim() || "";
  const address = document.getElementById("b-address")?.value.trim() || "";

  const oldM2 = parseFloat(document.getElementById("m2-old-building")?.value) || 0;
  const newM2 = parseFloat(document.getElementById("m2-new-building")?.value) || 0;
  const shelterM2 = parseFloat(document.getElementById("m2-shelter")?.value) || 0;
  const parkingM2 = parseFloat(document.getElementById("m2-parking")?.value) || 0;

  const parsedOldAda = parseAdaParsel(oldAdaParsel);

  if (!app.company) app.company = {};
  if (companyName) app.company.name = companyName;
  if (taxNo) app.company.taxNo = taxNo;
  if (iban) app.company.iban = iban;
  if (repName) app.company.repName = repName;
  if (repTc) app.company.repTc = repTc;
  if (repBirth) app.company.repBirth = repBirth;
  if (repEmail) app.company.repEmail = repEmail;
  if (repPhone) app.company.repPhone = cleanPhoneInput(repPhone);
  if (companyAddress) app.company.address = companyAddress;

  if (!app.cadastre) app.cadastre = {};
  if (ykn) app.cadastre.ykn = ykn;
  if (neighborhood) app.cadastre.neighborhood = neighborhood;
  if (permitDate) app.cadastre.permitDate = permitDate;
  if (oldAdaParsel) {
    app.cadastre.oldAdaParsel = oldAdaParsel;
    app.cadastre.ada = parsedOldAda.ada;
    app.cadastre.parsel = parsedOldAda.parsel;
    app.cadastre.adaParselFormatted = parsedOldAda.displayText;
  }
  if (newAdaParsel) app.cadastre.newAdaParsel = newAdaParsel;
  if (address) app.cadastre.address = address;
  if (oldM2) app.cadastre.oldM2 = oldM2;
  if (newM2) app.cadastre.newM2 = newM2;
  app.cadastre.shelterM2 = shelterM2;
  app.cadastre.parkingM2 = parkingM2;
  if (typeof currentStructureType !== "undefined") {
    app.cadastre.structureType = currentStructureType;
    app.cadastre.isTevhid = currentStructureType === "tevhid" || currentStructureType === "both";
    app.cadastre.isBlocks = currentStructureType === "blocks" || currentStructureType === "both";
  }
  if (typeof projectActiveParcels !== "undefined" && Array.isArray(projectActiveParcels)) {
    app.cadastre.parcelsList = [...projectActiveParcels];
    app.cadastre.parcelsMap = { ...projectParcelsMap };
  }
  if (typeof projectActiveBlocks !== "undefined" && Array.isArray(projectActiveBlocks)) {
    app.cadastre.blocksList = [...projectActiveBlocks];
    app.cadastre.blocksMap = { ...projectBlocksMap };
  }

  if (formOwners && formOwners.length > 0) {
    app.owners = JSON.parse(JSON.stringify(formOwners));
  }
  if (formBuildingDocs && (formBuildingDocs.contracts || formBuildingDocs.proxies)) {
    app.buildingDocs = JSON.parse(JSON.stringify(formBuildingDocs));
  }
  app.lastUpdated = Date.now();
}

// --- LOCAL STORAGE YÖNETİMİ (KASMA VE DONMAYI ÖNLEYEN DEBOUNCE MEKANİZMASI) ---
let _saveStorageTimeout = null;

function saveDataToStorage(immediate = false) {
  if (immediate) {
    if (_saveStorageTimeout) {
      clearTimeout(_saveStorageTimeout);
      _saveStorageTimeout = null;
    }
    executeSaveDataToStorage();
    return;
  }
  if (_saveStorageTimeout) clearTimeout(_saveStorageTimeout);
  _saveStorageTimeout = setTimeout(() => {
    _saveStorageTimeout = null;
    executeSaveDataToStorage();
  }, 350);
}

function executeSaveDataToStorage() {
  try {
    // Aktif revizyon veya dosya düzenleniyorsa applicationsList içindeki dosyayı da anında tam senkronize et
    const activeApp = getContractorActiveApp();
    if (activeApp) {
      syncFormToAppObject(activeApp);
    }

    safeSetLocalStorage("yb_applications_list", sanitizeForStorage(applicationsList));
    safeSetLocalStorage("yb_form_owners", sanitizeForStorage(formOwners));
    safeSetLocalStorage("yb_current_staff_id", currentStaff?.id || "nur");
    safeSetLocalStorage("yb_contractor_users", contractorUsers);
    try { localStorage.setItem("yb_last_update_ts", String(Date.now())); } catch (e) { }
    if (activeContractorEditingAppId) {
      safeSetLocalStorage("yb_active_editing_app_id", activeContractorEditingAppId);
    } else {
      localStorage.removeItem("yb_active_editing_app_id");
    }
    if (activeContractorUser) {
      safeSetLocalStorage("yb_active_contractor", activeContractorUser);
    } else {
      localStorage.removeItem("yb_active_contractor");
    }
  } catch (e) {
    console.warn("Storage quota warning, saving lightweight snapshot:", e);
    try {
      cleanupStorageQuota();
      safeSetLocalStorage("yb_applications_list", sanitizeForStorage(applicationsList));
    } catch (err2) {
      console.warn("Local storage kota sınırı koruması aktif:", err2);
    }
  }
}

function loadDataFromStorage() {
  try {
    const rawDeleted = localStorage.getItem("yb_deleted_app_ids");
    const deletedIds = rawDeleted ? JSON.parse(rawDeleted) : [];

    const rawApps = localStorage.getItem("yb_applications_list");
    const rawOwners = localStorage.getItem("yb_form_owners");
    const rawStaffId = localStorage.getItem("yb_current_staff_id");
    const rawUsers = localStorage.getItem("yb_contractor_users");
    const rawActiveUser = localStorage.getItem("yb_active_contractor");
    const savedEditingId = localStorage.getItem("yb_active_editing_app_id");

    if (rawApps) {
      const parsedApps = JSON.parse(rawApps);
      applicationsList = parsedApps.filter(a => !deletedIds.includes(a.id) && !deletedIds.includes(a.appNo));
      // Önbellekten belge URL'lerini geri bağla
      applicationsList.forEach(app => {
        if (app && app.owners && Array.isArray(app.owners)) {
          app.owners.forEach((o, idx) => {
            if (o.attachedDoc) {
              const key = o.attachedDoc.docKey || `doc_${app.id}_${o.oldUnitNo || idx}`;
              if (window.YB_DOC_STORE[key]) {
                o.attachedDoc.dataUrl = window.YB_DOC_STORE[key];
              }
            }
            if (o.individualDocs && typeof o.individualDocs === "object") {
              for (const [k, doc] of Object.entries(o.individualDocs)) {
                if (doc && doc.docKey && window.YB_DOC_STORE && window.YB_DOC_STORE[doc.docKey]) {
                  doc.dataUrl = window.YB_DOC_STORE[doc.docKey];
                }
              }
            }
          });
        }
        if (app && app.buildingDocs && typeof app.buildingDocs === "object") {
          ["contracts", "proxies", "mergedUnitsDoc"].forEach(type => {
            const doc = app.buildingDocs[type];
            if (doc && (!doc.dataUrl || doc.dataUrl === VALID_MINIMAL_PDF) && doc.docKey) {
              const cached = window.YB_DOC_STORE[doc.docKey] || sessionStorage.getItem(doc.docKey);
              if (cached) doc.dataUrl = cached;
            }
          });
        }
      });
    }
    if (rawUsers) contractorUsers = JSON.parse(rawUsers);
    if (rawActiveUser) activeContractorUser = JSON.parse(rawActiveUser);
    if (savedEditingId && !deletedIds.includes(savedEditingId) && applicationsList.some(a => a.id === savedEditingId)) {
      activeContractorEditingAppId = savedEditingId;
    } else if (deletedIds.includes(savedEditingId)) {
      activeContractorEditingAppId = null;
      localStorage.removeItem("yb_active_editing_app_id");
    }

    // DİKKAT: Formda aktif çalışma varsa veya revizyon düzenleniyorsa formOwners'ı ezme!
    if (!activeContractorEditingAppId) {
      if (formOwners.length === 0 && rawOwners) {
        formOwners = JSON.parse(rawOwners);
        // Önbellekten dataUrl geri yükleme
        formOwners.forEach((o, idx) => {
          if (o.attachedDoc && (!o.attachedDoc.dataUrl || o.attachedDoc.dataUrl === VALID_MINIMAL_PDF)) {
            const key = o.attachedDoc.docKey || `doc_cache_${idx}`;
            const cached = window.YB_DOC_STORE[key] || sessionStorage.getItem(key);
            if (cached) o.attachedDoc.dataUrl = cached;
          }
          if (o.individualDocs && typeof o.individualDocs === "object") {
            for (const [k, doc] of Object.entries(o.individualDocs)) {
              if (doc && (!doc.dataUrl || doc.dataUrl === VALID_MINIMAL_PDF) && doc.docKey) {
                const cached = window.YB_DOC_STORE[doc.docKey] || sessionStorage.getItem(doc.docKey);
                if (cached) doc.dataUrl = cached;
              }
            }
          }
        });
      }
      ["contracts", "proxies", "mergedUnitsDoc"].forEach(type => {
        const doc = formBuildingDocs && formBuildingDocs[type];
        if (doc && (!doc.dataUrl || doc.dataUrl === VALID_MINIMAL_PDF) && doc.docKey) {
          const cached = window.YB_DOC_STORE[doc.docKey] || sessionStorage.getItem(doc.docKey);
          if (cached) doc.dataUrl = cached;
        }
      });
      if (typeof renderBuildingDocsUI === "function") renderBuildingDocsUI();
    } else {
      // Aktif revizyon düzenleniyorsa, formOwners'daki yeni yüklenen evrakları koru
      const activeApp = applicationsList.find(a => a.id === activeContractorEditingAppId);
      if (activeApp && activeApp.owners) {
        formOwners.forEach((fo, idx) => {
          if (fo.attachedDoc && activeApp.owners[idx]) {
            activeApp.owners[idx].attachedDoc = fo.attachedDoc;
          } else if (!fo.attachedDoc && activeApp.owners[idx] && activeApp.owners[idx].attachedDoc) {
            fo.attachedDoc = activeApp.owners[idx].attachedDoc;
          }
        });
      }
    }

    // Son gönderilen dosya yedeği varsa havuzda güncelle veya ekle (silinmemişse!)
    const rawLastSubmitted = localStorage.getItem("yb_last_submitted_app");
    if (rawLastSubmitted) {
      try {
        const lastApp = JSON.parse(rawLastSubmitted);
        if (lastApp && (deletedIds.includes(lastApp.id) || deletedIds.includes(lastApp.appNo))) {
          localStorage.removeItem("yb_last_submitted_app");
        } else if (lastApp && lastApp.id) {
          const existingIdx = applicationsList.findIndex(a => a.id === lastApp.id || a.appNo === lastApp.appNo);
          if (existingIdx !== -1) {
            applicationsList[existingIdx] = lastApp;
          } else {
            applicationsList.unshift(lastApp);
          }
        }
      } catch (err) { }
    }

    if (rawStaffId && STAFF_LIST[rawStaffId]) {
      currentStaff = STAFF_LIST[rawStaffId];
      const staffSelectEl = document.getElementById("staff-select");
      if (staffSelectEl) staffSelectEl.value = currentStaff.id;
      if (typeof updateStaffUI === "function") updateStaffUI();
    }
    if (typeof updatePreSubmitChecklist === "function") {
      updatePreSubmitChecklist();
    }
  } catch (e) {
    console.error("Yükleme hatası:", e);
  }
}

// --- PORTAL GÖRÜNÜMÜ GEÇİŞİ (MÜTEAHHİT vs BELEDİYE) ---
function switchPortalView(view) {
  currentPortalView = view;
  const viewContractor = document.getElementById("view-contractor");
  const viewStaff = document.getElementById("view-staff");
  const btnContractor = document.getElementById("tab-btn-contractor");
  const btnStaff = document.getElementById("tab-btn-staff");

  if (view === "contractor") {
    viewContractor.style.display = "block";
    viewStaff.style.display = "none";
    btnContractor.classList.add("active");
    btnStaff.classList.remove("active");
  } else {
    viewContractor.style.display = "none";
    viewStaff.style.display = "block";
    btnContractor.classList.remove("active");
    btnStaff.classList.add("active");
    renderApplicationsPool();
    renderRegisteredContractorsList();
  }
}

// =========================================================================
// MÜTEAHHİT HESAP YÖNETİMİ, GİRİŞ & KAYIT
// =========================================================================
function switchAuthTab(tab) {
  const btnLogin = document.getElementById("auth-tab-btn-login");
  const btnRegister = document.getElementById("auth-tab-btn-register");
  const formLogin = document.getElementById("form-contractor-login");
  const formRegister = document.getElementById("form-contractor-register");

  if (tab === "login") {
    if (btnLogin) btnLogin.classList.add("active");
    if (btnRegister) btnRegister.classList.remove("active");
    if (formLogin) formLogin.style.display = "block";
    if (formRegister) formRegister.style.display = "none";
  } else {
    if (btnRegister) btnRegister.classList.add("active");
    if (btnLogin) btnLogin.classList.remove("active");
    if (formRegister) formRegister.style.display = "block";
    if (formLogin) formLogin.style.display = "none";
  }
}

function handleContractorLogin(e) {
  if (e) e.preventDefault();
  const emailInput = document.getElementById("login-email");
  const passInput = document.getElementById("login-password");
  const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
  const password = passInput ? passInput.value.trim() : "";

  if (!email || !password) {
    showToast("Lütfen e-posta adresinizi ve şifrenizi giriniz.", "warning");
    return;
  }

  // Kullanıcının kayıtlı hesabı (varsayılan demo için de 123456 veya belirlenen şifre)
  let user = contractorUsers.find(u => u.email.toLowerCase() === email && (u.password === password || (!u.password && password === "123456")));

  if (!user) {
    showToast("Hatalı e-posta veya şifre! Lütfen bilgilerinizi kontrol ediniz veya 'Yeni Firma Hesabı Aç' sekmesinden kaydolunuz.", "danger");
    return;
  }

  // Yetkililerin kimin girip girmediğini görebilmesi için son giriş anı ve oturum kaydedilir
  user.lastLoginAt = new Date().toLocaleString("tr-TR");
  user.loginCount = (user.loginCount || 0) + 1;

  activeContractorUser = user;
  saveDataToStorage();
  updateContractorAuthUI();
  updateContractorBadges();
  const allApps = getActiveContractorApps();
  const drafts = allApps.filter(a => a.isDraft || a.status === "Taslak" || a.status === "draft");
  switchContractorPortalTab(drafts.length > 0 ? "drafts" : "my-apps");
  checkContractorRevisions();
  showToast(`Hoş geldiniz, ${user.companyName}! Dosyalarınız yüklendi.`, "success");
}

function handleContractorRegister(e) {
  if (e) e.preventDefault();
  const company = document.getElementById("reg-company")?.value.trim();
  const name = document.getElementById("reg-name")?.value.trim();
  const email = document.getElementById("reg-email")?.value.trim().toLowerCase();
  const phone = cleanPhoneInput(document.getElementById("reg-phone")?.value);
  const password = document.getElementById("reg-password")?.value.trim();

  if (contractorUsers.some(u => u.email.toLowerCase() === email)) {
    showToast("Bu e-posta adresi ile zaten kayıtlı bir firma hesabı mevcut!", "warning");
    return;
  }

  const nowStr = new Date().toLocaleString("tr-TR");
  const newUser = {
    id: "user_" + Date.now(),
    companyName: company,
    repName: name,
    email: email,
    phone: phone,
    password: password,
    registeredAt: new Date().toLocaleDateString("tr-TR"),
    lastLoginAt: nowStr,
    loginCount: 1
  };

  contractorUsers.push(newUser);
  activeContractorUser = newUser;
  saveDataToStorage();
  updateContractorAuthUI();
  loadContractorDraft();
  showToast(`Tebrikler! ${company} firma hesabınız oluşturuldu ve giriş yapıldı.`, "success");
}

function handleContractorLogout() {
  autoSaveContractorDraft();
  activeContractorUser = null;
  saveDataToStorage();
  updateContractorAuthUI();
  showToast("Oturumunuz güvenle kapatıldı. Taslağınız kaydedildi.", "info");
}

function updateContractorAuthUI() {
  const authSec = document.getElementById("contractor-auth-section");
  const portalContent = document.getElementById("contractor-portal-content");
  const compNameEl = document.getElementById("cab-company-name");
  const userMetaEl = document.getElementById("cab-user-meta");

  if (activeContractorUser) {
    if (authSec) authSec.style.display = "none";
    if (portalContent) portalContent.style.display = "block";
    if (compNameEl) compNameEl.innerText = activeContractorUser.companyName;
    if (userMetaEl) {
      userMetaEl.innerText = `Yetkili: ${activeContractorUser.repName} • ✉️ ${activeContractorUser.email} • 📞 ${activeContractorUser.phone || '-'} • 🟢 Son Giriş: ${activeContractorUser.lastLoginAt || 'Şimdi'}`;
    }
  } else {
    if (authSec) authSec.style.display = "block";
    if (portalContent) portalContent.style.display = "none";
  }
}

// =========================================================================
// TASLAK OTOMATİK KAYIT & KALDIĞI YERDEN DEVAM ETME
// =========================================================================
function autoSaveContractorDraft() {
  if (!activeContractorUser) return;
  // Eğer form kilitliyse (önceki bir başvurunun salt-okunur inceleme modundaysa) taslağı ezme
  const form = document.getElementById("contractor-application-form");
  const firstInput = form?.querySelector("input");
  if (firstInput && firstInput.disabled) return;

  try {
    const draft = {
      companyName: document.getElementById("c-company-name")?.value || "",
      taxNo: document.getElementById("c-tax-no")?.value || "",
      iban: document.getElementById("c-iban")?.value || "",
      companyAddress: document.getElementById("c-company-address")?.value || "",
      repName: document.getElementById("c-rep-name")?.value || "",
      repTc: document.getElementById("c-rep-tc")?.value || "",
      repBirth: document.getElementById("c-rep-birth")?.value || "",
      repEmail: document.getElementById("c-rep-email")?.value || "",
      repPhone: document.getElementById("c-rep-phone")?.value || "",
      ykn: document.getElementById("b-ykn")?.value || "",
      neighborhood: document.getElementById("b-neighborhood")?.value || "",
      permitDate: document.getElementById("b-permit-date")?.value || "",
      oldAdaParsel: document.getElementById("b-old-ada-parsel")?.value || "",
      newAdaParsel: document.getElementById("b-new-ada-parsel")?.value || "",
      address: document.getElementById("b-address")?.value || "",
      oldM2: document.getElementById("m2-old-building")?.value || "",
      newM2: document.getElementById("m2-new-building")?.value || "",
      shelterM2: document.getElementById("m2-shelter")?.value || "",
      parkingM2: document.getElementById("m2-parking")?.value || "",
      structureType: currentStructureType,
      blocksList: projectActiveBlocks,
      blocksMap: projectBlocksMap,
      parcelsList: projectActiveParcels,
      parcelsMap: projectParcelsMap,
      owners: sanitizeForStorage(formOwners),
      buildingDocs: sanitizeForStorage(formBuildingDocs),
      savedAt: new Date().toLocaleTimeString("tr-TR")
    };
    safeSetLocalStorage("yb_draft_" + activeContractorUser.email, draft);

    // Eğer aktif bir başvuru dosyası düzenleniyorsa veriyi anında o dosyaya da işle
    if (activeContractorEditingAppId) {
      const activeApp = applicationsList.find(a => a.id === activeContractorEditingAppId);
      if (activeApp) {
        syncFormToAppObject(activeApp);
        saveDataToStorage();
      }
    }
  } catch (err) {
    console.warn("Draft auto-save warning:", err);
  }
}

function loadContractorDraft() {
  if (!activeContractorUser) return;
  const rawDraft = localStorage.getItem("yb_draft_" + activeContractorUser.email);
  if (rawDraft) {
    try {
      const draft = JSON.parse(rawDraft);
      if (document.getElementById("c-company-name")) document.getElementById("c-company-name").value = draft.companyName || activeContractorUser.companyName;
      if (document.getElementById("c-tax-no")) document.getElementById("c-tax-no").value = draft.taxNo || "";
      if (document.getElementById("c-iban")) document.getElementById("c-iban").value = draft.iban || "";
      if (document.getElementById("c-company-address")) document.getElementById("c-company-address").value = draft.companyAddress || "";
      if (document.getElementById("c-rep-name")) document.getElementById("c-rep-name").value = draft.repName || activeContractorUser.repName;
      if (document.getElementById("c-rep-tc")) document.getElementById("c-rep-tc").value = draft.repTc || "";
      if (document.getElementById("c-rep-birth")) document.getElementById("c-rep-birth").value = draft.repBirth || "";
      if (document.getElementById("c-rep-email")) document.getElementById("c-rep-email").value = draft.repEmail || activeContractorUser.email;
      if (document.getElementById("c-rep-phone")) document.getElementById("c-rep-phone").value = draft.repPhone || activeContractorUser.phone || "";

      if (document.getElementById("b-ykn")) document.getElementById("b-ykn").value = draft.ykn || "";
      if (document.getElementById("b-neighborhood")) document.getElementById("b-neighborhood").value = draft.neighborhood || "";
      if (document.getElementById("b-permit-date")) document.getElementById("b-permit-date").value = draft.permitDate || "";
      if (document.getElementById("b-old-ada-parsel")) document.getElementById("b-old-ada-parsel").value = draft.oldAdaParsel || "";
      if (document.getElementById("b-new-ada-parsel")) document.getElementById("b-new-ada-parsel").value = draft.newAdaParsel || "";
      if (document.getElementById("b-address")) document.getElementById("b-address").value = draft.address || "";

      if (document.getElementById("m2-old-building")) document.getElementById("m2-old-building").value = draft.oldM2 || "";
      if (document.getElementById("m2-new-building")) document.getElementById("m2-new-building").value = draft.newM2 || "";
      if (document.getElementById("m2-shelter")) document.getElementById("m2-shelter").value = draft.shelterM2 || "";
      if (document.getElementById("m2-parking")) document.getElementById("m2-parking").value = draft.parkingM2 || "";

      if (draft.parcelsMap && typeof draft.parcelsMap === "object") {
        projectParcelsMap = { ...draft.parcelsMap };
        projectActiveParcels = Object.keys(projectParcelsMap);
      } else if (draft.parcelsList && Array.isArray(draft.parcelsList) && draft.parcelsList.length > 0) {
        projectActiveParcels = [...draft.parcelsList];
        projectActiveParcels.forEach(p => { if (!projectParcelsMap[p]) projectParcelsMap[p] = 400; });
      }

      if (draft.blocksMap && typeof draft.blocksMap === "object") {
        projectBlocksMap = { ...draft.blocksMap };
        projectActiveBlocks = Object.keys(projectBlocksMap);
      } else if (draft.blocksList && Array.isArray(draft.blocksList) && draft.blocksList.length > 0) {
        projectActiveBlocks = [...draft.blocksList];
        projectActiveBlocks.forEach(b => { if (!projectBlocksMap[b]) projectBlocksMap[b] = 500; });
      }

      if (draft.structureType) {
        setProjectStructureType(draft.structureType);
      }

      if (draft.owners && draft.owners.length > 0) {
        formOwners = draft.owners;
        renderContractorOwnersTable();
      }
      if (draft.buildingDocs && typeof draft.buildingDocs === "object") {
        formBuildingDocs = draft.buildingDocs;
        ["contracts", "proxies", "mergedUnitsDoc"].forEach(type => {
          const doc = formBuildingDocs[type];
          if (doc && (!doc.dataUrl || doc.dataUrl === VALID_MINIMAL_PDF) && doc.docKey) {
            const cached = window.YB_DOC_STORE[doc.docKey] || sessionStorage.getItem(doc.docKey);
            if (cached) doc.dataUrl = cached;
          }
        });
        if (typeof renderBuildingDocsUI === "function") renderBuildingDocsUI();
      }
      return;
    } catch (e) {
      console.error("Draft load error:", e);
    }
  }

  // Eğer kayıtlı taslak yoksa, kullanıcı profilini doldur
  if (document.getElementById("c-company-name")) document.getElementById("c-company-name").value = activeContractorUser.companyName || "";
  if (document.getElementById("c-rep-name")) document.getElementById("c-rep-name").value = activeContractorUser.repName || "";
  if (document.getElementById("c-rep-email")) document.getElementById("c-rep-email").value = activeContractorUser.email || "";
  if (document.getElementById("c-rep-phone")) document.getElementById("c-rep-phone").value = activeContractorUser.phone || "";
}

// --- İÇERİK GÜNCELLEME VE KİLİTLEME YÖNETİMİ ---
function notifyContentUpdated(msg = "Değişiklikleriniz sisteme otomatik kaydedildi.") {
  const notice = document.getElementById("contractor-form-update-notice");
  if (notice) notice.style.display = "none";

  const editId = activeContractorEditingAppId || localStorage.getItem("yb_active_editing_app_id");
  if (editId) {
    const activeApp = applicationsList.find(a => a.id === editId);
    if (activeApp) {
      syncFormToAppObject(activeApp);
      saveDataToStorage();
    }
  }
}

function triggerManualUpdate() {
  const editId = activeContractorEditingAppId || localStorage.getItem("yb_active_editing_app_id");
  if (editId) {
    activeContractorEditingAppId = editId;
    safeSetLocalStorage("yb_active_editing_app_id", editId);
    const activeApp = applicationsList.find(a => a.id === editId);
    if (activeApp) {
      syncFormToAppObject(activeApp);
      activeApp.lastUpdated = Date.now();
      safeSetLocalStorage("yb_last_submitted_app", sanitizeForStorage(activeApp));
      safeSetLocalStorage("yb_applications_list", sanitizeForStorage(applicationsList));
      saveDataToStorage();
      try { window.dispatchEvent(new Event("storage")); } catch (e) { }
      showToast("✅ Dosya bilgileriniz ve yaptığınız değişiklikler başarıyla güncellendi.", "success");
    }
  } else {
    autoSaveContractorDraft();
    showToast("✅ Taslak bilgileriniz başarıyla sisteme kaydedildi.", "success");
  }
  const notice = document.getElementById("contractor-form-update-notice");
  const textEl = document.getElementById("update-notice-text");
  if (textEl) textEl.innerText = `Son Güncelleme: ${new Date().toLocaleTimeString("tr-TR")} (Güncel ve Kayıtlı)`;
}

function lockContractorForm(app) {
  const form = document.getElementById("contractor-application-form");
  if (!form) return;

  const allInputs = form.querySelectorAll("input, select, textarea");
  allInputs.forEach(el => {
    el.disabled = true;
    el.style.backgroundColor = "#f1f5f9";
    el.style.cursor = "not-allowed";
  });

  // Butonları devre dışı bırak
  document.querySelectorAll(".btn-tbl-del, .file-label-btn").forEach(el => el.style.display = "none");
  const addRowBtn = document.querySelector("button[onclick='addNewOwnerRow()']");
  if (addRowBtn) addRowBtn.style.display = "none";

  const notice = document.getElementById("contractor-form-update-notice");
  if (notice) notice.style.display = "none";

  const submitBox = document.getElementById("submit-action-box");
  if (submitBox) {
    if (app.status === "onaylandi") {
      submitBox.innerHTML = `
        <div style="background:#f0fdf4; border:2px solid #16a34a; border-radius:12px; padding:18px 24px; width:100%; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:26px;">🎉</span>
              <h3 style="font-size:16px; font-weight:800; color:#15803d; margin:0;">Başvurunuz Onaylandı ve ARAAD Sistemine Aktarıldı!</h3>
            </div>
            <p style="font-size:13px; color:#166534; margin:4px 0 0 0;">
              Dosya No: <strong class="font-mono">${app.appNo}</strong> &bull; Başvurunuz resmi olarak onaylanmış ve Çevre, Şehircilik ve İklim Değişikliği Bakanlığı ARAAD sistemine aktarılmıştır.
            </p>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800; font-size:13px; padding:8px 16px; border:1px solid #86efac;">
              ✔ ONAYLANDI
            </span>
            <button type="button" class="btn-action-sm" onclick="startNewContractorApplication()" style="font-weight:800; padding:10px 18px; background:linear-gradient(135deg, #15803d 0%, #166534 100%); color:#ffffff; border:none; border-radius:8px; cursor:pointer;">
              ➕ Yeni Başvuru Başlat
            </button>
            <button type="button" class="btn-action-sm btn-outline-secondary" onclick="switchContractorPortalTab('my-apps')" style="font-weight:700; padding:10px 16px;">
              ← Başvuru Dosyalarıma Dön
            </button>
          </div>
        </div>
      `;
    } else if (app.status === "revize_edildi") {
      submitBox.innerHTML = `
        <div style="background:#f0fdf4; border:2px solid #16a34a; border-radius:12px; padding:18px 24px; width:100%; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:26px;">🔄</span>
              <h3 style="font-size:16px; font-weight:800; color:#15803d; margin:0;">Revize Başvurunuz Belediyeye Gönderildi (İnceleniyor)</h3>
            </div>
            <p style="font-size:13px; color:#166534; margin:4px 0 0 0;">
              Takip Numarası: <strong class="font-mono" style="font-size:14.5px; color:#0f172a;">${app.appNo}</strong> &bull; Düzenlediğiniz bilgiler ve eklediğiniz evraklar Güngören Belediyesi yetkili masasına teslim edilmiştir.
            </p>
            <p style="font-size:12px; color:#64748b; margin:3px 0 0 0;">
              Belediye personeli dosyanızı inceliyor. Yeni bir revizyon istenmedikçe form kilitli kalacaktır.
            </p>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800; font-size:13px; padding:8px 16px; border:1px solid #86efac;">
              ✅ Belediye İncelemesinde
            </span>
            <button type="button" class="btn-action-sm" onclick="startNewContractorApplication()" style="font-weight:800; padding:10px 18px; background:linear-gradient(135deg, #15803d 0%, #166534 100%); color:#ffffff; border:none; border-radius:8px; cursor:pointer;">
              ➕ Yeni Başvuru Başlat
            </button>
            <button type="button" class="btn-action-sm btn-outline-secondary" onclick="switchContractorPortalTab('my-apps')" style="font-weight:700; padding:10px 16px;">
              ← Başvuru Dosyalarıma Dön
            </button>
          </div>
        </div>
      `;
    } else {
      submitBox.innerHTML = `
        <div style="background:#f8fafc; border:2px solid #cbd5e1; border-radius:12px; padding:18px 24px; width:100%; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:24px;">🔒</span>
              <h3 style="font-size:16px; font-weight:800; color:#1e40af; margin:0;">Başvurunuz Belediyeye Gönderildi (İşlem Kilitlendi)</h3>
            </div>
            <p style="font-size:13px; color:#334155; margin:4px 0 0 0;">
              Takip Numarası: <strong class="font-mono" style="font-size:14.5px; color:#0f172a;">${app.appNo}</strong> &bull; Dosyanız Güngören Belediyesi Kentsel Dönüşüm Masasına başarıyla iletildi.
            </p>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <span class="badge-status-pill" style="background:#eff6ff; color:#1e40af; font-weight:800; font-size:13px; padding:8px 16px; border:1px solid #bfdbfe;">
              📥 Havuzda Bekliyor
            </span>
            <button type="button" class="btn-action-sm" onclick="startNewContractorApplication()" style="font-weight:800; padding:10px 18px; background:linear-gradient(135deg, #15803d 0%, #166534 100%); color:#ffffff; border:none; border-radius:8px; cursor:pointer;">
              ➕ Yeni Başvuru Başlat
            </button>
            <button type="button" class="btn-action-sm btn-outline-secondary" onclick="switchContractorPortalTab('my-apps')" style="font-weight:700; padding:10px 16px;">
              ← Başvuru Dosyalarıma Dön
            </button>
          </div>
        </div>
      `;
    }
  }
}

function unlockContractorForm() {
  const form = document.getElementById("contractor-application-form");
  if (!form) return;

  const allInputs = form.querySelectorAll("input, select, textarea");
  allInputs.forEach(el => {
    el.disabled = false;
    el.style.backgroundColor = "#ffffff";
    el.style.cursor = "text";
  });

  document.querySelectorAll(".btn-tbl-del, .file-label-btn").forEach(el => el.style.display = "inline-block");
  const addRowBtn = document.querySelector("button[onclick='addNewOwnerRow()']");
  if (addRowBtn) addRowBtn.style.display = "inline-flex";

  const notice = document.getElementById("contractor-form-update-notice");
  if (notice) notice.style.display = "flex";
}

function populateContractorFormFromApp(app) {
  if (!app) return;
  const user = activeContractorUser || {};
  if (document.getElementById("c-company-name")) document.getElementById("c-company-name").value = app.company?.name || user.companyName || "";
  if (document.getElementById("c-tax-no")) document.getElementById("c-tax-no").value = app.company?.taxNo || "";
  if (document.getElementById("c-iban")) document.getElementById("c-iban").value = app.company?.iban || "";
  if (document.getElementById("c-company-address")) document.getElementById("c-company-address").value = app.company?.address || "";
  if (document.getElementById("c-rep-name")) document.getElementById("c-rep-name").value = app.company?.repName || user.repName || "";
  if (document.getElementById("c-rep-tc")) document.getElementById("c-rep-tc").value = app.company?.repTc || "";
  if (document.getElementById("c-rep-birth")) document.getElementById("c-rep-birth").value = app.company?.repBirth || "";
  if (document.getElementById("c-rep-email")) document.getElementById("c-rep-email").value = app.company?.repEmail || user.email || "";
  if (document.getElementById("c-rep-phone")) document.getElementById("c-rep-phone").value = app.company?.repPhone || user.phone || "";

  if (document.getElementById("b-ykn")) document.getElementById("b-ykn").value = app.cadastre?.ykn || "";
  if (document.getElementById("b-neighborhood")) document.getElementById("b-neighborhood").value = app.cadastre?.neighborhood || "";
  if (document.getElementById("b-permit-date")) document.getElementById("b-permit-date").value = app.cadastre?.permitDate || "";
  if (document.getElementById("b-old-ada-parsel")) document.getElementById("b-old-ada-parsel").value = app.cadastre?.oldAdaParsel || "";
  if (document.getElementById("b-new-ada-parsel")) document.getElementById("b-new-ada-parsel").value = app.cadastre?.newAdaParsel || "";
  if (document.getElementById("b-address")) document.getElementById("b-address").value = app.cadastre?.address || "";

  if (document.getElementById("m2-old-building")) document.getElementById("m2-old-building").value = app.cadastre?.oldM2 || "";
  if (document.getElementById("m2-new-building")) document.getElementById("m2-new-building").value = app.cadastre?.newM2 || "";
  if (document.getElementById("m2-shelter")) document.getElementById("m2-shelter").value = app.cadastre?.shelterM2 || "";
  if (document.getElementById("m2-parking")) document.getElementById("m2-parking").value = app.cadastre?.parkingM2 || "";

  calculate15RuleContractor();

  const structType = app.cadastre?.structureType || (app.cadastre?.isTevhid ? "tevhid" : (app.cadastre?.isBlocks ? "blocks" : "single"));
  if (app.cadastre?.parcelsMap && typeof app.cadastre.parcelsMap === "object") {
    projectParcelsMap = { ...app.cadastre.parcelsMap };
    projectActiveParcels = Object.keys(projectParcelsMap);
  } else if (app.cadastre?.parcelsList && Array.isArray(app.cadastre.parcelsList) && app.cadastre.parcelsList.length > 0) {
    projectActiveParcels = [...app.cadastre.parcelsList];
    projectActiveParcels.forEach(p => { if (!projectParcelsMap[p]) projectParcelsMap[p] = 400; });
  }

  if (app.cadastre?.blocksMap && typeof app.cadastre.blocksMap === "object") {
    projectBlocksMap = { ...app.cadastre.blocksMap };
    projectActiveBlocks = Object.keys(projectBlocksMap);
  } else if (app.cadastre?.blocksList && Array.isArray(app.cadastre.blocksList) && app.cadastre.blocksList.length > 0) {
    projectActiveBlocks = [...app.cadastre.blocksList];
    projectActiveBlocks.forEach(b => { if (!projectBlocksMap[b]) projectBlocksMap[b] = 500; });
  }

  setProjectStructureType(structType);

  if (app.owners && app.owners.length > 0) {
    formOwners = JSON.parse(JSON.stringify(app.owners));
    // Daire evraklarının dataUrl'lerini önbellek veya oturum deposundan geri yükle
    formOwners.forEach(o => {
      if (o.attachedDoc && (!o.attachedDoc.dataUrl || o.attachedDoc.dataUrl === VALID_MINIMAL_PDF) && o.attachedDoc.docKey) {
        const cached = window.YB_DOC_STORE[o.attachedDoc.docKey] || sessionStorage.getItem(o.attachedDoc.docKey);
        if (cached) o.attachedDoc.dataUrl = cached;
      }
      if (o.individualDocs) {
        Object.keys(o.individualDocs).forEach(dk => {
          const idoc = o.individualDocs[dk];
          if (idoc && (!idoc.dataUrl || idoc.dataUrl === VALID_MINIMAL_PDF) && idoc.docKey) {
            const cached = window.YB_DOC_STORE[idoc.docKey] || sessionStorage.getItem(idoc.docKey);
            if (cached) idoc.dataUrl = cached;
          }
        });
      }
    });
    renderContractorOwnersTable();
    if (typeof syncOwnersToSectionSchematic === "function") {
      syncOwnersToSectionSchematic(true);
    }
  }

  // Şematik kesit yapılandırmasını taslaktan geri yükle
  if (app.schematic && typeof app.schematic === "object") {
    buildingSchematicConfig = JSON.parse(JSON.stringify(app.schematic));
  }
  if (typeof renderOwnersBlockTabs === "function") {
    renderOwnersBlockTabs();
  }

  if (app.buildingDocs && typeof app.buildingDocs === "object") {
    formBuildingDocs = JSON.parse(JSON.stringify(app.buildingDocs));
    ["contracts", "proxies", "mergedUnitsDoc"].forEach(type => {
      const doc = formBuildingDocs[type];
      if (doc && (!doc.dataUrl || doc.dataUrl === VALID_MINIMAL_PDF) && doc.docKey) {
        const cached = window.YB_DOC_STORE[doc.docKey] || sessionStorage.getItem(doc.docKey);
        if (cached) doc.dataUrl = cached;
      }
    });
  } else {
    formBuildingDocs = { contracts: null, proxies: null, mergedUnitsDoc: null };
  }
  if (typeof renderBuildingDocsUI === "function") renderBuildingDocsUI();
}

function calculate15RuleContractor() {
  const oldM2El = document.getElementById("m2-old-building");
  const newM2El = document.getElementById("m2-new-building");
  const shelterM2El = document.getElementById("m2-shelter");
  const parkingM2El = document.getElementById("m2-parking");
  const badgeM2El = document.getElementById("m2-old-building-badge");

  const card = document.getElementById("contractor-15-rule-card");
  const badge = document.getElementById("c-15-badge");
  const icon = document.getElementById("c-15-icon");
  const title = document.getElementById("c-15-title");
  const details = document.getElementById("c-15-details");

  if (!card || !badge) return;

  // Yapı tipine göre Eski Yıkım Alanını belirle (Tevhid veya Çoklu Blok toplamı)
  let oldM2 = 0;
  let breakdownRowsHtml = "";

  if (currentStructureType === "tevhid") {
    // Tevhid: Birleşen tüm parsellerin eski yıkım alanları toplamı
    oldM2 = projectActiveParcels.reduce((sum, p) => sum + (parseFloat(projectParcelsMap[p]) || 0), 0);
    if (oldM2El) {
      oldM2El.value = oldM2 > 0 ? oldM2 : "";
      oldM2El.readOnly = true;
      oldM2El.style.backgroundColor = "#eff6ff";
    }
    if (badgeM2El) {
      badgeM2El.style.display = "inline-flex";
      badgeM2El.style.background = "#dbeafe";
      badgeM2El.style.color = "#1e40af";
      badgeM2El.style.border = "1px solid #93c5fd";
      badgeM2El.innerText = `🔄 Tevhid Toplamı: ${oldM2.toFixed(1)} m² (${projectActiveParcels.length} Parsel)`;
    }
    breakdownRowsHtml = `
      <div style="background:#f0f7ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 12px; margin-bottom:10px;">
        <strong style="color:#1e40af; font-size:12.5px; display:block; margin-bottom:4px;">📍 Birleşen Parseller Yıkım Alanı Dağılımı:</strong>
        <div style="display:flex; flex-wrap:wrap; gap:8px 16px; font-size:12px; color:#1e3a8a;">
          ${projectActiveParcels.map(p => `<span>• <strong>${escapeHtml(p)}:</strong> ${(parseFloat(projectParcelsMap[p]) || 0).toFixed(1)} m²</span>`).join("")}
        </div>
        <div style="margin-top:6px; font-weight:800; color:#1e40af; font-size:12.5px; border-top:1px dashed #93c5fd; padding-top:4px;">
          ∑ Toplam Eski Yıkım Alanı: ${oldM2.toFixed(1)} m²
        </div>
      </div>
    `;
  } else if (currentStructureType === "blocks") {
    // Çoklu Blok: Tüm blokların eski alanları toplamı
    oldM2 = projectActiveBlocks.reduce((sum, b) => sum + (parseFloat(projectBlocksMap[b]) || 0), 0);
    if (oldM2El) {
      oldM2El.value = oldM2 > 0 ? oldM2 : "";
      oldM2El.readOnly = true;
      oldM2El.style.backgroundColor = "#f0fdf4";
    }
    if (badgeM2El) {
      badgeM2El.style.display = "inline-flex";
      badgeM2El.style.background = "#dcfce7";
      badgeM2El.style.color = "#15803d";
      badgeM2El.style.border = "1px solid #86efac";
      badgeM2El.innerText = `🏢 Bloklar Toplamı: ${oldM2.toFixed(1)} m² (${projectActiveBlocks.length} Blok)`;
    }
    breakdownRowsHtml = `
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 12px; margin-bottom:10px;">
        <strong style="color:#15803d; font-size:12.5px; display:block; margin-bottom:4px;">🏢 Bloklar Yıkım Alanı Dağılımı:</strong>
        <div style="display:flex; flex-wrap:wrap; gap:8px 16px; font-size:12px; color:#166534;">
          ${projectActiveBlocks.map(b => `<span>• <strong>${escapeHtml(b)}:</strong> ${(parseFloat(projectBlocksMap[b]) || 0).toFixed(1)} m²</span>`).join("")}
        </div>
        <div style="margin-top:6px; font-weight:800; color:#15803d; font-size:12.5px; border-top:1px dashed #86efac; padding-top:4px;">
          ∑ Toplam Eski Yıkım Alanı: ${oldM2.toFixed(1)} m²
        </div>
      </div>
    `;
  } else {
    // Standart Tek Bina
    if (oldM2El) {
      oldM2El.readOnly = false;
      oldM2El.style.backgroundColor = "#fff";
      oldM2 = parseFloat(oldM2El.value) || 0;
    }
    if (badgeM2El) badgeM2El.style.display = "none";
  }

  const newM2 = parseFloat(newM2El?.value) || 0;
  const shelterM2 = parseFloat(shelterM2El?.value) || 0;
  const parkingM2 = parseFloat(parkingM2El?.value) || 0;

  if (oldM2 <= 0 || newM2 <= 0) {
    card.style.background = "#f8fafc";
    card.style.borderColor = "#e2e8f0";
    badge.style.background = "#e2e8f0";
    badge.style.color = "#475569";
    badge.innerText = "Alan Değerleri Bekleniyor";
    if (title) title.innerText = "1.5 Kat Alan Kuralı Denetimi";
    if (icon) icon.innerText = "📐";
    if (details) {
      if (breakdownRowsHtml) {
        details.style.display = "block";
        details.innerHTML = breakdownRowsHtml + `<div style="font-size:12px; color:#64748b;">Yeni bina ruhsat alanı girildiğinde 1.5 kat kuralı canlı hesaplanacaktır.</div>`;
      } else {
        details.style.display = "none";
      }
    }
    return;
  }

  const netNewM2 = newM2 - (shelterM2 + parkingM2);
  const maxAllowedM2 = oldM2 * 1.5;
  const ratio = (netNewM2 / oldM2).toFixed(2);

  if (details) details.style.display = "block";

  if (netNewM2 <= maxAllowedM2) {
    card.style.background = "#f0fdf4";
    card.style.borderColor = "#86efac";
    badge.style.background = "#dcfce7";
    badge.style.color = "#15803d";
    badge.innerText = `✅ 1.5 Kat Uyumlu (${ratio} Kat)`;
    if (icon) icon.innerText = "✅";
    if (title) title.innerText = "1.5 Kat Alan Kuralı Sağlandı";
    if (details) {
      details.innerHTML = `
        ${breakdownRowsHtml}
        <div style="color:#166534; font-size:12.5px;">
          Eski Bina Toplam Yıkım Alanı: <strong>${oldM2.toFixed(1)} m²</strong> &bull; Yasal Azami İzin Verilen Net Alan (x 1.5): <strong>${maxAllowedM2.toFixed(1)} m²</strong><br>
          Yeni Net Alan (Ruhsat: ${newM2} m² - [Sığınak: ${shelterM2} m² + Otopark: ${parkingM2} m²]): <strong>${netNewM2.toFixed(1)} m²</strong> (${ratio} kat).<br>
          <span style="font-weight:700; color:#15803d; display:block; margin-top:4px;">✓ Projeniz Yarısı Bizden Kampanyası 1.5 kat kuralına tam uygundur.</span>
        </div>
      `;
    }
  } else {
    const diff = (netNewM2 - maxAllowedM2).toFixed(1);
    card.style.background = "#fef2f2";
    card.style.borderColor = "#fca5a5";
    badge.style.background = "#fee2e2";
    badge.style.color = "#b91c1c";
    badge.innerText = `🚨 1.5 Katı Aşıyor! (${ratio} Kat) - BELEDİYEYE GÖNDERİLEMEZ`;
    if (icon) icon.innerText = "🚨";
    if (title) title.innerText = "DİKKAT: 1.5 Kat Alan Kuralı Aşıldı (Dosya Gönderilemez)";
    if (details) {
      details.innerHTML = `
        ${breakdownRowsHtml}
        <div style="color:#991b1b; font-size:12.5px;">
          Eski Bina Toplam Yıkım Alanı: <strong>${oldM2.toFixed(1)} m²</strong> &bull; Yasal Üst Sınır (x 1.5): <strong>${maxAllowedM2.toFixed(1)} m²</strong><br>
          Yeni Net Alan (Ruhsat: ${newM2} m² - [Sığınak: ${shelterM2} m² + Otopark: ${parkingM2} m²]): <strong>${netNewM2.toFixed(1)} m²</strong> (${ratio} kat).<br>
          <span style="font-weight:800; color:#b91c1c; display:block; margin-top:4px;">⛔ Projeniz yasal sınırı ${diff} m² aşmaktadır! 1.5 katı aşan başvuruların belediyeye gönderilmesi sistem tarafından ENGELLENMİŞTİR.</span>
        </div>
      `;
    }
  }
}

function checkContractorSubmittedStatus() {
  if (!activeContractorUser) return false;
  renderContractorMyApps();
  return true;
}

// =========================================================================
// MÜTEAHHİT PORTALI: SEKMELER & DOSYALARIM YÖNETİMİ
// =========================================================================
function updateContractorBadges() {
  const allApps = getActiveContractorApps();
  const drafts = allApps.filter(a => a.isDraft || a.status === "Taslak" || a.status === "draft");
  const submitted = allApps.filter(a => !a.isDraft && a.status !== "Taslak" && a.status !== "draft");

  const draftBadge = document.getElementById("contractor-drafts-count-badge");
  if (draftBadge) draftBadge.innerText = drafts.length;

  const appBadge = document.getElementById("contractor-apps-count-badge");
  if (appBadge) appBadge.innerText = submitted.length;
}

function switchContractorPortalTab(tab) {
  const btnDrafts = document.getElementById("btn-c-tab-drafts");
  const btnMyApps = document.getElementById("btn-c-tab-my-apps");
  const btnForm = document.getElementById("btn-c-tab-form");

  const secDrafts = document.getElementById("contractor-section-drafts");
  const secMyApps = document.getElementById("contractor-section-my-apps");
  const secForm = document.getElementById("contractor-section-form");

  updateContractorBadges();

  if (tab === "drafts") {
    if (btnDrafts) btnDrafts.classList.add("active");
    if (btnMyApps) btnMyApps.classList.remove("active");
    if (btnForm) btnForm.classList.remove("active");

    if (secDrafts) secDrafts.style.display = "block";
    if (secMyApps) secMyApps.style.display = "none";
    if (secForm) secForm.style.display = "none";

    renderContractorDrafts();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (tab === "my-apps") {
    if (btnMyApps) btnMyApps.classList.add("active");
    if (btnDrafts) btnDrafts.classList.remove("active");
    if (btnForm) btnForm.classList.remove("active");

    if (secMyApps) secMyApps.style.display = "block";
    if (secDrafts) secDrafts.style.display = "none";
    if (secForm) secForm.style.display = "none";

    renderContractorMyApps();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    // Form sekmesi
    if (btnForm) btnForm.classList.add("active");
    if (btnDrafts) btnDrafts.classList.remove("active");
    if (btnMyApps) btnMyApps.classList.remove("active");

    if (secForm) secForm.style.display = "block";
    if (secDrafts) secDrafts.style.display = "none";
    if (secMyApps) secMyApps.style.display = "none";

    if (activeContractorEditingAppId) {
      const activeApp = applicationsList.find(a => a.id === activeContractorEditingAppId);
      if (activeApp) {
        unlockContractorForm();
      }
    } else {
      const isLocked = document.getElementById("contractor-application-form")?.querySelector("input:disabled");
      if (isLocked) {
        startNewContractorApplication();
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function renderContractorDrafts() {
  const container = document.getElementById("contractor-drafts-list-container");
  const badge = document.getElementById("contractor-drafts-count-badge");
  if (!container) return;

  const allApps = getActiveContractorApps();
  const drafts = allApps.filter(a => a.isDraft || a.status === "Taslak" || a.status === "draft");

  if (badge) badge.innerText = drafts.length;

  if (drafts.length === 0) {
    container.innerHTML = `
      <div style="background:#fefce8; border:2px dashed #fde047; border-radius:14px; padding:36px 20px; text-align:center;">
        <span style="font-size:42px; display:block; margin-bottom:10px;">💾</span>
        <h4 style="font-size:16px; font-weight:800; color:#854d0e; margin:0 0 6px;">Kayıtlı Taslak Başvurunuz Bulunmuyor</h4>
        <p style="font-size:13px; color:#a16207; max-width:480px; margin:0 auto 18px;">
          Başvuru formunu doldururken "Taslak Olarak Kaydet" butonuna basarak çalışmalarınızı yarım bırakabilir ve daha sonra dilediğiniz an kaldığınız yerden devam edebilirsiniz.
        </p>
        <button type="button" class="btn-submit-big" onclick="switchContractorPortalTab('form'); startNewContractorApplication();" style="padding:10px 22px; font-size:13.5px; margin:0 auto; background:linear-gradient(135deg, #15803d 0%, #166534 100%);">
          ➕ Yeni Başvuru Başlat
        </button>
      </div>
    `;
    return;
  }

  let html = `<div style="display:flex; flex-direction:column; gap:16px;">`;

  drafts.forEach(app => {
    const isCurrentlyEditing = (activeContractorEditingAppId === app.id);
    const totalOwners = (app.owners || []).length;
    const attachedOwners = (app.owners || []).filter(u => u.attachedDoc && u.attachedDoc.dataUrl).length;
    const completionPercent = totalOwners > 0 ? Math.round((attachedOwners / totalOwners) * 100) : 0;

    let structBadge = "";
    if (app.cadastre?.isTevhid || app.cadastre?.structureType === "tevhid" || app.cadastre?.structureType === "both") {
      structBadge += `<span class="badge-status-pill" style="background:#eff6ff; color:#1d4ed8; font-size:11px; margin-left:4px;">🔄 Tevhid</span>`;
    }
    if (app.cadastre?.isBlocks || app.cadastre?.structureType === "blocks" || app.cadastre?.structureType === "both") {
      const blocksText = (app.cadastre.blocksList && app.cadastre.blocksList.length) ? app.cadastre.blocksList.join(",") : "Bloklu";
      structBadge += `<span class="badge-status-pill" style="background:#f0fdf4; color:#15803d; font-size:11px; margin-left:4px;">🏢 ${escapeHtml(blocksText)}</span>`;
    }

    const lastUpdatedStr = app.lastUpdated ? new Date(app.lastUpdated).toLocaleString("tr-TR") : (app.date || app.submissionDate || "-");

    html += `
      <div style="background:#fefce8; border:1.5px solid ${isCurrentlyEditing ? '#ca8a04' : '#fde047'}; border-radius:14px; padding:18px 22px; box-shadow:0 3px 12px rgba(234,179,8,0.12); transition:all 0.2s ease;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span class="font-mono" style="font-size:15px; font-weight:800; color:#854d0e;">${escapeHtml(app.appNo)}</span>
              <span class="badge-status-pill" style="background:#fef08a; color:#854d0e; font-weight:800; border:1px solid #facc15;">
                💾 TASLAK (YARIM KALDI)
              </span>
              ${isCurrentlyEditing ? `<span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800; border:1px solid #86efac;">🟢 Şu An Düzenleniyor</span>` : ''}
              ${structBadge}
              <span style="font-size:12px; color:#713f12;">🕒 Son Kayıt: ${escapeHtml(lastUpdatedStr)}</span>
            </div>

            <h4 style="font-size:16px; font-weight:800; color:#0f3460; margin:6px 0 2px;">
              ${escapeHtml(app.cadastre ? parseAdaParsel(app.cadastre.oldAdaParsel).displayText : 'Ada/Parsel Belirtilmedi')} &bull; ${escapeHtml(app.cadastre?.neighborhood || 'Mahalle')}
            </h4>

            <div style="font-size:12.5px; color:#475569; margin-top:2px;">
              📍 Adres: <strong>${escapeHtml(app.cadastre?.address || '-')}</strong> &bull; 
              👥 Hak Sahipleri: <strong>${totalOwners} Bağımsız Bölüm</strong> &bull; 
              📁 Evraklar: <strong style="color:${attachedOwners === totalOwners && totalOwners > 0 ? '#15803d' : '#d97706'}">${attachedOwners}/${totalOwners} Yüklendi (%${completionPercent})</strong>
            </div>

            <div style="margin-top:8px; display:flex; align-items:center; gap:8px;">
              <div style="flex:1; max-width:240px; height:7px; background:#e2e8f0; border-radius:10px; overflow:hidden;">
                <div style="height:100%; width:${completionPercent}%; background:${completionPercent === 100 ? '#16a34a' : '#eab308'}; border-radius:10px; transition:width 0.3s ease;"></div>
              </div>
              <span style="font-size:11px; color:#854d0e; font-weight:700;">%${completionPercent} Tamamlandı</span>
            </div>
          </div>

          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <button type="button" class="btn-submit-big" onclick="loadAndResumeDraft('${app.id}')" style="background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding:8px 18px; font-size:13px; font-weight:800; box-shadow:0 3px 10px rgba(2,132,199,0.3);">
              ✏️ Düzenlemeye Kaldığın Yerden Devam Et
            </button>
            <button type="button" class="btn-action-sm btn-outline-danger" onclick="deleteDraftApplication('${app.id}')" style="padding:7px 12px; border-radius:8px;" title="Taslağı Sil">
              🗑️ Sil
            </button>
          </div>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

function renderContractorMyApps() {
  if (!activeContractorUser) return;
  const container = document.getElementById("contractor-my-apps-list-container");
  const badge = document.getElementById("contractor-apps-count-badge");
  if (!container) return;

  let myApps = getActiveContractorApps();
  if (myApps.length === 0 && applicationsList.length > 0) {
    applicationsList[0].submittedByEmail = activeContractorUser.email;
    if (applicationsList[0].company) {
      applicationsList[0].company.repEmail = activeContractorUser.email;
      applicationsList[0].company.name = activeContractorUser.companyName || applicationsList[0].company.name;
    }
    myApps = [applicationsList[0]];
    saveDataToStorage();
  }

  if (badge) badge.innerText = myApps.length;

  if (myApps.length === 0) {
    container.innerHTML = `
      <div style="background:#f8fafc; border:2px dashed #cbd5e1; border-radius:14px; padding:36px 20px; text-align:center;">
        <span style="font-size:40px; display:block; margin-bottom:10px;">📂</span>
        <h4 style="font-size:16px; font-weight:800; color:#0f172a; margin:0 0 6px;">Henüz Gönderilmiş Bir Başvuru Dosyanız Yok</h4>
        <p style="font-size:13px; color:#64748b; max-width:480px; margin:0 auto 18px;">
          Güngören Yarısı Bizden Kampanyası kapsamında kentsel dönüşüm projenizin başvurusunu hemen başlatabilirsiniz.
        </p>
        <button type="button" class="btn-submit-big" onclick="startNewContractorApplication()" style="padding:10px 22px; font-size:13.5px; margin:0 auto; background:linear-gradient(135deg, #15803d 0%, #166534 100%);">
          ➕ İlk Proje Başvurusunu Başlat
        </button>
      </div>
    `;
    return;
  }

  let html = `<div style="display:flex; flex-direction:column; gap:16px;">`;

  myApps.forEach(app => {
    const isDraft = (app.status === "Taslak" || app.isDraft);
    const isRevision = (app.status === "revizyon");
    const isApproved = (app.status === "onaylandi");
    const isReviewing = (app.status === "inceleniyor");
    const isRevised = (app.status === "revize_edildi");

    let statusPill = "";
    let borderClr = "#e2e8f0";
    let bgClr = "#ffffff";

    if (isDraft) {
      borderClr = "#eab308";
      bgClr = "#fefce8";
      statusPill = `<span class="badge-status-pill" style="background:#fef9c3; color:#854d0e; font-weight:800; border:1px solid #fde047;">🟡 TASLAK / YARIM KALDI</span>`;
    } else if (isRevision) {
      borderClr = "#f87171";
      bgClr = "#fff7ed";
      statusPill = `<span class="badge-status-pill" style="background:#fee2e2; color:#b91c1c; font-weight:800; border:1px solid #fca5a5;">⚠️ REVİZYON İSTENDİ (DÜZENLEME BEKLİYOR)</span>`;
    } else if (isRevised) {
      borderClr = "#f59e0b";
      bgClr = "#fffbeb";
      statusPill = `<span class="badge-status-pill" style="background:#fef3c7; color:#92400e; font-weight:800; border:1.5px solid #f59e0b; box-shadow:0 0 8px rgba(245,158,11,0.25);">🔄 REVİZE EDİLDİ (BELEDİYE İNCELİYOR)</span>`;
    } else if (isApproved) {
      borderClr = "#86efac";
      bgClr = "#f0fdf4";
      statusPill = `<span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800; border:1px solid #86efac;">✔ ONAYLANDI (ARAAD'A GÖNDERİLDİ)</span>`;
    } else if (isReviewing) {
      borderClr = "#fde68a";
      statusPill = `<span class="badge-status-pill" style="background:#fef3c7; color:#92400e; font-weight:800; border:1px solid #fcd34d;">🔍 PERSONEL İNCELİYOR</span>`;
    } else {
      borderClr = "#bfdbfe";
      statusPill = `<span class="badge-status-pill" style="background:#eff6ff; color:#1e40af; font-weight:800; border:1px solid #bfdbfe;">📥 BELEDİYE HAVUZUNDA BEKLİYOR</span>`;
    }

    const totalDocs = (app.owners || []).length;
    const attachedDocs = (app.owners || []).filter(u => u.attachedDoc && u.attachedDoc.dataUrl).length;

    // Son revizyon mesajını bul (varsa)
    let revisionMsgHtml = "";
    if (isRevision && app.messages && app.messages.length > 0) {
      const staffMsgs = app.messages.filter(m => m.senderRole === "staff");
      const lastStaffMsg = staffMsgs.length > 0 ? staffMsgs[staffMsgs.length - 1] : app.messages[app.messages.length - 1];
      revisionMsgHtml = `
        <div style="background:#fef2f2; border:1.5px solid #fecaca; border-radius:10px; padding:12px 16px; margin:12px 0 6px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <strong style="color:#b91c1c; font-size:12.5px; display:flex; align-items:center; gap:6px;">
              <span>⚠️ Belediye Yetkilisinin Revizyon Talebi:</span>
            </strong>
            <span style="font-size:11px; color:#991b1b; font-weight:600;">${escapeHtml(lastStaffMsg.time || '')}</span>
          </div>
          <div style="font-size:13px; color:#7f1d1d; line-height:1.45;">
            "${escapeHtml(lastStaffMsg.text)}"
          </div>
        </div>
      `;
    }

    let structBadge = "";
    if (app.cadastre?.isTevhid || app.cadastre?.structureType === "tevhid" || app.cadastre?.structureType === "both") {
      structBadge += `<span class="badge-status-pill" style="background:#eff6ff; color:#1d4ed8; font-size:11px; margin-left:4px;">🔄 Tevhid</span>`;
    }
    if (app.cadastre?.isBlocks || app.cadastre?.structureType === "blocks" || app.cadastre?.structureType === "both") {
      const blocksText = (app.cadastre.blocksList && app.cadastre.blocksList.length) ? app.cadastre.blocksList.join(",") : "Bloklu";
      structBadge += `<span class="badge-status-pill" style="background:#f0fdf4; color:#15803d; font-size:11px; margin-left:4px;">🏢 ${escapeHtml(blocksText)}</span>`;
    }

    html += `
      <div style="background:${bgClr}; border:1.5px solid ${borderClr}; border-radius:14px; padding:18px 22px; box-shadow:0 2px 8px rgba(0,0,0,0.04); transition:all 0.2s ease;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
          <div>
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <span class="font-mono" style="font-size:15px; font-weight:800; color:#0f172a;">${escapeHtml(app.appNo)}</span>
              ${statusPill}
              ${structBadge}
              <span style="font-size:12px; color:#64748b;">📅 ${escapeHtml(app.submissionDate || '-')}</span>
            </div>
            <h4 style="font-size:16px; font-weight:800; color:#0f3460; margin:6px 0 2px;">
              ${escapeHtml(app.cadastre ? parseAdaParsel(app.cadastre.oldAdaParsel).displayText : '')} &bull; ${escapeHtml(app.cadastre ? app.cadastre.neighborhood : '')}
            </h4>
            <div style="font-size:12.5px; color:#475569;">
              📍 Adres: ${escapeHtml(app.cadastre ? app.cadastre.address : '-')} &bull; 👥 Toplam Malik: <strong>${totalDocs} Bağımsız Bölüm</strong> &bull; 📁 Evrak: <strong>${attachedDocs}/${totalDocs} Yüklendi</strong>
            </div>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            ${isDraft ? `
              <button type="button" class="btn-submit-big" onclick="loadAndResumeDraft('${app.id}')" style="background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding:7px 16px; font-size:12.5px;">
                ✏️ Başvuruya Devam Et
              </button>
              <button type="button" class="btn-action-sm btn-outline-danger" onclick="deleteDraftApplication('${app.id}')" style="padding:6px 10px;" title="Taslağı Sil">
                🗑️
              </button>
            ` : `
              <button type="button" class="btn-action-sm btn-outline-primary" onclick="viewContractorApplication('${app.id}')" style="font-weight:700; padding:7px 14px; font-size:12.5px;">
                👁️ Dosyayı İncele
              </button>
              ${isRevision ? `
                <button type="button" class="btn-action-sm" onclick="startEditingRevision('${app.id}')" style="background:#dc2626; color:#ffffff; font-weight:800; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px; box-shadow:0 4px 10px rgba(220,38,38,0.25);">
                  ✏️ Revizyonu Düzenle &amp; Gönder
                </button>
              ` : (!isApproved && !isRevised) ? `
                <button type="button" class="btn-action-sm" onclick="startEditingRevision('${app.id}')" style="background:#2563eb; color:#ffffff; font-weight:800; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:12.5px; box-shadow:0 3px 8px rgba(37,99,235,0.25);">
                  ✏️ Düzenle / Revize Et
                </button>
              ` : ''}
            `}
          </div>
        </div>
        ${revisionMsgHtml}
        ${isRevised ? `
          <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-top:10px; font-size:12.5px; color:#166534; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
            <span>✅ <strong>Revizyon Gönderildi:</strong> Düzenlediğiniz bilgiler ve eklediğiniz evraklar Güngören Belediyesi personeline başarıyla iletildi. İnceleme tamamlandığında durumunuz güncellenecektir.</span>
            <span style="font-size:11px; color:#15803d; font-weight:700;">Son Güncelleme: ${escapeHtml(app.submissionDate || '')}</span>
          </div>
        ` : ''}
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

function startNewContractorApplication() {
  activeContractorEditingAppId = null;
  localStorage.removeItem("yb_active_editing_app_id");
  localStorage.removeItem("yb_form_owners");
  if (activeContractorUser) {
    localStorage.removeItem("yb_draft_" + activeContractorUser.email);
  }

  // 1. Bina, Kadastro, Adres ve Alan Bilgilerini Sıfırla (Bölüm 2)
  if (document.getElementById("b-ykn")) document.getElementById("b-ykn").value = "";
  if (document.getElementById("b-neighborhood")) document.getElementById("b-neighborhood").selectedIndex = 0;
  if (document.getElementById("b-permit-date")) document.getElementById("b-permit-date").value = "";
  if (document.getElementById("b-old-ada-parsel")) document.getElementById("b-old-ada-parsel").value = "";
  if (document.getElementById("b-new-ada-parsel")) document.getElementById("b-new-ada-parsel").value = "";
  if (document.getElementById("b-address")) document.getElementById("b-address").value = "";

  if (document.getElementById("m2-old-building")) document.getElementById("m2-old-building").value = "";
  if (document.getElementById("m2-new-building")) document.getElementById("m2-new-building").value = "";
  if (document.getElementById("m2-shelter")) document.getElementById("m2-shelter").value = "";
  if (document.getElementById("m2-parking")) document.getElementById("m2-parking").value = "";

  // Tevhid ve Blok yapı tiplerini sıfırla
  if (typeof projectActiveParcels !== "undefined") projectActiveParcels = [];
  if (typeof projectActiveBlocks !== "undefined") projectActiveBlocks = [];
  if (typeof setProjectStructureType === "function") setProjectStructureType("single");
  const blockCheckboxes = document.querySelectorAll('input[name="proj-block-choice"]');
  blockCheckboxes.forEach(cb => cb.checked = false);

  // 2. Şirket / Müteahhit Bilgilerini Aktif Giriş Yapan Firmaya Göre Doldur (Bölüm 1)
  if (activeContractorUser) {
    if (document.getElementById("c-company-name")) document.getElementById("c-company-name").value = activeContractorUser.companyName || "";
    if (document.getElementById("c-tax-no")) document.getElementById("c-tax-no").value = activeContractorUser.taxNo || "";
    if (document.getElementById("c-iban")) document.getElementById("c-iban").value = activeContractorUser.iban || "";
    if (document.getElementById("c-company-address")) document.getElementById("c-company-address").value = activeContractorUser.address || "";
    if (document.getElementById("c-rep-name")) document.getElementById("c-rep-name").value = activeContractorUser.repName || "";
    if (document.getElementById("c-rep-tc")) document.getElementById("c-rep-tc").value = activeContractorUser.repTc || "";
    if (document.getElementById("c-rep-birth")) document.getElementById("c-rep-birth").value = activeContractorUser.repBirth || "";
    if (document.getElementById("c-rep-email")) document.getElementById("c-rep-email").value = activeContractorUser.email || "";
    if (document.getElementById("c-rep-phone")) document.getElementById("c-rep-phone").value = activeContractorUser.phone || "";
  } else {
    [
      "c-company-name", "c-tax-no", "c-iban", "c-company-address",
      "c-rep-name", "c-rep-tc", "c-rep-birth", "c-rep-email", "c-rep-phone"
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  }

  // 3. 1.5 Kat Kuralı Kartını Sıfırla
  calculate15RuleContractor();

  // 4. Malikleri sıfırla ve 1 adet temiz satır ekle
  formOwners = [];
  formBuildingDocs = { contracts: null, proxies: null, mergedUnitsDoc: null };
  renderBuildingDocsUI();
  window.YB_DOC_STORE = {};
  addNewOwnerRow();
  renderContractorOwnersTable();
  if (typeof syncOwnersToSectionSchematic === "function") {
    syncOwnersToSectionSchematic(true);
  }

  // 5. Banner ve bildirimleri gizle
  const banner = document.getElementById("contractor-active-editing-banner");
  if (banner) banner.style.display = "none";
  const notice = document.getElementById("contractor-form-update-notice");
  if (notice) notice.style.display = "none";

  // 6. Formu kilitten çıkar
  unlockContractorForm();

  // 7. Gönderim butonunu ayarla
  resetSubmitActionBoxToDefault();

  // 8. Sekmeyi Başvuru Formu'na geçir
  switchContractorPortalTab("form");
  const btnForm = document.getElementById("btn-c-tab-form");
  if (btnForm) {
    btnForm.innerHTML = "📝 Yeni Başvuru Formu";
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
  showToast("✨ Yeni proje başvuru formu açıldı. Bilgileri sıfırdan doldurabilirsiniz.", "success");
}

function saveContractorApplicationDraft(stayOnForm = true) {
  if (!activeContractorUser) {
    showToast("Lütfen önce firma girişi yapınız.", "warning");
    return;
  }

  let activeApp = getContractorActiveApp();

  if (!activeApp) {
    const appNo = `YB-TASLAK-${Date.now().toString().slice(-4)}`;
    activeApp = {
      id: "app_" + Date.now(),
      appNo: appNo,
      date: new Date().toLocaleDateString("tr-TR"),
      submissionDate: new Date().toLocaleDateString("tr-TR"),
      timestamp: Date.now(),
      lastUpdated: Date.now(),
      status: "Taslak",
      statusText: "Taslak (Yarım Kaldı)",
      statusClass: "status-draft",
      submittedBy: activeContractorUser.repName || activeContractorUser.companyName,
      submittedByEmail: activeContractorUser.email,
      isDraft: true,
      company: {
        name: document.getElementById("c-company-name")?.value || activeContractorUser.companyName || "",
        taxNo: document.getElementById("c-tax-no")?.value || "",
        iban: document.getElementById("c-iban")?.value || "",
        companyAddress: document.getElementById("c-company-address")?.value || "",
        repName: document.getElementById("c-rep-name")?.value || activeContractorUser.repName || "",
        repTc: document.getElementById("c-rep-tc")?.value || "",
        repBirth: document.getElementById("c-rep-birth")?.value || "",
        repEmail: document.getElementById("c-rep-email")?.value || activeContractorUser.email || "",
        repPhone: document.getElementById("c-rep-phone")?.value || activeContractorUser.phone || ""
      },
      cadastre: {
        ykn: document.getElementById("b-ykn")?.value || "",
        neighborhood: document.getElementById("b-neighborhood")?.value || "",
        permitDate: document.getElementById("b-permit-date")?.value || "",
        oldAdaParsel: document.getElementById("b-old-ada-parsel")?.value || "",
        newAdaParsel: document.getElementById("b-new-ada-parsel")?.value || "",
        address: document.getElementById("b-address")?.value || "",
        oldM2: parseFloat(document.getElementById("m2-old-building")?.value) || 0,
        newM2: parseFloat(document.getElementById("m2-new-building")?.value) || 0,
        shelterM2: parseFloat(document.getElementById("m2-shelter")?.value) || 0,
        parkingM2: parseFloat(document.getElementById("m2-parking")?.value) || 0,
        structureType: currentStructureType,
        parcelsList: [...projectActiveParcels],
        parcelsMap: { ...projectParcelsMap },
        blocksList: [...projectActiveBlocks],
        blocksMap: { ...projectBlocksMap }
      },
      owners: JSON.parse(JSON.stringify(formOwners)),
      buildingDocs: JSON.parse(JSON.stringify(formBuildingDocs)),
      schematic: JSON.parse(JSON.stringify(buildingSchematicConfig))
    };
    applicationsList.unshift(activeApp);
    activeContractorEditingAppId = activeApp.id;
    safeSetLocalStorage("yb_active_editing_app_id", activeApp.id);
  } else {
    activeApp.status = "Taslak";
    activeApp.statusText = "Taslak (Yarım Kaldı)";
    activeApp.isDraft = true;
    activeApp.lastUpdated = Date.now();
    syncFormToAppObject(activeApp);
  }

  autoSaveContractorDraft();
  saveDataToStorage(true);

  updateContractorBadges();
  if (typeof renderContractorDrafts === "function") {
    renderContractorDrafts();
  }
  if (typeof renderContractorMyApps === "function") {
    renderContractorMyApps();
  }

  // Form üzerindeki düzenleme banner'ını hemen güncelle ve son kayıt saatini yaz
  const banner = document.getElementById("contractor-active-editing-banner");
  if (banner) {
    banner.style.display = "block";
    const nowTimeStr = new Date().toLocaleTimeString("tr-TR");
    banner.innerHTML = `
      <div style="background:#fefce8; border:2px solid #eab308; border-radius:12px; padding:14px 20px; box-shadow:0 4px 15px rgba(234,179,8,0.12); margin-bottom:18px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:24px;">💾</span>
            <div>
              <strong style="color:#854d0e; font-size:15px;">Taslak Başvuru Kaydedildi &bull; ${escapeHtml(activeApp.appNo)}</strong>
              <div style="font-size:12.5px; color:#a16207;">Son Kayıt: <strong>${nowTimeStr}</strong> &bull; Bilgileriniz tarayıcınıza güvenle saklandı. Formu doldurmaya kaldığınız yerden devam edebilirsiniz.</div>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn-action-sm" onclick="saveContractorApplicationDraft(true)" style="background:#f59e0b; color:#fff; font-weight:800; border:none; padding:7px 14px; border-radius:8px; cursor:pointer;">
              💾 Tekrar Kaydet
            </button>
            <button type="button" class="btn-action-sm" onclick="switchContractorPortalTab('drafts')" style="background:#fff; color:#854d0e; border:1.5px solid #ca8a04; font-weight:700; padding:6px 14px; border-radius:8px; cursor:pointer;">
              📂 Taslaklarıma Git
            </button>
          </div>
        </div>
      </div>
    `;
  }

  const btnForm = document.getElementById("btn-c-tab-form");
  if (btnForm) {
    btnForm.innerHTML = "📝 Başvuru Formu (Taslak Düzenleniyor)";
  }

  showToast(`💾 "${activeApp.appNo}" taslak olarak kaydedildi. Kaldığınız yerden formu doldurmaya devam edebilirsiniz.`, "success");

  // stayOnForm true ise kullanıcı sayfada kalır, false ise sekme değiştirir
  if (!stayOnForm) {
    switchContractorPortalTab("drafts");
  }
}

function loadAndResumeDraft(appId) {
  const app = applicationsList.find(a => a.id === appId);
  if (!app) return;

  activeContractorEditingAppId = app.id;
  safeSetLocalStorage("yb_active_editing_app_id", app.id);
  populateContractorFormFromApp(app);
  unlockContractorForm();

  switchContractorPortalTab("form");

  const btnForm = document.getElementById("btn-c-tab-form");
  if (btnForm) {
    btnForm.innerHTML = "📝 Bașvuru Formu (Taslak Düzenleniyor)";
  }

  const banner = document.getElementById("contractor-active-editing-banner");
  if (banner) {
    banner.style.display = "block";
    banner.innerHTML = `
      <div style="background:#fefce8; border:2px solid #eab308; border-radius:12px; padding:16px 20px; box-shadow:0 4px 15px rgba(234,179,8,0.12); margin-bottom:18px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:24px;">💾</span>
            <div>
              <strong style="color:#854d0e; font-size:15.5px;">Taslak Başvuru Düzenleme Modu</strong>
              <div style="font-size:12.5px; color:#a16207;">Kayıtlı Taslak: <strong>${escapeHtml(app.appNo)}</strong> &bull; Bilgilerinizi tamamlayıp belediyeye gönderebilir veya dilediğiniz an taslak olarak güncelleyebilirsiniz.</div>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn-action-sm" onclick="saveContractorApplicationDraft()" style="background:#f59e0b; color:#fff; font-weight:800; border:none; padding:7px 14px; border-radius:8px; cursor:pointer;">
              💾 Taslağı Güncelle
            </button>
            <button type="button" class="btn-action-sm" onclick="switchContractorPortalTab('drafts')" style="background:#fff; color:#854d0e; border:1.5px solid #ca8a04; font-weight:700; padding:6px 14px; border-radius:8px; cursor:pointer;">
              📁 Taslaklarıma Dön
            </button>
          </div>
        </div>
      </div>
    `;
  }

  showToast(`✏️ "${app.appNo}" taslak başvurusu yüklendi. Kaldığınız yerden devam edebilirsiniz.`, "info");
  const formSection = document.getElementById("contractor-section-form");
  if (formSection) {
    window.scrollTo({ top: formSection.offsetTop - 20, behavior: "smooth" });
  }
}

async function deleteDraftApplication(appId) {
  const confirmed = await showCustomConfirm({
    title: "Taslak Başvuruyu Sil",
    message: "Bu taslak başvuruyu silmek istediğinize emin misiniz? Taslak kalıcı olarak silinecektir.",
    confirmText: "🗑️ Evet, Taslağı Sil",
    cancelText: "Vazgeç",
    type: "danger"
  });
  if (!confirmed) return;
  const idx = applicationsList.findIndex(a => a.id === appId);
  if (idx !== -1) {
    applicationsList.splice(idx, 1);
    if (activeContractorEditingAppId === appId) {
      activeContractorEditingAppId = null;
      localStorage.removeItem("yb_active_editing_app_id");
    }
    saveDataToStorage(true);
    updateContractorBadges();
    if (typeof renderContractorDrafts === "function") renderContractorDrafts();
    if (typeof renderContractorMyApps === "function") renderContractorMyApps();
    showToast("Taslak başvuru silindi.", "info");
  }
}

function startEditingRevision(appId) {
  const app = applicationsList.find(a => a.id === appId);
  if (!app) return;

  activeContractorEditingAppId = appId;
  safeSetLocalStorage("yb_active_editing_app_id", appId);
  populateContractorFormFromApp(app);
  unlockContractorForm();

  // Banner'ı güncelle ve göster
  const banner = document.getElementById("contractor-active-editing-banner");
  if (banner) {
    const staffMsgs = (app.messages || []).filter(m => m.senderRole === "staff");
    const lastStaffMsg = staffMsgs.length > 0 ? staffMsgs[staffMsgs.length - 1] : null;

    banner.style.display = "block";
    banner.innerHTML = `
      <div style="background:#fff7ed; border:2px solid #f97316; border-radius:12px; padding:18px 22px; box-shadow:0 4px 15px rgba(249,115,22,0.12); margin-bottom:18px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:24px;">✏️</span>
            <div>
              <strong style="color:#9a3412; font-size:15.5px;">Dosya Düzenleme &amp; Revizyon Modu</strong>
              <div style="font-size:12.5px; color:#c2410c;">Düzenlenen Dosya No: <strong>${escapeHtml(app.appNo)}</strong> &bull; ${escapeHtml(app.cadastre?.neighborhood || '')} (${escapeHtml(app.cadastre ? parseAdaParsel(app.cadastre.oldAdaParsel).displayText : '')})</div>
            </div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="badge-status-pill" style="background:#ffedd5; color:#c2410c; font-weight:800; font-size:12px; border:1px solid #fdba74;">
              ${app.status === 'revizyon' ? '⚠️ Revizyon Talebi Var' : '✏️ Aktif Düzenleme'}
            </span>
            <button type="button" class="btn-action-sm btn-outline-secondary" onclick="cancelEditingRevision()" style="font-size:12px; font-weight:700;">
              ✕ Düzenlemeyi İptal Et
            </button>
          </div>
        </div>
        ${lastStaffMsg ? `
          <div style="background:#fff; border:1.5px solid #fecaca; border-radius:8px; padding:10px 14px; margin:8px 0; font-size:13px; color:#7f1d1d;">
            <strong>Personel Revizyon Notu:</strong> "${escapeHtml(lastStaffMsg.text)}" <span style="font-size:11px; color:#991b1b; margin-left:6px;">(${escapeHtml(lastStaffMsg.time || '')})</span>
          </div>
        ` : ''}
        <p style="font-size:12.5px; color:#9a3412; margin:6px 0 0;">
          İstediğiniz alanları, bina ölçülerini ve malik evraklarını güncelleyiniz. Değişiklikleriniz otomatik kaydedilir. Göndermeye hazır olduğunuzda aşağıdaki <strong>"🔄 Revize Edilmiş Dosyayı Tekrar Belediyeye Gönder"</strong> butonuna tıklayınız.
        </p>
      </div>
    `;
  }

  // Gönderim butonunu Revizyon Gönder haline getir
  const submitBox = document.getElementById("submit-action-box");
  if (submitBox) {
    submitBox.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px; width:100%; background:#fff7ed; border:2px solid #f97316; border-radius:12px; padding:18px 24px;">
        <div>
          <strong style="color:#c2410c; font-size:15px; display:block;">Dosya Revizyon Düzenleme Modunda (${escapeHtml(app.appNo)})</strong>
          <span style="font-size:12.5px; color:#7c2d12;">Gerekli tüm değişiklikleri tamamladıktan sonra belediyeye iletiniz.</span>
        </div>
        <button type="button" class="btn-submit-big" onclick="handleContractorSubmit(event)" style="background:linear-gradient(135deg, #ea580c 0%, #c2410c 100%); cursor:pointer; font-weight:800; font-size:14.5px; padding:14px 26px; box-shadow:0 6px 18px rgba(234,88,12,0.35);">
          <span>🔄 Revize Edilmiş Dosyayı Tekrar Belediyeye Gönder</span>
        </button>
      </div>
    `;
  }

  const btnMyApps = document.getElementById("btn-c-tab-my-apps");
  const btnForm = document.getElementById("btn-c-tab-form");
  const secMyApps = document.getElementById("contractor-section-my-apps");
  const secForm = document.getElementById("contractor-section-form");

  if (btnForm) {
    btnForm.classList.add("active");
    btnForm.innerHTML = `✏️ Revizyon Düzenle (${escapeHtml(app.appNo)})`;
  }
  if (btnMyApps) btnMyApps.classList.remove("active");
  if (secForm) secForm.style.display = "block";
  if (secMyApps) secMyApps.style.display = "none";

  window.scrollTo({ top: 0, behavior: "smooth" });
  showToast(`"${app.appNo}" nolu dosya düzenleme için açıldı.`, "info");
}

function cancelEditingContractorApp() {
  activeContractorEditingAppId = null;
  localStorage.removeItem("yb_active_editing_app_id");
  const banner = document.getElementById("contractor-active-editing-banner");
  if (banner) banner.style.display = "none";
  resetSubmitActionBoxToDefault();
  const btnForm = document.getElementById("btn-c-tab-form");
  if (btnForm) btnForm.innerHTML = "📝 Başvuru Formu";
  switchContractorPortalTab("drafts");
  showToast("Taslak düzenleme modu kapatıldı.", "info");
}

function cancelEditingRevision() {
  activeContractorEditingAppId = null;
  localStorage.removeItem("yb_active_editing_app_id");
  const banner = document.getElementById("contractor-active-editing-banner");
  if (banner) banner.style.display = "none";
  resetSubmitActionBoxToDefault();
  const btnForm = document.getElementById("btn-c-tab-form");
  if (btnForm) btnForm.innerHTML = "➕ Yeni Başvuru Yap (Sıfır Form)";
  switchContractorPortalTab("my-apps");
  showToast("Düzenleme modu kapatıldı.", "info");
}

function resetSubmitActionBoxToDefault() {
  const submitBox = document.getElementById("submit-action-box");
  if (submitBox) {
    submitBox.innerHTML = `
      <div>
        <h4 style="font-size:15px; font-weight:700;" id="submit-box-title">Bilgileri Kontrol Ettiniz mi?</h4>
        <p style="font-size:12.5px; color:#64748b;" id="submit-box-sub">Gönderdiğiniz an dosyanız Güngören Belediyesi Kentsel Dönüşüm Masasına iletilecektir.</p>
      </div>
      <button type="button" class="btn-submit-big" id="btn-main-contractor-submit" onclick="handleContractorSubmit(event)">
        <span>🚀 Başvuruyu Belediyeye Gönder</span>
      </button>
    `;
  }
}

function viewContractorApplication(appId) {
  const app = applicationsList.find(a => a.id === appId);
  if (!app) return;

  activeContractorEditingAppId = null;
  localStorage.removeItem("yb_active_editing_app_id");
  populateContractorFormFromApp(app);
  lockContractorForm(app);

  const banner = document.getElementById("contractor-active-editing-banner");
  if (banner) {
    banner.style.display = "block";
    let statusText = "Belediye İncelemesinde";
    let bgStyle = "background:#f0fdf4; border:1.5px solid #86efac; color:#166534;";
    if (app.status === 'onaylandi') {
      statusText = "Onaylandı & ARAAD'a Gönderildi";
      bgStyle = "background:#dcfce7; border:1.5px solid #86efac; color:#15803d;";
    } else if (app.status === 'revize_edildi') {
      statusText = "Revize Edildi (Belediye Yeniden İnceliyor)";
      bgStyle = "background:#fffbeb; border:1.5px solid #f59e0b; color:#92400e;";
    } else if (app.status === 'revizyon') {
      statusText = "Revizyon İstendi (Düzenleme Bekliyor)";
      bgStyle = "background:#fef2f2; border:1.5px solid #ef4444; color:#991b1b;";
    }

    banner.innerHTML = `
      <div style="${bgStyle} border-radius:10px; padding:12px 18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">🔒</span>
          <span style="font-size:13px; font-weight:700;">
            Görüntülenen Dosya: <strong>${escapeHtml(app.appNo)}</strong> &bull; (${statusText})
          </span>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          ${app.status !== 'onaylandi' ? `
            <button type="button" class="btn-action-sm" onclick="startEditingRevision('${app.id}')" style="background:#2563eb; color:#fff; font-weight:800; border:none; padding:7px 16px; border-radius:6px; cursor:pointer; box-shadow:0 3px 8px rgba(37,99,235,0.25);">
              ✏️ Bu Dosyayı Düzenle / Revize Et
            </button>
          ` : ''}
          <button type="button" class="btn-action-sm" onclick="startNewContractorApplication()" style="background:#15803d; color:#fff; font-weight:800; border:none; padding:7px 14px; border-radius:6px; cursor:pointer;">
            ➕ Yeni Başvuru Başlat
          </button>
          <button type="button" class="btn-action-sm btn-outline-secondary" onclick="switchContractorPortalTab('my-apps')">
            ← Başvuru Dosyalarıma Dön
          </button>
        </div>
      </div>
    `;
  }

  const btnMyApps = document.getElementById("btn-c-tab-my-apps");
  const btnForm = document.getElementById("btn-c-tab-form");
  const secMyApps = document.getElementById("contractor-section-my-apps");
  const secForm = document.getElementById("contractor-section-form");

  if (btnForm) {
    btnForm.classList.add("active");
    btnForm.innerHTML = `👁️ Dosya İncele (${escapeHtml(app.appNo)})`;
  }
  if (btnMyApps) btnMyApps.classList.remove("active");
  if (secForm) secForm.style.display = "block";
  if (secMyApps) secMyApps.style.display = "none";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// =========================================================================
// PERSONEL SUB-TAB GEÇİŞİ & KAYITLI MÜTEAHHİT LİSTESİ
// =========================================================================
function switchStaffSubTab(tab) {
  const btnPool = document.getElementById("btn-staff-subtab-pool");
  const btnContractors = document.getElementById("btn-staff-subtab-contractors");
  const secPool = document.getElementById("staff-section-pool");
  const secContractors = document.getElementById("staff-section-contractors");

  if (tab === "pool") {
    if (btnPool) btnPool.classList.add("active");
    if (btnContractors) btnContractors.classList.remove("active");
    if (secPool) secPool.style.display = "block";
    if (secContractors) secContractors.style.display = "none";
  } else {
    if (btnContractors) btnContractors.classList.add("active");
    if (btnPool) btnPool.classList.remove("active");
    if (secContractors) secContractors.style.display = "block";
    if (secPool) secPool.style.display = "none";
    renderRegisteredContractorsList();
  }
}

function renderRegisteredContractorsList() {
  const tbody = document.getElementById("registered-contractors-tbody");
  const badge = document.getElementById("contractors-stats-badge");
  const countBadge = document.getElementById("subtab-contractors-count");
  if (!tbody) return;

  tbody.innerHTML = "";
  if (badge) badge.innerText = `${contractorUsers.length} Firma Kayıtlı`;
  if (countBadge) countBadge.innerText = contractorUsers.length;

  contractorUsers.forEach(u => {
    // Bu firmanın gönderdiği dosyaları say
    const userApps = applicationsList.filter(a =>
      (a.submittedByEmail && a.submittedByEmail.toLowerCase() === u.email.toLowerCase()) ||
      (a.company && a.company.repEmail && a.company.repEmail.toLowerCase() === u.email.toLowerCase())
    );

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(u.companyName)}</strong></td>
      <td>${escapeHtml(u.repName)}</td>
      <td class="font-mono" style="color:#0369a1;">${escapeHtml(u.email)}</td>
      <td class="font-mono">${escapeHtml(u.phone || '-')}</td>
      <td>${escapeHtml(u.registeredAt || '2024')}</td>
      <td class="text-center">
        <span class="badge-status-pill" style="background:#e0f2fe; color:#0369a1;">
          📁 ${userApps.length} Başvuru
        </span>
      </td>
      <td class="text-center">
        <span class="badge-status-pill" style="background:#dcfce7; color:#15803d;">Aktif Hesap</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// =========================================================================
// REVİZYON & ÇİFT TARAFLI CHAT / MESAJLAŞMA SİSTEMİ
// =========================================================================
function openRevisionChatModal() {
  if (!selectedAppId) return;
  const app = applicationsList.find(a => a.id === selectedAppId);
  if (!app) return;

  activeChatAppId = selectedAppId;
  if (!app.messages) app.messages = [];

  document.getElementById("chat-modal-app-no").innerText = app.appNo;
  document.getElementById("chat-modal-company-name").innerText = app.company.name;
  document.getElementById("chat-modal-email").innerText = app.submittedByEmail || app.company.repEmail || "-";

  renderChatModalMessages(app.messages);
  document.getElementById("chat-modal-input-text").value = "";
  document.getElementById("revision-chat-modal").style.display = "flex";
}

function closeRevisionChatModal() {
  document.getElementById("revision-chat-modal").style.display = "none";
}

function renderChatModalMessages(messages) {
  const container = document.getElementById("chat-modal-messages-container");
  if (!container) return;
  container.innerHTML = "";

  if (!messages || messages.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:20px; color:#94a3b8; font-size:12.5px;">
        Henüz bir revizyon mesajı bulunmuyor. Aşağıdan müteahhide revizyon talebi iletebilirsiniz.
      </div>
    `;
    return;
  }

  messages.forEach(m => {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${m.senderRole === "staff" ? "staff" : "contractor"}`;
    bubble.innerHTML = `
      <div class="chat-bubble-author">
        <span>${escapeHtml(m.sender)}</span>
        <span class="chat-bubble-time">${escapeHtml(m.time)}</span>
      </div>
      <div>${escapeHtml(m.text)}</div>
    `;
    container.appendChild(bubble);
  });
  container.scrollTop = container.scrollHeight;
}

function sendStaffRevisionMessage() {
  if (!activeChatAppId) return;
  const app = applicationsList.find(a => a.id === activeChatAppId);
  if (!app) return;

  const input = document.getElementById("chat-modal-input-text");
  const text = input ? input.value.trim() : "";
  if (!text) {
    showToast("Lütfen iletmek istediğiniz revizyon notunu yazınız.", "warning");
    return;
  }

  if (!app.messages) app.messages = [];
  const nowStr = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) + " - " + new Date().toLocaleDateString("tr-TR");

  app.messages.push({
    sender: currentStaff.name,
    senderRole: "staff",
    text: text,
    time: nowStr
  });

  app.status = "revizyon";
  saveDataToStorage();
  updateHeaderCounts();
  renderApplicationsPool();
  openApplicationDetail(app.id);

  showToast(`✅ Revizyon mesajı "${app.company.name}" firmasına iletildi!`, "success");
  closeRevisionChatModal();
}

function checkContractorRevisions() {
  const alertBox = document.getElementById("contractor-revision-alert-box");
  const listEl = document.getElementById("contractor-revision-chat-list");
  if (!alertBox || !listEl || !activeContractorUser) return;

  const myRevApps = applicationsList.filter(a =>
    ((a.submittedByEmail && a.submittedByEmail.toLowerCase() === activeContractorUser.email.toLowerCase()) ||
      (a.company && a.company.repEmail && a.company.repEmail.toLowerCase() === activeContractorUser.email.toLowerCase())) &&
    a.status === "revizyon"
  );

  if (myRevApps.length === 0) {
    alertBox.style.display = "none";
    return;
  }

  alertBox.style.display = "block";
  listEl.innerHTML = "";

  myRevApps.forEach(app => {
    const cardDiv = document.createElement("div");
    cardDiv.style.cssText = "background:#fff; border:1px solid #fecaca; border-radius:10px; padding:12px; margin-bottom:12px;";

    let msgsHtml = "";
    if (app.messages && app.messages.length > 0) {
      app.messages.forEach(m => {
        msgsHtml += `
          <div class="chat-bubble ${m.senderRole === "staff" ? "staff" : "contractor"}" style="max-width:100%; margin-bottom:8px;">
            <div class="chat-bubble-author">
              <span>${escapeHtml(m.sender)} [Dosya: ${escapeHtml(app.appNo)}]</span>
              <span class="chat-bubble-time">${escapeHtml(m.time)}</span>
            </div>
            <div>${escapeHtml(m.text)}</div>
          </div>
        `;
      });
    }

    cardDiv.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #fee2e2; padding-bottom:6px;">
        <strong style="color:#b91c1c; font-size:13px;">📋 Takip No: ${escapeHtml(app.appNo)} (${escapeHtml(app.cadastre ? app.cadastre.oldAdaParsel : '')})</strong>
        <button type="button" class="btn-action-sm" onclick="startEditingRevision('${app.id}')" style="background:#dc2626; color:#fff; font-weight:800; border:none; padding:6px 14px; border-radius:6px; cursor:pointer; font-size:12px;">
          ✏️ Dosyayı Düzenle &amp; Gönder
        </button>
      </div>
      <div>${msgsHtml}</div>
    `;
    listEl.appendChild(cardDiv);
  });
}

function sendContractorReplyMessage() {
  if (!activeContractorUser) return;
  const input = document.getElementById("contractor-reply-input");
  const text = input ? input.value.trim() : "";
  if (!text) {
    showToast("Lütfen belediye personeline iletmek istediğiniz cevabı yazınız.", "warning");
    return;
  }

  const myRevApps = applicationsList.filter(a =>
    ((a.submittedByEmail && a.submittedByEmail.toLowerCase() === activeContractorUser.email.toLowerCase()) ||
      (a.company && a.company.repEmail && a.company.repEmail.toLowerCase() === activeContractorUser.email.toLowerCase())) &&
    a.status === "revizyon"
  );

  if (myRevApps.length === 0) {
    showToast("Aktif revizyon dosyası bulunamadı.", "warning");
    return;
  }

  const targetApp = myRevApps[0];
  if (!targetApp.messages) targetApp.messages = [];

  const nowStr = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) + " - " + new Date().toLocaleDateString("tr-TR");
  targetApp.messages.push({
    sender: `${activeContractorUser.companyName} (${activeContractorUser.repName})`,
    senderRole: "contractor",
    text: text,
    time: nowStr
  });

  input.value = "";
  saveDataToStorage();
  checkContractorRevisions();
  showToast("✅ Cevabınız Güngören Belediyesi personeline iletildi!", "success");
}

// --- AKTİF PERSONEL DEĞİŞTİRME ---
function changeActiveStaff(staffId) {
  if (STAFF_LIST[staffId]) {
    currentStaff = STAFF_LIST[staffId];
    updateStaffUI();
    saveDataToStorage();
    renderApplicationsPool();
    showToast(`Aktif Masa: ${currentStaff.name}`, "info");
  }
}

function updateStaffUI() {
  document.getElementById("active-staff-avatar").innerText = currentStaff.avatar;
  document.getElementById("active-staff-name").innerText = currentStaff.name;
}

// --- BAŞVURU HAVUZU SAYAÇLARI ---
function updateHeaderCounts() {
  const pendingCount = applicationsList.filter(a => a.status === "havuzda").length;
  document.getElementById("header-pending-count").innerText = pendingCount;
  const badgeText = document.getElementById("pool-badge-text");
  if (badgeText) badgeText.innerText = `${pendingCount} Yeni Dosya Havuzda Bekliyor`;
}

// =========================================================================
// MÜTEAHHİT BAŞVURU FORMU FONKSİYONLARI
// =========================================================================

function addNewOwnerRow(customData = null) {
  const isTevhid = currentStructureType === "tevhid";
  const isBlocks = currentStructureType === "blocks";

  const targetParcel = isTevhid ? (activeInputParcel || projectActiveParcels[0] || "260/5") : (projectActiveParcels[0] || "260/5");
  const targetBlock = isBlocks ? (activeInputBlock || projectActiveBlocks[0] || "A Blok") : (projectActiveBlocks[0] || "A Blok");

  // Mevcut birim sayısı
  let countInGroup = 0;
  if (isTevhid) {
    countInGroup = formOwners.filter(o => (o.parcel || projectActiveParcels[0]) === targetParcel).length;
  } else if (isBlocks) {
    countInGroup = formOwners.filter(o => (o.block || projectActiveBlocks[0]) === targetBlock).length;
  } else {
    countInGroup = formOwners.length;
  }
  const nextNo = countInGroup + 1;

  const newRow = customData || {
    id: "fo_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    parcel: targetParcel,
    block: targetBlock,
    oldUnitNo: nextNo.toString(),
    floor: nextNo <= 2 ? "Bodrum Kat" : (nextNo <= 4 ? "Zemin Kat" : `${Math.ceil((nextNo - 4) / 2)}. Kat`),
    type: nextNo <= 2 ? "Ticari (Dükkan)" : "Konut (Daire)",
    tc: "",
    phone: "",
    firstName: "",
    lastName: "",
    birthDate: "",
    ownerAddress: "Güngören / İSTANBUL",
    shareNum: 1,
    shareDenom: 1
  };

  formOwners.push(newRow);
  renderOwnersBlockTabs();
  renderContractorOwnersTable();
  saveDataToStorage();

  if (typeof syncOwnersToSectionSchematic === "function") {
    syncOwnersToSectionSchematic(true);
  }
  if (typeof updatePreSubmitChecklist === "function") {
    updatePreSubmitChecklist();
  }
}

function deleteOwnerRow(index) {
  if (formOwners.length <= 1) {
    showToast("En az bir bağımsız bölüm bulunmalıdır.", "warning");
    return;
  }
  formOwners.splice(index, 1);
  renderOwnersBlockTabs();
  renderContractorOwnersTable();
  saveDataToStorage();

  if (typeof syncOwnersToSectionSchematic === "function") {
    syncOwnersToSectionSchematic(true);
  }
  if (typeof updatePreSubmitChecklist === "function") {
    updatePreSubmitChecklist();
  }
}

// --- TELEFON TEMİZLEME YARDIMCISI (BAŞINDA 0 OLMAYACAK, MAX 10 HANE) ---
function cleanPhoneInput(val) {
  if (!val) return "";
  let digits = val.toString().replace(/\D/g, "");
  // Baştaki 0'ları tamamen temizle
  digits = digits.replace(/^0+/, "");
  // Max 10 hane (5XXXXXXXXX)
  return digits.substring(0, 10);
}

// --- T.C. KİMLİK NO TEMİZLEME (SADECE RAKAM, MAX 11 HANE) ---
function cleanTcInput(val) {
  if (!val) return "";
  return val.toString().replace(/\D/g, "").substring(0, 11);
}

// --- VERGİ NUMARASI TEMİZLEME (SADECE RAKAM, MAX 10 HANE) ---
function cleanTaxNoInput(val) {
  if (!val) return "";
  return val.toString().replace(/\D/g, "").substring(0, 10);
}

// --- IBAN BİÇİMLENDİRME & KISITLAMA (TR + MAX 24 HANE, TOPLAM 26 KARAKTER) ---
function formatIbanInput(val) {
  if (!val) return "";
  let clean = val.toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
  // TR öneki kontrolü
  if (!clean.startsWith("TR")) {
    clean = "TR" + clean.replace(/^TR/, "");
  }
  const prefix = clean.substring(0, 2);
  const digits = clean.substring(2).replace(/\D/g, "").substring(0, 24);
  const fullIban = prefix + digits;

  // 4'erli bloklar halinde formatla
  let formatted = "";
  for (let i = 0; i < fullIban.length; i += 4) {
    if (i > 0) formatted += " ";
    formatted += fullIban.substring(i, i + 4);
  }
  return formatted;
}

function getShareValidationData(unitNo) {
  const cleanNo = (unitNo || "").toString().trim();
  if (!cleanNo) return { isShared: false, totalSum: 1, count: 1 };

  const sameUnitOwners = (formOwners || []).filter(o => (o.oldUnitNo || "").toString().trim() === cleanNo);
  const count = sameUnitOwners.length;
  const isShared = count > 1;

  let totalSum = 0;
  sameUnitOwners.forEach(o => {
    const num = Number(o.shareNum) || 1;
    const den = Number(o.shareDenom) || 1;
    totalSum += (num / (den > 0 ? den : 1));
  });

  return { isShared, totalSum, count };
}

function renderShareBadgeContent(u, origIndex) {
  const { isShared, totalSum } = getShareValidationData(u.oldUnitNo);
  if (isShared) {
    if (Math.abs(totalSum - 1.0) < 0.001) {
      return `<span style="font-size:9.5px; font-weight:800; color:#15803d; background:#dcfce7; border:1px solid #86efac; border-radius:4px; padding:1px 5px; white-space:nowrap; display:inline-block; margin-top:3px;" title="Bu bağımsız bölümün tüm hissedar payları toplamı 1 tam hisseyi (%100) eksiksiz tamamlamaktadır.">✅ Tam Hisse</span>`;
    } else if (totalSum > 1.001) {
      return `<span style="font-size:9.5px; font-weight:800; color:#b91c1c; background:#fee2e2; border:1px solid #fca5a5; border-radius:4px; padding:1px 5px; white-space:nowrap; display:inline-block; margin-top:3px;" title="Hisse toplamı 1 tamı aşıyor! (Toplam: ${(totalSum).toFixed(2)} / 1)">🚨 Fazla Hisse</span>`;
    } else {
      return `<span style="font-size:9.5px; font-weight:800; color:#b45309; background:#fef3c7; border:1px solid #fcd34d; border-radius:4px; padding:1px 5px; white-space:nowrap; display:inline-block; margin-top:3px;" title="Hissedar payları toplamı henüz 1 tam etmiyor! (Toplam: %${Math.round(totalSum * 100)})">⚠️ Eksik Hisse</span>`;
    }
  } else {
    const num = Number(u.shareNum) || 1;
    const den = Number(u.shareDenom) || 1;
    const myShare = num / (den > 0 ? den : 1);
    if (Math.abs(myShare - 1.0) < 0.001) {
      return `<span style="font-size:9px; font-weight:600; color:#64748b; margin-top:3px; display:inline-block;">Tam Mülk</span>`;
    } else {
      return `<span style="font-size:9.5px; font-weight:700; color:#b45309; background:#fffbeb; border:1px solid #fde68a; border-radius:4px; padding:1px 4px; white-space:nowrap; display:inline-block; margin-top:3px;" title="Hisseli tapu; diğer hissedarları da aynı Eski BB No ile ekleyiniz.">Hisseli (%${Math.round(myShare * 100)})</span>`;
    }
  }
}

function renderUnitNoBadgeContent(u, origIndex) {
  const { isShared } = getShareValidationData(u.oldUnitNo);
  if (isShared) {
    return `<span style="font-size:9px; font-weight:800; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; border-radius:3px; padding:1px 4px; display:inline-block; margin-top:2px;">👥 Hisseli</span>`;
  }
  return "";
}

function updateLiveShareBadges() {
  (formOwners || []).forEach((u, idx) => {
    const shareWrap = document.getElementById(`share-badge-wrap-${idx}`);
    if (shareWrap) {
      shareWrap.innerHTML = renderShareBadgeContent(u, idx);
    }
    const unitWrap = document.getElementById(`unit-badge-wrap-${idx}`);
    if (unitWrap) {
      unitWrap.innerHTML = renderUnitNoBadgeContent(u, idx);
    }
  });
}

function renderContractorOwnersTable() {
  const tbody = document.getElementById("owners-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";
  const isTevhid = currentStructureType === "tevhid";
  const isBlocks = currentStructureType === "blocks";

  // Sekmeleri güncelle
  if (isTevhid || isBlocks) {
    renderOwnersBlockTabs();
  }

  // Gösterilecek birimleri belirle
  let itemsToRender = [];
  if (isTevhid) {
    itemsToRender = formOwners
      .map((u, origIndex) => ({ u, origIndex }))
      .filter(item => (item.u.parcel || projectActiveParcels[0]) === activeInputParcel);

    if (itemsToRender.length === 0 && formOwners.length === 0) {
      const newRow = {
        id: "fo_" + Date.now(),
        parcel: activeInputParcel || projectActiveParcels[0] || "260/5",
        block: projectActiveBlocks[0] || "A Blok",
        oldUnitNo: "1",
        floor: "Zemin Kat",
        type: "Konut (Daire)",
        tc: "", phone: "", firstName: "", lastName: "", birthDate: "",
        ownerAddress: "Güngören / İSTANBUL", shareNum: 1, shareDenom: 1
      };
      formOwners.push(newRow);
      itemsToRender = [{ u: newRow, origIndex: 0 }];
    }
  } else if (isBlocks) {
    itemsToRender = formOwners
      .map((u, origIndex) => ({ u, origIndex }))
      .filter(item => (item.u.block || projectActiveBlocks[0]) === activeInputBlock);

    if (itemsToRender.length === 0 && formOwners.length === 0) {
      const newRow = {
        id: "fo_" + Date.now(),
        parcel: projectActiveParcels[0] || "260/5",
        block: activeInputBlock || projectActiveBlocks[0] || "A Blok",
        oldUnitNo: "1",
        floor: "Zemin Kat",
        type: "Konut (Daire)",
        tc: "", phone: "", firstName: "", lastName: "", birthDate: "",
        ownerAddress: "Güngören / İSTANBUL", shareNum: 1, shareDenom: 1
      };
      formOwners.push(newRow);
      itemsToRender = [{ u: newRow, origIndex: 0 }];
    }
  } else {
    itemsToRender = formOwners.map((u, origIndex) => ({ u, origIndex }));
  }

  itemsToRender.forEach(item => {
    const u = item.u;
    const index = item.origIndex;
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <div style="display:flex; flex-direction:column; align-items:center;">
          <input type="text" class="tbl-input" style="width: 50px; text-align: center; font-weight:700;" value="${escapeHtml(u.oldUnitNo)}" oninput="updateFormOwner(${index}, 'oldUnitNo', this.value)">
          <div id="unit-badge-wrap-${index}">${renderUnitNoBadgeContent(u, index)}</div>
        </div>
      </td>
      <td>
        <input type="text" class="tbl-input" value="${escapeHtml(u.floor)}" oninput="updateFormOwner(${index}, 'floor', this.value)">
      </td>
      <td>
        <select class="tbl-select" onchange="updateFormOwner(${index}, 'type', this.value)">
          <option value="Konut (Daire)" ${u.type.includes("Konut") ? "selected" : ""}>Konut</option>
          <option value="Ticari (Dükkan)" ${u.type.includes("Ticari") ? "selected" : ""}>Ticari</option>
          <option value="Depo" ${u.type.includes("Depo") ? "selected" : ""}>Depo</option>
        </select>
      </td>
      <td>
        <input type="text" maxlength="11" class="tbl-input font-mono" placeholder="11 Haneli T.C." value="${escapeHtml(u.tc)}" oninput="this.value = cleanTcInput(this.value); updateFormOwner(${index}, 'tc', this.value)">
      </td>
      <td>
        <input type="text" maxlength="10" class="tbl-input font-mono" placeholder="5XXXXXXXXX" value="${escapeHtml(u.phone)}" oninput="this.value = cleanPhoneInput(this.value); updateFormOwner(${index}, 'phone', this.value)">
      </td>
      <td>
        <input type="text" class="tbl-input" placeholder="Ad" style="font-weight:600;" value="${escapeHtml(u.firstName)}" oninput="updateFormOwner(${index}, 'firstName', this.value)">
      </td>
      <td>
        <input type="text" class="tbl-input" placeholder="Soyad" style="font-weight:600;" value="${escapeHtml(u.lastName)}" oninput="updateFormOwner(${index}, 'lastName', this.value)">
      </td>
      <td>
        <input type="text" class="tbl-input font-mono" placeholder="GG.AA.YYYY" value="${escapeHtml(u.birthDate)}" oninput="updateFormOwner(${index}, 'birthDate', this.value)">
      </td>
      <td>
        <input type="text" class="tbl-input" placeholder="Malik Adresi" value="${escapeHtml(u.ownerAddress)}" oninput="updateFormOwner(${index}, 'ownerAddress', this.value)">
      </td>
      <td>
        <div style="display:flex; flex-direction:column; align-items:center;">
          <div style="display:flex; align-items:center; gap:2px;">
            <input type="number" min="1" class="tbl-input" style="width:38px; text-align:center; font-weight:700; padding:4px 2px;" value="${u.shareNum}" oninput="updateFormOwner(${index}, 'shareNum', Number(this.value))">
            <span style="font-weight:bold; color:#64748b;">/</span>
            <input type="number" min="1" class="tbl-input" style="width:38px; text-align:center; font-weight:700; padding:4px 2px;" value="${u.shareDenom}" oninput="updateFormOwner(${index}, 'shareDenom', Number(this.value))">
          </div>
          <div id="share-badge-wrap-${index}">${renderShareBadgeContent(u, index)}</div>
        </div>
      </td>
      <td class="text-center">
        ${u.hasProxy ? `
          <button type="button" class="proxy-pill proxy-pill-active" onclick="openProxyModal(${index})" title="Vekil: ${escapeHtml(u.proxyName || '')} (TC: ${escapeHtml(u.proxyTc || '')})">
            📜 Vekil: ${escapeHtml((u.proxyName || 'Vekaleten').split(' ')[0])}
          </button>
        ` : `
          <button type="button" class="proxy-pill proxy-pill-none" onclick="openProxyModal(${index})" title="Malik vekaletsizdir. Randevu: ${u.appointmentDate ? formatDateTr(u.appointmentDate) + ' ' + (u.appointmentDay || '') : 'Salı veya Perşembe seçiniz.'}">
            👤 Asil ${u.appointmentDate ? `(${formatDateTr(u.appointmentDate)} ${u.appointmentDay || ''})` : '(Randevu Seçiniz)'}
          </button>
        `}
      </td>
      <td class="text-center">
        <input type="file" id="direct-owner-file-${index}" accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,image/*,application/pdf" style="display:none;" onchange="handleDirectOwnerFileUpload(${index}, this)">
        <div style="display:flex; flex-direction:column; gap:5px; align-items:center;">
          <button type="button" class="btn-copy-chip" style="background:#ecfdf5; color:#065f46; border-color:#a7f3d0; font-weight:700; padding:4px 8px; font-size:11.5px; width:100%;" onclick="printFormOwnerEK1(${index})" title="Bu bağımsız bölüm malikinin doldurulmuş resmi EK-1 dilekçesini tek sayfa aç ve yazdır">
            📄 EK-1 Dilekçesi
          </button>
          ${u.attachedDoc ? `
            <div class="doc-ready-wrap" style="width:100%; min-width:145px; background:#f0fdf4; border:1.5px solid #86efac; border-radius:8px; padding:7px 8px; box-shadow:0 1px 4px rgba(22,101,52,0.08);">
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:3px; gap:4px;">
                <span class="doc-badge-success" style="font-size:11px; font-weight:800; color:#15803d; word-break:break-all;">✅ ${escapeHtml(u.attachedDoc.name || `${u.oldUnitNo}.B.B.pdf`)}</span>
                <span style="font-size:10px; color:#166534; font-weight:700; white-space:nowrap;">${u.attachedDoc.size ? (u.attachedDoc.size / 1024).toFixed(0) + ' KB' : 'Hazır'}</span>
              </div>
              <div style="font-size:9.5px; color:#15803d; font-weight:600; margin-bottom:6px; text-align:left;">
                ${u.individualDocs ? '⚡ 5 Evrak Birleştirildi' : '📁 Tek Dosya Yüklendi'}
              </div>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px;">
                <button type="button" class="btn-xs-doc" style="background:#0284c7; color:#fff; padding:4px 6px; border-radius:4px; font-size:10.5px; font-weight:700;" onclick="viewOwnerAttachedDocDirectly('contractor', ${index})" title="Görüntüle">👁️ Gör</button>
                <button type="button" class="btn-xs-doc" style="background:#f59e0b; color:#fff; padding:4px 6px; border-radius:4px; font-size:10.5px; font-weight:700;" onclick="openUnitDocModal('contractor', ${index})" title="Evrakları Değiştir veya Yeniden Birleştir">✏️ Değiştir</button>
                <button type="button" class="btn-xs-doc" style="background:#15803d; color:#fff; padding:4px 6px; border-radius:4px; font-size:10.5px; font-weight:700;" onclick="downloadAttachedDoc('contractor', ${index})" title="İndir">📥 İndir</button>
                <button type="button" class="btn-xs-doc" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:4px 6px; border-radius:4px; font-size:10.5px; font-weight:700;" onclick="removeOwnerAttachedDoc('contractor', ${index})" title="Kaldır">🗑️ Kaldır</button>
              </div>
            </div>
          ` : `
            <div style="width:100%; min-width:145px; display:flex; flex-direction:column; gap:3px;">
              <button type="button" class="btn-doc-upload" onclick="openUnitDocModal('contractor', ${index})" style="width:100%; font-size:12px; padding:8px 8px; background:#eff6ff; color:#1e40af; border:1.5px solid #3b82f6; font-weight:800; border-radius:7px; cursor:pointer;" title="Daireye ait 5 resmi evrakı (Dilekçe, Eski/Yeni Tapu, Kimlik, Beyan) tek tek veya birleşik PDF olarak yükleyin">
                📁 Evrak Yükle / Birleştir
              </button>
              <div style="font-size:9.5px; color:#475569; text-align:center; line-height:1.25;">
                <span style="color:#d97706; font-weight:700;">(Dilekçe, Tapu, Beyan, Kimlik)</span><br>
                <span style="font-size:9px; color:#0284c7; font-weight:600;">⚡ 5 Evrak Otomatik Birleştir</span>
              </div>
            </div>
          `}
        </div>
      </td>
      <td class="text-center">
        <button type="button" class="btn-tbl-del" onclick="deleteOwnerRow(${index})" title="Satırı Sil">🗑️</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  if (typeof syncOwnersToSectionSchematic === "function") {
    syncOwnersToSectionSchematic(true);
  }
  if (typeof updatePreSubmitChecklist === "function") {
    updatePreSubmitChecklist();
  }
}

let _schematicSyncTimeout = null;

function debouncedSyncSchematic() {
  if (_schematicSyncTimeout) clearTimeout(_schematicSyncTimeout);
  _schematicSyncTimeout = setTimeout(() => {
    _schematicSyncTimeout = null;
    if (typeof syncOwnersToSectionSchematic === "function") {
      syncOwnersToSectionSchematic(true);
    }
  }, 400);
}

function updateFormOwner(index, field, value) {
  if (!formOwners[index]) return;
  formOwners[index][field] = value;
  saveDataToStorage(false); // Yazarken tarayıcıyı kasmayan debounce'lu kayıt

  if (field === "shareNum" || field === "shareDenom" || field === "oldUnitNo") {
    updateLiveShareBadges();
  }

  if (field === "floor" || field === "oldUnitNo" || field === "type" || field === "firstName" || field === "lastName") {
    debouncedSyncSchematic();
  }
}

// =========================================================================
// VEKALET MODALI İŞLEMLERİ (VEKİL TCKN & VK AD SOYAD)
// =========================================================================
let activeProxyEditIndex = null;

function openProxyModal(index) {
  activeProxyEditIndex = index;
  const owner = formOwners[index];
  if (!owner) return;

  const modalTitle = document.getElementById("proxy-modal-title");
  if (modalTitle) {
    modalTitle.innerHTML = `📜 ${escapeHtml(owner.oldUnitNo)} nolu B.B. (${escapeHtml(owner.firstName)} ${escapeHtml(owner.lastName)}) - Vekalet`;
  }

  const radioNo = document.querySelector('input[name="proxy-choice"][value="no"]');
  const radioYes = document.querySelector('input[name="proxy-choice"][value="yes"]');
  const inputTc = document.getElementById("proxy-tc");
  const inputName = document.getElementById("proxy-name");

  if (owner.hasProxy) {
    if (radioYes) radioYes.checked = true;
    if (inputTc) inputTc.value = owner.proxyTc || "";
    if (inputName) inputName.value = owner.proxyName || "";
    toggleProxyInputs(true);
  } else {
    if (radioNo) radioNo.checked = true;
    if (inputTc) inputTc.value = "";
    if (inputName) inputName.value = "";
    toggleProxyInputs(false);
  }

  // Randevu Tarihini Yükle ve Bugünden Önceki Tarihleri Engelle (min=today)
  const inputAppDate = document.getElementById("proxy-appointment-date");
  const badgeAppDate = document.getElementById("proxy-appointment-badge");
  const msgAppDate = document.getElementById("proxy-appointment-msg");
  if (inputAppDate) {
    const todayStr = new Date().toISOString().split("T")[0];
    inputAppDate.min = todayStr; // HTML5 geçmiş tarih seçimini engeller
    inputAppDate.value = owner.appointmentDate || "";
    if (owner.appointmentDate) {
      validateAppointmentDate(inputAppDate);
    } else {
      if (badgeAppDate) badgeAppDate.style.display = "none";
      if (msgAppDate) {
        msgAppDate.innerText = "(Vekaletsiz maliklerin randevu tarihi Salı veya Perşembe gününe denk gelmelidir.)";
        msgAppDate.style.color = "#b45309";
      }
    }
  }

  const modal = document.getElementById("proxy-modal");
  if (modal) modal.style.display = "flex";
}

function closeProxyModal() {
  const modal = document.getElementById("proxy-modal");
  if (modal) modal.style.display = "none";
  activeProxyEditIndex = null;
}

function toggleProxyInputs(show) {
  const fields = document.getElementById("proxy-input-fields");
  if (fields) fields.style.display = show ? "block" : "none";
  const appBox = document.getElementById("proxy-appointment-box");
  if (appBox) appBox.style.display = show ? "none" : "block";
}

function validateAppointmentDate(input) {
  const badge = document.getElementById("proxy-appointment-badge");
  const msg = document.getElementById("proxy-appointment-msg");
  if (!input || !input.value) {
    if (badge) badge.style.display = "none";
    if (msg) {
      msg.innerText = "(Vekaletsiz maliklerin randevu tarihi Salı veya Perşembe gününe denk gelmelidir.)";
      msg.style.color = "#b45309";
    }
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(input.value + "T00:00:00");

  // Kural 1: Geçmiş tarihe randevu verilemez
  if (d < today) {
    if (badge) {
      badge.style.display = "inline-block";
      badge.style.background = "#fee2e2";
      badge.style.color = "#b91c1c";
      badge.innerText = "❌ Geçmiş Tarih";
    }
    if (msg) {
      msg.innerText = "⚠️ Geçmiş tarihe randevu alınamaz! Lütfen bugünden sonraki bir Salı veya Perşembe gününü seçiniz.";
      msg.style.color = "#b91c1c";
    }
    showToast("⚠️ Geçmiş bir tarihe randevu seçilemez! Gelecek bir Salı veya Perşembe seçiniz.", "warning");
    input.value = "";
    return false;
  }

  // Kural 2: Yalnızca Salı (2) veya Perşembe (4)
  const day = d.getDay(); // 0: Paz, 1: Pzt, 2: Sal, 3: Çar, 4: Per, 5: Cum, 6: Cts
  if (day !== 2 && day !== 4) {
    if (badge) {
      badge.style.display = "inline-block";
      badge.style.background = "#fee2e2";
      badge.style.color = "#b91c1c";
      badge.innerText = "❌ Geçersiz Gün";
    }
    if (msg) {
      msg.innerText = "⚠️ Randevular yalnızca SALI veya PERŞEMBE günleri için alınabilir! Lütfen Salı ya da Perşembe gününü seçiniz.";
      msg.style.color = "#b91c1c";
    }
    showToast("⚠️ Randevu günü sadece SALI veya PERŞEMBE olabilir!", "warning");
    input.value = "";
    return false;
  }

  const dayName = day === 2 ? "Salı" : "Perşembe";
  if (badge) {
    badge.style.display = "inline-block";
    badge.style.background = "#dcfce7";
    badge.style.color = "#15803d";
    badge.innerText = `✓ ${dayName}`;
  }
  if (msg) {
    msg.innerText = `✅ Randevu onaylandı: ${formatDateTr(input.value)} ${dayName} günü belediye imza masasında olunmalıdır.`;
    msg.style.color = "#15803d";
  }
  return true;
}

function saveProxyModalData() {
  if (activeProxyEditIndex === null || !formOwners[activeProxyEditIndex]) {
    closeProxyModal();
    return;
  }

  const choice = document.querySelector('input[name="proxy-choice"]:checked')?.value || "no";
  const inputTc = document.getElementById("proxy-tc");
  const inputName = document.getElementById("proxy-name");
  const owner = formOwners[activeProxyEditIndex];

  if (choice === "yes") {
    const tc = inputTc ? inputTc.value.trim().replace(/\D/g, "") : "";
    const name = inputName ? inputName.value.trim() : "";

    if (!tc || tc.length !== 11) {
      showToast("Lütfen 11 haneli geçerli Vekil T.C. kimlik numarasını giriniz.", "warning");
      return;
    }
    if (!name) {
      showToast("Lütfen vekilin Adını ve Soyadını giriniz.", "warning");
      return;
    }

    owner.hasProxy = true;
    owner.proxyTc = tc;
    owner.proxyName = name;
    delete owner.appointmentDate;
    delete owner.appointmentDay;
    showToast(`✅ ${owner.oldUnitNo} nolu B.B. vekaleten işaretlendi (Vekil: ${name})`, "success");
  } else {
    const inputAppDate = document.getElementById("proxy-appointment-date");
    const dateVal = inputAppDate ? inputAppDate.value : "";
    if (!dateVal) {
      showToast("⚠️ Noter vekaleti olmayan malikler için Salı veya Perşembe gününe randevu tarihi seçilmesi zorunludur!", "danger");
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateVal + "T00:00:00");
    if (d < today) {
      showToast("⚠️ Geçmiş bir tarihe randevu verilemez! Bugünden sonraki bir Salı veya Perşembe seçiniz.", "danger");
      return;
    }
    const day = d.getDay();
    if (day !== 2 && day !== 4) {
      showToast("⚠️ Randevu günü yalnızca SALI veya PERŞEMBE günleri olabilir!", "danger");
      return;
    }

    owner.hasProxy = false;
    delete owner.proxyTc;
    delete owner.proxyName;
    owner.appointmentDate = dateVal;
    owner.appointmentDay = (day === 2 ? "Salı" : "Perşembe");
    showToast(`ℹ️ ${owner.oldUnitNo} nolu B.B. asil işaretlendi (Randevu: ${formatDateTr(dateVal)} ${owner.appointmentDay})`, "info");
  }

  saveDataToStorage();
  renderContractorOwnersTable();
  closeProxyModal();
}

// =========================================================================
// YARISI BİZDEN RESMİ KILAVUZ & NOTER METNİ MODALI İŞLEMLERİ
// =========================================================================
function openRequiredDocumentsGuideModal(tabIndex = 0) {
  const modal = document.getElementById("guide-modal");
  if (modal) {
    modal.style.display = "flex";
    switchGuideTab(tabIndex);
  }
}

function closeRequiredDocumentsGuideModal() {
  const modal = document.getElementById("guide-modal");
  if (modal) modal.style.display = "none";
}

function switchGuideTab(index) {
  for (let i = 0; i <= 4; i++) {
    const btn = document.getElementById(`gtab-btn-${i}`);
    const content = document.getElementById(`guide-tab-content-${i}`);
    if (btn) btn.classList.toggle("active", i === index);
    if (content) content.style.display = i === index ? "block" : "none";
  }
}

function copyOfficialNotaryText(btn) {
  const el = document.getElementById("official-notary-text");
  if (!el) return;
  const text = el.innerText.trim();

  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerText;
    btn.innerText = "✓ Noter Metni Kopyalandı!";
    btn.style.background = "#059669";
    showToast("Resmi noter vekaletname metni panoya kopyalandı!", "success");
    setTimeout(() => {
      btn.innerText = orig;
      btn.style.background = "#0f3460";
    }, 2200);
  });
}

function getNextValidAppointmentDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== 2 && d.getDay() !== 4) {
    d.setDate(d.getDate() + 1);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return {
    dateStr: `${yyyy}-${mm}-${dd}`,
    dayName: d.getDay() === 2 ? "Salı" : "Perşembe"
  };
}

// --- MÜTEAHHİT BAŞVURU ÖN KONTROL LİSTESİ (KULLANICI TALEBİYLE KALDIRILDI) ---
function updatePreSubmitChecklist() {
  // Kaldırıldı
}

// --- MÜTEAHHİT FORMU GÖNDERME İŞLEMİ ---
function handleContractorSubmit(e) {
  if (e && typeof e.preventDefault === "function") e.preventDefault();

  try {
    // Mevcut havuzdaki diğer dosyaları kaybetmemek için güncel listeyi localStorage'dan çek
    const rawCurrentApps = localStorage.getItem("yb_applications_list");
    if (rawCurrentApps) {
      try {
        applicationsList = JSON.parse(rawCurrentApps);
      } catch (ex) { }
    }

    // Revizyon modu tespiti: SADECE kullanıcı aktif olarak bir dosyayı düzenleme modundaysa revizyon/düzenleme işlemi yapılır
    let editingAppId = activeContractorEditingAppId || localStorage.getItem("yb_active_editing_app_id");
    // Not: editingAppId yoksa, bu KESİNLİKLE SIFIRDAN YENİ BİR BAŞVURUDUR! Asla eski dosyayı ezme!

    const companyName = document.getElementById("c-company-name")?.value.trim() || "";
    const taxNo = document.getElementById("c-tax-no")?.value.trim() || "";
    const iban = document.getElementById("c-iban")?.value.trim() || "";
    const repName = document.getElementById("c-rep-name")?.value.trim() || "";
    const repTc = document.getElementById("c-rep-tc")?.value.trim() || "";
    const repBirth = document.getElementById("c-rep-birth")?.value || "";
    const repEmail = document.getElementById("c-rep-email")?.value.trim() || "";
    const repPhone = document.getElementById("c-rep-phone")?.value.trim() || "";
    const companyAddress = document.getElementById("c-company-address")?.value.trim() || "";

    const ykn = document.getElementById("b-ykn")?.value.trim() || "";
    const neighborhood = document.getElementById("b-neighborhood")?.value || "Akıncılar";
    const permitDate = document.getElementById("b-permit-date")?.value || "";
    const oldAdaParsel = document.getElementById("b-old-ada-parsel")?.value.trim() || "";
    const newAdaParsel = document.getElementById("b-new-ada-parsel")?.value.trim() || "";
    const address = document.getElementById("b-address")?.value.trim() || "";

    const oldM2 = parseFloat(document.getElementById("m2-old-building")?.value) || 0;
    const newM2 = parseFloat(document.getElementById("m2-new-building")?.value) || 0;
    const shelterM2 = parseFloat(document.getElementById("m2-shelter")?.value) || 0;
    const parkingM2 = parseFloat(document.getElementById("m2-parking")?.value) || 0;

    if (!formOwners || formOwners.length === 0) {
      addNewOwnerRow();
    }

    // 1. Şirket yetkili telefonu kontrolü (başında 0 olmadan 10 hane)
    let cleanRepPhone = cleanPhoneInput(repPhone);
    if (cleanRepPhone.length < 10) {
      cleanRepPhone = activeContractorUser?.phone || "5354442211";
    }

    // 2. Hak sahipleri telefon ve adres formatı kontrolü & otomatik tamamlama
    for (let i = 0; i < formOwners.length; i++) {
      const o = formOwners[i];
      o.phone = cleanPhoneInput(o.phone);
      if (!o.phone || o.phone.length < 10) {
        o.phone = "535" + Math.floor(1000000 + Math.random() * 9000000);
      }
      if (!o.ownerAddress || o.ownerAddress.trim().length < 5) {
        o.ownerAddress = `${neighborhood} Mah. Posta Cad. No:${o.oldUnitNo || (i + 1)} Güngören / İSTANBUL`;
      }
      if (!o.firstName) o.firstName = "Hak Sahibi";
      if (!o.lastName) o.lastName = String(i + 1);
      if (!o.oldUnitNo) o.oldUnitNo = String(i + 1);
    }

    // 3. Salı ve Perşembe Randevu Kontrolü (Vekaletsiz malikler için)
    for (let i = 0; i < formOwners.length; i++) {
      const o = formOwners[i];
      if (!o.hasProxy) {
        let needAuto = false;
        if (!o.appointmentDate) needAuto = true;
        else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const d = new Date(o.appointmentDate + "T00:00:00");
          if (d < today || (d.getDay() !== 2 && d.getDay() !== 4)) needAuto = true;
        }
        if (needAuto) {
          const nextDate = getNextValidAppointmentDate();
          o.appointmentDate = nextDate.dateStr;
          o.appointmentDay = nextDate.dayName;
        }
      }
    }

    // 4. 1.5 Kat Kuralı Kontrolü (Aşım varsa uyar ama düzenleme sürecini kilitleme)
    const netM2Val = newM2 - (shelterM2 + parkingM2);
    const maxAllowedM2Val = oldM2 * 1.5;
    if (oldM2 > 0 && netM2Val > maxAllowedM2Val && !editingAppId) {
      const diff = (netM2Val - maxAllowedM2Val).toFixed(1);
      const ratio = (netM2Val / oldM2).toFixed(2);
      showToast(`🚨 BAŞVURU UYARISI: Projeniz 1.5 Kat Net Alan Kuralını ${diff} m² aşıyor (${ratio} kat).`, "warning");
    }

    // Ada / Parsel Ayrıştırma & Formatlama
    const parsedOldAda = parseAdaParsel(oldAdaParsel || "1452 / 8");
    const parsedNewAda = parseAdaParsel(newAdaParsel || "1452 / 8");

    // DURUM 1: Müteahhit mevcut dosyayı düzenleyip / revize edip tekrar gönderiyor
    if (editingAppId) {
      const existingIndex = applicationsList.findIndex(a => a.id === editingAppId);
      if (existingIndex !== -1) {
        const existingApp = applicationsList[existingIndex];
        existingApp.company = {
          name: companyName || existingApp.company?.name || activeContractorUser?.companyName || "Güngören Prestij Yapı",
          taxNo: cleanTaxNoInput(taxNo) || existingApp.company?.taxNo || activeContractorUser?.taxNo || "3482910482",
          iban: formatIbanInput(iban) || existingApp.company?.iban || "TR54 0020 9000 0012 3456 7890 12",
          repName: repName || existingApp.company?.repName || activeContractorUser?.repName || "Yetkili",
          repTc: cleanTcInput(repTc) || existingApp.company?.repTc || "10293847562",
          repBirth: repBirth || existingApp.company?.repBirth || "1980-01-01",
          repEmail: repEmail || existingApp.company?.repEmail || activeContractorUser?.email || "ornek@insaat.com",
          repPhone: cleanRepPhone || existingApp.company?.repPhone || activeContractorUser?.phone || "5354442211",
          address: companyAddress || existingApp.company?.address || "Güngören / İSTANBUL"
        };
        existingApp.cadastre = {
          structureType: typeof currentStructureType !== "undefined" ? currentStructureType : "single",
          isTevhid: currentStructureType === "tevhid" || currentStructureType === "both",
          isBlocks: currentStructureType === "blocks" || currentStructureType === "both",
          parcelsList: Array.isArray(projectActiveParcels) ? [...projectActiveParcels] : [],
          parcelsMap: { ...projectParcelsMap },
          blocksList: Array.isArray(projectActiveBlocks) ? [...projectActiveBlocks] : [],
          blocksMap: { ...projectBlocksMap },
          ykn: ykn || existingApp.cadastre?.ykn || "1084729",
          neighborhood: neighborhood || existingApp.cadastre?.neighborhood || "Akıncılar",
          permitDate: permitDate || existingApp.cadastre?.permitDate || "2024-04-15",
          oldAdaParsel: oldAdaParsel || existingApp.cadastre?.oldAdaParsel || "1452 / 8",
          newAdaParsel: newAdaParsel || existingApp.cadastre?.newAdaParsel || "1452 / 8",
          ada: parsedOldAda.ada || existingApp.cadastre?.ada || "1452",
          parsel: parsedOldAda.parsel || existingApp.cadastre?.parsel || "8",
          adaParselFormatted: parsedOldAda.displayText || existingApp.cadastre?.adaParselFormatted || "1452 Ada / 8 Parsel",
          address: address || existingApp.cadastre?.address || `${neighborhood} Mah. Güngören / İSTANBUL`,
          oldM2: oldM2 || existingApp.cadastre?.oldM2 || 1200,
          newM2: newM2 || existingApp.cadastre?.newM2 || 1600,
          shelterM2: shelterM2,
          parkingM2: parkingM2
        };
        existingApp.owners = JSON.parse(JSON.stringify(formOwners));
        existingApp.buildingDocs = JSON.parse(JSON.stringify(formBuildingDocs));
        existingApp.mergedUnitsDoc = formBuildingDocs?.mergedUnitsDoc ? JSON.parse(JSON.stringify(formBuildingDocs.mergedUnitsDoc)) : null;

        const wasDraft = (existingApp.isDraft || existingApp.status === "Taslak");
        if (wasDraft) {
          existingApp.isDraft = false;
          existingApp.status = "havuzda";
          existingApp.statusText = "Havuzda (Belediye İnceliyor)";
          existingApp.submissionDate = new Date().toLocaleDateString("tr-TR");
        } else {
          existingApp.status = "revize_edildi";
          existingApp.isRevised = true;
          existingApp.revisedAt = new Date().toLocaleString("tr-TR");
          existingApp.submissionDate = new Date().toLocaleDateString("tr-TR") + " (Revize Edildi)";
        }
        existingApp.lastUpdated = Date.now();
        if (!existingApp.messages) existingApp.messages = [];
        const nowStr = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) + " - " + new Date().toLocaleDateString("tr-TR");
        existingApp.messages.push({
          sender: activeContractorUser ? `${activeContractorUser.companyName} (${activeContractorUser.repName})` : "Müteahhit",
          senderRole: "contractor",
          text: wasDraft
            ? "✅ Müteahhit tarafından hazırlanan başvuru dosyası Güngören Belediyesi Kentsel Dönüşüm Müdürlüğü'ne ilk resmi başvuru olarak gönderildi."
            : "✅ Müteahhit tarafından talep edilen revizyon düzenlemeleri ve evraklar tamamlanarak dosya yeniden belediye incelemesine gönderildi.",
          time: nowStr
        });

        activeContractorEditingAppId = null;
        localStorage.removeItem("yb_active_editing_app_id");
        safeSetLocalStorage("yb_last_submitted_app", sanitizeForStorage(existingApp));
        safeSetLocalStorage("yb_applications_list", sanitizeForStorage(applicationsList));
        saveDataToStorage();

        // Revizyon uyarı kutusunu anında temizle ve gizle
        checkContractorRevisions();

        const banner = document.getElementById("contractor-active-editing-banner");
        if (banner) banner.style.display = "none";

        if (typeof updateHeaderCounts === "function") updateHeaderCounts();
        if (typeof renderApplicationsPool === "function") renderApplicationsPool();
        if (typeof renderRegisteredContractorsList === "function") renderRegisteredContractorsList();

        const successMsg = wasDraft
          ? `🎉 "${existingApp.appNo}" nolu başvurunuz başarıyla Güngören Belediyesi Kentsel Dönüşüm Masasına iletildi!`
          : `🎉 "${existingApp.appNo}" nolu dosyanız revize edilmiş haliyle Güngören Belediyesi Kentsel Dönüşüm Masasına başarıyla iletildi!`;
        showToast(successMsg, "success");

        lockContractorForm(existingApp);
        updateContractorBadges();
        if (typeof renderContractorDrafts === "function") renderContractorDrafts();
        renderContractorMyApps();
        switchContractorPortalTab("my-apps");

        try {
          window.dispatchEvent(new Event("storage"));
        } catch (e) { }

        return;
      }
    }

    // DURUM 2: Yeni Başvuru Gönderimi
    const newAppNo = "GB-" + new Date().getFullYear() + "-" + Math.floor(1000 + Math.random() * 9000);
    const newApplication = {
      id: "app_" + Date.now(),
      appNo: newAppNo,
      submissionDate: new Date().toLocaleDateString("tr-TR"),
      status: "havuzda",
      isSubmitted: true,
      lastUpdated: Date.now(),
      claimedBy: null,
      submittedByEmail: activeContractorUser?.email || repEmail || "ornek@insaat.com",
      company: {
        name: companyName || (activeContractorUser ? activeContractorUser.companyName : "Güngören Prestij Yapı"),
        taxNo: cleanTaxNoInput(taxNo) || (activeContractorUser ? activeContractorUser.taxNo : "3482910482"),
        iban: formatIbanInput(iban) || "TR54 0020 9000 0012 3456 7890 12",
        repName: repName || (activeContractorUser ? activeContractorUser.repName : "Yetkili"),
        repTc: cleanTcInput(repTc) || "10293847562",
        repBirth: repBirth || "1980-01-01",
        repEmail: repEmail || (activeContractorUser ? activeContractorUser.email : "ornek@insaat.com"),
        repPhone: cleanRepPhone || (activeContractorUser ? activeContractorUser.phone : "5354442211"),
        address: companyAddress || "Güngören / İSTANBUL"
      },
      cadastre: {
        structureType: typeof currentStructureType !== "undefined" ? currentStructureType : "single",
        isTevhid: currentStructureType === "tevhid" || currentStructureType === "both",
        isBlocks: currentStructureType === "blocks" || currentStructureType === "both",
        parcelsList: Array.isArray(projectActiveParcels) ? [...projectActiveParcels] : [],
        parcelsMap: { ...projectParcelsMap },
        blocksList: Array.isArray(projectActiveBlocks) ? [...projectActiveBlocks] : [],
        blocksMap: { ...projectBlocksMap },
        ykn: ykn || "1084729",
        neighborhood: neighborhood || "Akıncılar",
        permitDate: permitDate || new Date().toISOString().split("T")[0],
        oldAdaParsel: oldAdaParsel || "1452 / 8",
        newAdaParsel: newAdaParsel || "1452 / 8",
        ada: parsedOldAda.ada || "1452",
        parsel: parsedOldAda.parsel || "8",
        adaParselFormatted: parsedOldAda.displayText || "1452 Ada / 8 Parsel",
        address: address || `${neighborhood} Mah. Güngören / İSTANBUL`,
        oldM2: oldM2 || 1200,
        newM2: newM2 || 1600,
        shelterM2: shelterM2 || 0,
        parkingM2: parkingM2 || 0
      },
      messages: [
        {
          sender: activeContractorUser ? `${activeContractorUser.companyName} (${activeContractorUser.repName})` : "Müteahhit",
          senderRole: "contractor",
          text: "Yeni proje başvuru dosyası ve resmi evraklar belediye kentsel dönüşüm havuzuna teslim edildi.",
          time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) + " - " + new Date().toLocaleDateString("tr-TR")
        }
      ],
      owners: JSON.parse(JSON.stringify(formOwners)),
      buildingDocs: JSON.parse(JSON.stringify(formBuildingDocs)),
      mergedUnitsDoc: formBuildingDocs?.mergedUnitsDoc ? JSON.parse(JSON.stringify(formBuildingDocs.mergedUnitsDoc)) : null
    };

    applicationsList.unshift(newApplication);

    // Gönderilen taslağı ve önbelleği temizle
    if (activeContractorUser) {
      localStorage.removeItem("yb_draft_" + activeContractorUser.email);
    }
    localStorage.removeItem("yb_form_owners");
    localStorage.removeItem("yb_active_editing_app_id");
    activeContractorEditingAppId = null;

    // Yetkili masasında daima garanti bulunması için son gönderilen başvuru anahtarını da güvenle kaydet
    safeSetLocalStorage("yb_last_submitted_app", sanitizeForStorage(newApplication));
    safeSetLocalStorage("yb_applications_list", sanitizeForStorage(applicationsList));

    saveDataToStorage();
    if (typeof updateHeaderCounts === "function") updateHeaderCounts();
    if (typeof renderApplicationsPool === "function") renderApplicationsPool();
    if (typeof renderRegisteredContractorsList === "function") renderRegisteredContractorsList();

    showToast(`🎉 Tebrikler! "${newApplication.appNo}" takip numaralı dosyanız Güngören Belediyesi Kentsel Dönüşüm Masasına başarıyla iletildi.`, "success");

    // Formu kilitle ve Dosyalarım sekmesine geçiş yap
    lockContractorForm(newApplication);
    renderContractorMyApps();
    switchContractorPortalTab("my-apps");

    try {
      window.dispatchEvent(new Event("storage"));
    } catch (ex) { }
  } catch (err) {
    console.error("handleContractorSubmit hatası:", err);
    showToast("⚠️ Başvuru iletilirken bir hata oluştu: " + err.message, "danger");
  }
}

function updateHeaderCounts() {
  const badge = document.getElementById("header-pending-count");
  if (badge) {
    const count = applicationsList.filter(a => a.status !== "onaylandi").length;
    badge.innerText = count;
  }
}

// --- HAZIR ÖRNEK MÜTEAHHİT FORMU DOLDUR (TEST İÇİN) ---
function fillContractorDemoForm() {
  document.getElementById("c-company-name").value = "Güngören Prestij Yapı ve İnşaat Ltd. Şti.";
  document.getElementById("c-tax-no").value = "3482910482";
  document.getElementById("c-iban").value = "TR54 0020 9000 0012 3456 7890 12";
  document.getElementById("c-rep-name").value = "Mustafa Güven";
  document.getElementById("c-rep-tc").value = "10293847562";
  document.getElementById("c-rep-birth").value = "1975-06-14";
  document.getElementById("c-rep-email").value = "mustafa.guven@prestijyapi.com.tr";
  document.getElementById("c-rep-phone").value = "5354442211";
  document.getElementById("c-company-address").value = "Akıncılar Mah. Posta Cad. No: 18 Güngören / İSTANBUL";

  document.getElementById("b-ykn").value = "1084729";
  document.getElementById("b-neighborhood").value = "Haznedar Mah.";
  document.getElementById("b-permit-date").value = "2024-04-15";
  document.getElementById("b-old-ada-parsel").value = "1452 / 8";
  document.getElementById("b-new-ada-parsel").value = "1452 / 8";
  document.getElementById("b-address").value = "Bağcılar Caddesi No: 42, Haznedar";
  document.getElementById("m2-old-building").value = "1200";
  document.getElementById("m2-new-building").value = "1950";
  document.getElementById("m2-shelter").value = "80";
  document.getElementById("m2-parking").value = "150";

  // Başında 0 olmadan 10 hane ve farklı daireler için farklı adres/telefonlar!
  // (4 nolu daire hisseli olduğu için aynı adresi paylaşabilir)
  formOwners = [
    { id: "fo_1", oldUnitNo: "1", floor: "Bodrum", type: "Ticari (Dükkan)", tc: "29481029384", phone: "5321112233", firstName: "Ahmet", lastName: "Yılmaz", birthDate: "14.05.1970", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Dükkan:1", shareNum: 1, shareDenom: 1 },
    { id: "fo_2", oldUnitNo: "2", floor: "Bodrum", type: "Ticari (Dükkan)", tc: "38592019485", phone: "5332223344", firstName: "Mehmet", lastName: "Kaya", birthDate: "20.10.1974", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Dükkan:2", shareNum: 1, shareDenom: 1 },
    { id: "fo_3", oldUnitNo: "3", floor: "Zemin", type: "Konut (Daire)", tc: "47693028596", phone: "5353334455", firstName: "Ayşe", lastName: "Demir", birthDate: "05.03.1978", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Daire:3", shareNum: 1, shareDenom: 1 },
    // 4 nolu hisseli daire (Hissedarlar aynı dairede oturabilir, aynı telefonu/adresi paylaşabilir)
    { id: "fo_4_1", oldUnitNo: "4", floor: "Zemin", type: "Konut (Daire)", tc: "58704139607", phone: "5424445566", firstName: "Fatma", lastName: "Şahin", birthDate: "12.08.1965", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Daire:4", shareNum: 3, shareDenom: 12 },
    { id: "fo_4_2", oldUnitNo: "4", floor: "Zemin", type: "Konut (Daire)", tc: "69815240718", phone: "5435556677", firstName: "Hasan", lastName: "Şahin", birthDate: "19.01.1988", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Daire:4", shareNum: 1, shareDenom: 12 },
    { id: "fo_4_3", oldUnitNo: "4", floor: "Zemin", type: "Konut (Daire)", tc: "70926351829", phone: "5446667788", firstName: "Hüseyin", lastName: "Şahin", birthDate: "25.06.1990", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Daire:4", shareNum: 1, shareDenom: 12 },
    { id: "fo_4_4", oldUnitNo: "4", floor: "Zemin", type: "Konut (Daire)", tc: "81037462930", phone: "5457778899", firstName: "Zeynep", lastName: "Şahin", birthDate: "03.11.1993", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Daire:4", shareNum: 1, shareDenom: 12 },
    { id: "fo_4_5", oldUnitNo: "4", floor: "Zemin", type: "Konut (Daire)", tc: "92148573041", phone: "5468889900", firstName: "Emine", lastName: "Şahin", birthDate: "17.04.1968", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Daire:4", shareNum: 3, shareDenom: 12 },
    { id: "fo_4_6", oldUnitNo: "4", floor: "Zemin", type: "Konut (Daire)", tc: "13259684152", phone: "5479990011", firstName: "Ali", lastName: "Şahin", birthDate: "28.09.1972", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Daire:4", shareNum: 3, shareDenom: 12 },
    // 5 nolu daire
    { id: "fo_5", oldUnitNo: "5", floor: "1.Kat", type: "Konut (Daire)", tc: "24360795263", phone: "5051234567", firstName: "Mustafa", lastName: "Koç", birthDate: "11.12.1960", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Daire:5", shareNum: 1, shareDenom: 1 }
  ];

  renderContractorOwnersTable();
  saveDataToStorage();
  showToast("Resmi örnek başvuru formu otomatik dolduruldu!", "success");
}

// =========================================================================
// BELEDİYE PERSONEL HAVUZU FONKSİYONLARI (SİZ + 3 ARKADAŞINIZ)
// =========================================================================

function renderApplicationsPool() {
  const container = document.getElementById("pool-list-container");
  if (!container) return;

  container.innerHTML = "";

  if (applicationsList.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding:40px; color:#64748b;">
        <span style="font-size:36px; display:block; margin-bottom:8px;">📭</span>
        <strong>Henüz gelen bir başvuru bulunmuyor.</strong><br>
        Müteahhit başvuru formundan dosya gönderildiğinde dördünüzün de ekranına anında düşecektir.
      </div>
    `;
    return;
  }

  applicationsList.forEach(app => {
    const card = document.createElement("div");
    card.className = "app-card";

    // Durum ve Sahip Belirleme
    let statusClass = "status-pool";
    let statusText = "🟡 Havuzda Bekliyor";
    let isClaimedByMe = false;

    if (app.claimedBy) {
      if (app.claimedBy.id === currentStaff.id) {
        statusClass = "status-claimed";
        statusText = `🟢 ${app.claimedBy.name} (Siz İnceliyorsunuz)`;
        card.classList.add("claimed-by-me");
        isClaimedByMe = true;
      } else {
        statusClass = "status-other";
        statusText = `👤 ${app.claimedBy.name} İnceliyor`;
        card.classList.add("claimed-by-other");
      }
    }

    if (app.status === "onaylandi") {
      statusText = "✔ Onaylandı & ARAAD'a Gönderildi";
      statusClass = "status-claimed";
    } else if (app.status === "revizyon") {
      statusText = "⚠️ Revizyon / Eksik İstendi";
      statusClass = "status-other";
    }

    const totalUnits = new Set(app.owners.map(o => o.oldUnitNo)).size;

    card.innerHTML = `
      <div class="app-header">
        <div>
          <div class="app-title">${escapeHtml(app.cadastre.neighborhood)} - Ada/Parsel: ${escapeHtml(app.cadastre.oldAdaParsel)}</div>
          <div class="app-sub">${escapeHtml(app.company.name)}</div>
        </div>
        <span class="app-badge-status ${statusClass}">${statusText}</span>
      </div>

      <div class="app-meta-row">
        <span><strong>Başvuru No:</strong> ${app.appNo}</span>
        <span><strong>Tarih:</strong> ${app.submissionDate}</span>
      </div>

      <div class="app-meta-row">
        <span><strong>Bağımsız Bölüm:</strong> ${totalUnits} Daire (${app.owners.length} Malik)</span>
        <span><strong>Gönderen E-Posta:</strong> <span class="font-mono" style="color:#0369a1;">${escapeHtml(app.submittedByEmail || app.company.repEmail)}</span></span>
      </div>

      <div class="app-actions">
        ${!app.claimedBy ? `
          <button class="btn-claim" onclick="claimApplication('${app.id}')">
            📥 Dosyayı Üzerime Al
          </button>
        ` : (isClaimedByMe ? `
          <button class="btn-claim" style="background:#059669;" onclick="openApplicationDetail('${app.id}')">
            🔍 Dosyayı İncele (Masa Açık)
          </button>
        ` : `
          <span style="font-size:11.5px; color:#92400e; font-weight:700;">Bu dosya başka personelde</span>
        `)}
        <button class="btn-view-detail" onclick="openApplicationDetail('${app.id}')">
          👁️ Önizle
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

// --- DOSYAYI ÜZERİME AL (ZİMMETLE) ---
function claimApplication(appId) {
  const app = applicationsList.find(a => a.id === appId);
  if (!app) return;

  app.claimedBy = {
    id: currentStaff.id,
    name: currentStaff.name
  };
  app.status = "inceleniyor";

  saveDataToStorage();
  updateHeaderCounts();
  renderApplicationsPool();

  showToast(`"${app.appNo}" nolu dosya üzerinize alındı. İnceleme masası açılıyor...`, "success");
  openApplicationDetail(appId);
}

// --- DOSYA DETAY VE İNCELEME MASASINI AÇ ---
function openApplicationDetail(appId) {
  selectedAppId = appId;
  const app = applicationsList.find(a => a.id === appId);
  if (!app) return;

  const detailSec = document.getElementById("selected-application-detail");
  detailSec.style.display = "block";
  detailSec.scrollIntoView({ behavior: "smooth" });

  document.getElementById("detail-building-title").innerText = `${app.cadastre.neighborhood} Ada/Parsel: ${app.cadastre.oldAdaParsel} (Dosya No: ${app.appNo})`;
  document.getElementById("detail-company-sub").innerHTML = `Müteahhit: <strong>${escapeHtml(app.company.name)}</strong> &bull; Başvuran E-Posta: <strong class="font-mono" style="color:#0369a1;">${escapeHtml(app.submittedByEmail || app.company.repEmail)}</strong> &bull; Adres: ${escapeHtml(app.cadastre.address)}`;

  const statusPill = document.getElementById("detail-status-pill");
  if (statusPill) {
    if (app.status === "onaylandi") {
      statusPill.innerText = "✔ Onaylandı & Gönderildi";
      statusPill.style.background = "#dcfce7";
      statusPill.style.color = "#15803d";
    } else if (app.status === "revizyon") {
      statusPill.innerText = "⚠️ Revizyon Talebi Var";
      statusPill.style.background = "#fee2e2";
      statusPill.style.color = "#b91c1c";
    } else {
      statusPill.innerText = app.claimedBy ? "İnceleniyor" : "Havuzda Bekliyor";
      statusPill.style.background = "#dbeafe";
      statusPill.style.color = "#1e40af";
    }
  }

  // Özet Kutuları
  document.getElementById("det-iban").innerText = app.company.iban || "-";
  document.getElementById("det-rep").innerText = `${app.company.repName} (TC: ${app.company.repTc}) - Tel: ${app.company.repPhone}`;
  document.getElementById("det-rep-extra").innerText = `Doğum T: ${app.company.repBirth || '-'} | E-posta: ${app.company.repEmail || '-'}`;

  // 1.5 Kat Kuralı
  const oldM2 = app.cadastre.oldM2 || 0;
  const newM2 = app.cadastre.newM2 || 0;
  const netM2 = newM2 - ((app.cadastre.shelterM2 || 0) + (app.cadastre.parkingM2 || 0));
  const ratio = oldM2 > 0 ? (netM2 / oldM2).toFixed(2) : 0;
  const maxAllowed = oldM2 * 1.5;

  const det15 = document.getElementById("det-15-status");
  if (oldM2 > 0 && netM2 <= maxAllowed) {
    det15.innerHTML = `<span style="color:#059669;">✅ 1.5 Kat Uyumlu (${ratio}x / ${netM2} m²)</span>`;
  } else if (oldM2 > 0) {
    det15.innerHTML = `<span style="color:#dc2626;">🚨 1.5 Katı Aşıyor! (${ratio}x - Max: ${maxAllowed} m²)</span>`;
  } else {
    det15.innerText = "Hesaplanamadı";
  }

  // Hak Sahipleri Tablosu Render
  const tbody = document.getElementById("detail-owners-table-body");
  tbody.innerHTML = "";

  app.owners.forEach((u, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight:700; text-align:center;">${escapeHtml(u.oldUnitNo)}</td>
      <td>${escapeHtml(u.floor)} / ${escapeHtml(u.type)}</td>
      <td class="font-mono">${escapeHtml(u.tc)}</td>
      <td class="font-mono">${escapeHtml(u.birthDate)}</td>
      <td><strong>${escapeHtml(u.firstName)} ${escapeHtml(u.lastName)}</strong></td>
      <td>${escapeHtml(u.phone)}</td>
      <td style="font-weight:700; color:#1e40af;">${u.shareNum} / ${u.shareDenom}</td>
      <td class="text-center">
        <button class="btn-copy-chip" onclick="copyAraadQuick('${escapeHtml(u.tc)}', '${escapeHtml(u.birthDate)}', '${escapeHtml(u.firstName)} ${escapeHtml(u.lastName)}', this)">
          📋 T.C.
        </button>
      </td>
      <td class="text-center">
        <button class="btn-copy-chip" style="background:#ecfdf5; color:#065f46; border-color:#a7f3d0;" onclick="printSingleAppEK1('${app.id}', ${idx})">
          📄 EK-1
        </button>
      </td>
      <td class="text-center">
        ${u.attachedDoc ? `
          <div class="doc-ready-wrap">
            <span class="doc-badge-success">✅ ${escapeHtml(u.oldUnitNo)}.B.B.pdf</span>
            <div class="doc-btn-group">
              <button class="btn-xs-doc" onclick="downloadAttachedDoc('staff', '${app.id}', ${idx})">📥 İndir</button>
              <button class="btn-xs-doc" onclick="openUnitDocModal('staff', '${app.id}', ${idx})">🔄 Düzenle</button>
            </div>
          </div>
        ` : `
          <button class="btn-copy-chip" style="background:#eff6ff; color:#1e40af; border-color:#bfdbfe; font-weight:700;" onclick="openUnitDocModal('staff', '${app.id}', ${idx})" title="Müteahhidin evrak durumunu incele">
            👁️ Evrakları İncele
          </button>
        `}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function closeDetailView() {
  document.getElementById("selected-application-detail").style.display = "none";
}

function markApplicationStatus(newStatus) {
  if (!selectedAppId) return;
  const app = applicationsList.find(a => a.id === selectedAppId);
  if (!app) return;

  if (newStatus === "revizyon") {
    openRevisionChatModal();
    return;
  }

  app.status = newStatus;
  saveDataToStorage();
  updateHeaderCounts();
  renderApplicationsPool();
  openApplicationDetail(selectedAppId);

  if (newStatus === "onaylandi") {
    showToast(`"${app.appNo}" başarıyla onaylandı ve ARAAD'a gönderildi olarak işaretlendi!`, "success");
  }
}

// =========================================================================
// RESMİ EXCEL İNDİRME (.CSV / .XLS) - TARİHE DÖNÜŞME HATASI DÜZELTİLDİ!
// =========================================================================
// =========================================================================
// RESMİ EXCEL İNDİRME (.CSV / .XLS) - TARİHE DÖNÜŞME HATASI DÜZELTİLDİ!
// =========================================================================
function exportOfficialExcel() {
  let app = null;
  if (selectedAppId) {
    app = applicationsList.find(a => a.id === selectedAppId);
  } else {
    const cad = extractCadastreValues(null);
    app = {
      appNo: "TASLAK",
      company: {
        name: document.getElementById("c-company-name")?.value || "",
        taxNo: document.getElementById("c-tax-no")?.value || "",
        iban: document.getElementById("c-iban")?.value || "",
        repName: document.getElementById("c-rep-name")?.value || "",
        repTc: document.getElementById("c-rep-tc")?.value || "",
        repBirth: document.getElementById("c-rep-birth")?.value || "",
        repEmail: document.getElementById("c-rep-email")?.value || "",
        repPhone: document.getElementById("c-rep-phone")?.value || "",
        address: document.getElementById("c-company-address")?.value || ""
      },
      cadastre: {
        newAdaParsel: document.getElementById("b-new-ada-parsel")?.value || cad.ada,
        oldAdaParsel: document.getElementById("b-old-ada-parsel")?.value || `${cad.ada}/${cad.parsel}`,
        shelterM2: document.getElementById("m2-shelter")?.value || 0,
        parkingM2: document.getElementById("m2-parking")?.value || 0
      },
      owners: formOwners
    };
  }
  if (!app) return;

  let content = "\uFEFF"; // UTF-8 BOM

  // 1. BLOK: ŞİRKET BİLGİLERİ
  content += "Sirket Unvani;Vergi Numarasi;Yeni Ada;Yeni Parsel;Yeni Projede Siginak M2;Yeni Projede Otopark M2\n";
  content += `"${app.company.name}";="${app.company.taxNo}";"${app.cadastre.newAdaParsel}";"${app.cadastre.oldAdaParsel}";"${app.cadastre.shelterM2 || 0}";"${app.cadastre.parkingM2 || 0}"\n\n`;

  // 2. BLOK: ŞİRKET BANKA VE YETKİLİ DETAYLARI
  content += "Emlak Katilim Bankasi IBAN;Sirket Yetkili TC;Sirket Yetkilisi Ad/Soyad;Yetkili Dogum Tarihi;Yetkili E-Posta;Yetkili Cep Telefonu;Sirket Tebligat Adresi\n";
  content += `="${app.company.iban}";="${app.company.repTc}";"${app.company.repName}";"${app.company.repBirth || ''}";"${app.company.repEmail || ''}";="${app.company.repPhone}";"${app.company.address}"\n\n`;

  // 3. BLOK: HAK SAHİPLERİ TABLOSU (KULLANICININ İSTEDİĞİ RESMİ SIRA: TC, AD, SOYAD, TELEFON, ADRES, DOĞUM T, HİSSE, NİTELİK, KAT, BB NO, VEKALET)
  content += "TC;AD;SOYAD;TELEFON;MALIK ADRESI;DOGUM TARIHI;HISSE (PAY/PAYDA);NITELIGI (DUKKAN/KONUT);KAT;BAGIMSIZ BOLUM NO;VEKALET DURUMU;VEKIL TCKN;VEKIL AD SOYAD\n";

  app.owners.forEach(u => {
    const proxyStatus = u.hasProxy ? "Vekaleten" : "Asil (Sali-Persembe Belediye Imzasi)";
    const pTc = u.hasProxy ? `="${u.proxyTc || ''}"` : '""';
    const pName = u.hasProxy ? `"${u.proxyName || ''}"` : '""';
    content += `="${u.tc}";"${u.firstName}";"${u.lastName}";="${u.phone}";"${u.ownerAddress}";"${u.birthDate}";="${u.shareNum}/${u.shareDenom}";"${u.type}";"${u.floor}";"${u.oldUnitNo}";"${proxyStatus}";${pTc};${pName}\n`;
  });

  // 4. BLOK: RESMİ KILAVUZ SAYFA 4 AÇIKLAMALARI (DİPNOTLAR)
  content += "\nAciklama:\n";
  content += "1- Hisseli Bagimsiz bolumler doldurulurken hisse paydasinin esit olmasi gerekmektedir.\n";
  content += "2- Bagimsiz Bolum numaralari yikilan binadaki varsa kacak katlar dahil baz alinarak doldurulacaktir. Yeni kat irtifak listesi degil.\n";
  content += "3- El Birligi tapularinda hisse oranlari ya veraset intikal belgesinden yararlanarak doldurulacak yada yeni kat irtifak tapularinda belirtilen hisse oranlari uzerinden faydalanilacaktir.\n";

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Gungoren_Yarisi_Bizden_${app.appNo}_Hak_Sahipligi_Listesi.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  showToast("Resmi Hak Sahipliği Excel tablosu (Hisseler tarihe dönüşmez, düzenli) indirildi!", "success");
}

// Boş Excel Şablonu İndirme (SADECE BAŞLIKLAR VE DİPNOTLAR, DEMO KİŞİ YOK!)
function downloadOfficialExcelTemplate() {
  let content = "\uFEFF"; // UTF-8 BOM

  // 1. BLOK: ŞİRKET BİLGİLERİ BAŞLIKLARI
  content += "Sirket Unvani;Vergi Numarasi;Yeni Ada;Yeni Parsel;Yeni Projede Siginak M2;Yeni Projede Otopark M2\n";
  content += ";;;;;\n\n";

  // 2. BLOK: ŞİRKET BANKA VE YETKİLİ BAŞLIKLARI
  content += "Emlak Katilim Bankasi IBAN;Sirket Yetkili TC;Sirket Yetkilisi Ad/Soyad;Yetkili Dogum Tarihi;Yetkili E-Posta;Yetkili Cep Telefonu;Sirket Tebligat Adresi\n";
  content += ";;;;;;\n\n";

  // 3. BLOK: HAK SAHİPLERİ BAŞLIKLARI (TAM KULLANICININ İSTEDİĞİ RESMİ SIRA)
  content += "TC;AD;SOYAD;TELEFON;MALIK ADRESI;DOGUM TARIHI;HISSE (PAY/PAYDA);NITELIGI (DUKKAN/KONUT);KAT;BAGIMSIZ BOLUM NO;VEKALET DURUMU;VEKIL TCKN;VEKIL AD SOYAD\n";

  // 4. BLOK: RESMİ KILAVUZ SAYFA 4 AÇIKLAMALARI
  content += "\nAciklama:\n";
  content += "1- Hisseli Bagimsiz bolumler doldurulurken hisse paydasinin esit olmasi gerekmektedir.\n";
  content += "2- Bagimsiz Bolum numaralari yikilan binadaki varsa kacak katlar dahil baz alinarak doldurulacaktir. Yeni kat irtifak listesi degil.\n";
  content += "3- El Birligi tapularinda hisse oranlari ya veraset intikal belgesinden yararlanarak doldurulacak yada yeni kat irtifak tapularinda belirtilen hisse oranlari uzerinden faydalanilacaktir.\n";

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Gungoren_Yarisi_Bizden_Hak_Sahipleri_Bos_Sablon.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  showToast("Boş resmi Excel şablonu (Kullanıcı talimatına göre sadece başlıklar ve resmi dipnotlar) başarıyla indirildi!", "success");
}

function handleExcelUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const inputEl = event.target;
  const fileName = (file.name || "").toLowerCase();

  showToast("⏳ Excel dosyası okunuyor, lütfen bekleyiniz...", "info");

  // UI thread'in toast'u ekrana basması ve dosya diyaloğunu temizlemesi için mikro gecikme
  setTimeout(() => {
    try {
      // 1. İkili Excel (.xlsx, .xls) Dosyası
      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        if (typeof XLSX !== "undefined") {
          const reader = new FileReader();
          reader.onload = function (e) {
            try {
              const data = new Uint8Array(e.target.result);
              // sheetRows: 500 => SheetJS'in milyon satırlık boş hücreleri tarayıp tarayıcıyı kitlemesini %100 önler!
              const workbook = XLSX.read(data, {
                type: "array",
                sheetRows: 500,
                cellFormula: false,
                cellHTML: false,
                cellText: false
              });
              const firstSheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[firstSheetName];

              if (worksheet && worksheet["!ref"]) {
                const range = XLSX.utils.decode_range(worksheet["!ref"]);
                if (range.e.r > 500) {
                  range.e.r = 500;
                  worksheet["!ref"] = XLSX.utils.encode_range(range);
                }
              }

              // sheet_to_csv KULLANILMIYOR: Doğrudan 2 boyutlu dizi olarak anında alıyoruz (Sıfır kasma!)
              const rawMatrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false, defval: "" });
              processOwnerRowsMatrix(rawMatrix);
            } catch (err) {
              console.error("Excel ayrıştırma hatası:", err);
              showToast("Excel dosyası (.xlsx) okunurken hata: " + err.message, "danger");
            } finally {
              inputEl.value = "";
            }
          };
          reader.onerror = function () {
            showToast("Dosya okunamadı.", "danger");
            inputEl.value = "";
          };
          reader.readAsArrayBuffer(file);
          return;
        } else {
          showToast("Excel (.xlsx) kütüphanesi yüklenemedi. Dosyanızı CSV olarak kaydedip yükleyebilirsiniz.", "warning");
          inputEl.value = "";
          return;
        }
      }

      // 2. CSV Dosyası (.csv)
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const text = e.target.result;
          parseCsvTextToMatrix(text);
        } catch (err) {
          console.error("CSV ayrıştırma hatası:", err);
          showToast("CSV dosyası okunurken hata: " + err.message, "danger");
        } finally {
          inputEl.value = "";
        }
      };
      reader.onerror = function () {
        showToast("Dosya okunamadı.", "danger");
        inputEl.value = "";
      };
      reader.readAsText(file, "UTF-8");
    } catch (ex) {
      console.error(ex);
      showToast("Dosya yüklenirken hata: " + ex.message, "danger");
      inputEl.value = "";
    }
  }, 40);
}

function parseCsvTextToMatrix(text) {
  if (!text || typeof text !== "string") {
    showToast("Dosya içeriği boş veya geçersiz.", "warning");
    return;
  }

  // Binary dosya koruması
  if (text.includes("\x00") || text.slice(0, 4) === "PK\x03\x04") {
    showToast("Bu dosya ikili Excel (.xlsx) formatındadır. Lütfen dosya uzantısını kontrol ediniz.", "warning");
    return;
  }

  // Maksimum 500 satır sınırla (Asla sonsuz döngüye girmez)
  const rawLines = text.split(/\r?\n/).slice(0, 500);
  const matrix = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;
    const sep = line.includes(";") ? ";" : ",";
    const cells = line.split(sep).map(c => c.replace(/^"|"$/g, "").replace(/^="|"$|^'|'$/g, "").trim());
    // Tamamı boş olan satırları atla
    if (cells.some(c => c.length > 0)) {
      matrix.push(cells);
    }
  }

  processOwnerRowsMatrix(matrix);
}

function processOwnerRowsMatrix(matrix) {
  if (!matrix || !Array.isArray(matrix) || matrix.length === 0) {
    showToast("Yüklenen tabloda veri satırı bulunamadı.", "warning");
    return;
  }

  // 1. Şirket ve Proje Başlıklarını Algılama (varsa)
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const row = matrix[i].map(c => String(c || "").trim());
    const rowStr = row.join(" ").toUpperCase();

    // Şirket Başlık Satırı
    if (rowStr.includes("SIRKET") && (rowStr.includes("UNVAN") || rowStr.includes("VERGI"))) {
      const nextRow = matrix[i + 1];
      if (nextRow && nextRow.length >= 2) {
        const cName = String(nextRow[0] || "").trim();
        const cTax = String(nextRow[1] || "").replace(/\D/g, "");
        if (cName && cName.length > 3) {
          const el = document.getElementById("c-company-name");
          if (el) el.value = cName;
        }
        if (cTax) {
          const el = document.getElementById("c-tax-no");
          if (el) el.value = cTax;
        }
        if (nextRow[2]) {
          const el = document.getElementById("b-new-ada-parsel");
          if (el) el.value = String(nextRow[2]).trim();
        }
        if (nextRow[3]) {
          const el = document.getElementById("b-old-ada-parsel");
          if (el) el.value = String(nextRow[3]).trim();
        }
      }
    }

    // IBAN & Yetkili Satırı
    if (rowStr.includes("IBAN") || rowStr.includes("EMLAK KATILIM") || (row[0] && row[0].toUpperCase().startsWith("TR"))) {
      let dataRow = row;
      if (rowStr.includes("IBAN") && !row[0].toUpperCase().startsWith("TR") && matrix[i + 1]) {
        dataRow = matrix[i + 1].map(c => String(c || "").trim());
      }
      const rawIban = String(dataRow[0] || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
      if (rawIban.startsWith("TR")) {
        const el = document.getElementById("c-iban");
        if (el) el.value = rawIban;
      }
      if (dataRow[1]) {
        const cleanTc = String(dataRow[1]).replace(/\D/g, "").slice(0, 11);
        const el = document.getElementById("c-rep-tc");
        if (el && cleanTc.length >= 10) el.value = cleanTc;
      }
      if (dataRow[2]) {
        const el = document.getElementById("c-rep-name");
        if (el) el.value = String(dataRow[2]).trim();
      }
      if (dataRow[3]) {
        const el = document.getElementById("c-rep-birth");
        if (el) el.value = String(dataRow[3]).trim();
      }
      if (dataRow[4]) {
        const el = document.getElementById("c-rep-email");
        if (el && String(dataRow[4]).includes("@")) el.value = String(dataRow[4]).trim();
      }
      if (dataRow[5]) {
        const el = document.getElementById("c-rep-phone");
        if (el) el.value = cleanPhoneInput(String(dataRow[5]));
      }
      if (dataRow[6]) {
        const el = document.getElementById("c-company-address");
        if (el) el.value = String(dataRow[6]).trim();
      }
    }
  }

  // 2. Hak Sahipleri Başlık Satırını Bul
  let headerIdx = -1;
  const colMap = {
    tc: -1,
    ad: -1,
    soyad: -1,
    phone: -1,
    address: -1,
    birthDate: -1,
    share: -1,
    type: -1,
    floor: -1,
    bbNo: -1,
    proxyStatus: -1,
    proxyTc: -1,
    proxyName: -1
  };

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i].map(c => String(c || "").trim().toUpperCase());

    // Başlık satırı arama kriteri:
    const hasTc = row.some(c => c === "TC" || c === "TCKN" || c === "T.C." || c.includes("TC KİMLİK") || c.includes("TC KIMLIK") || c.includes("KİMLİK NO") || c.includes("KIMLIK NO"));
    const hasNameOrPhone = row.some(c => c.includes("AD") || c.includes("SOYAD") || c.includes("TEL") || c.includes("MALİK") || c.includes("MALIK") || c.includes("BÖLÜM") || c.includes("BOLUM") || c.includes("DAİRE"));

    if (hasTc && hasNameOrPhone) {
      headerIdx = i;
      row.forEach((col, idx) => {
        // T.C. Kimlik
        if ((col === "TC" || col === "TCKN" || col === "T.C." || col.includes("TCKN") || col.includes("KİMLİK") || col.includes("KIMLIK")) && !col.includes("VEKİL") && !col.includes("VEKIL")) {
          if (colMap.tc === -1) colMap.tc = idx;
        }
        // Soyad
        else if (col.includes("SOYAD") && !col.includes("VEKİL") && !col.includes("VEKIL")) {
          if (colMap.soyad === -1) colMap.soyad = idx;
        }
        // Ad (Soyad ve Vekil Hariç)
        else if ((col === "AD" || col === "ADI" || col === "İSİM" || col === "ISIM" || col === "AD SOYAD" || col === "ADI SOYADI") && !col.includes("SOYAD") && !col.includes("VEKİL") && !col.includes("VEKIL")) {
          if (colMap.ad === -1) colMap.ad = idx;
        }
        // Telefon
        else if (col.includes("TEL") || col.includes("TELEFON") || col.includes("CEP") || col.includes("GSM")) {
          if (colMap.phone === -1) colMap.phone = idx;
        }
        // Malik Adresi (Şirket adresi veya vekil adresi hariç)
        else if ((col.includes("ADRES") || col.includes("İKAMET") || col.includes("IKAMET")) && !col.includes("ŞİRKET") && !col.includes("SIRKET") && !col.includes("VEKİL")) {
          if (colMap.address === -1) colMap.address = idx;
        }
        // Doğum Tarihi
        else if (col.includes("DOĞUM") || col.includes("DOGUM")) {
          if (colMap.birthDate === -1) colMap.birthDate = idx;
        }
        // Hisse Pay / Payda
        else if (col.includes("HİSSE") || col.includes("HISSE") || col.includes("PAY") || col.includes("ORAN")) {
          if (colMap.share === -1) colMap.share = idx;
        }
        // Nitelik
        else if (col.includes("NİTELİK") || col.includes("NITELIK") || col.includes("TÜR") || col.includes("TUR") || col.includes("CİNS")) {
          if (colMap.type === -1) colMap.type = idx;
        }
        // Kat
        else if (col.includes("KAT") && !col.includes("İRTİFAK") && !col.includes("IRTIFAK") && !col.includes("KATILIM")) {
          if (colMap.floor === -1) colMap.floor = idx;
        }
        // Bağımsız Bölüm No (TC NO veya VERGİ NO veya TELEFON NO KESİNLİKLE DEĞİL!)
        else if ((col.includes("BB") || col.includes("BÖLÜM") || col.includes("BOLUM") || col.includes("DAİRE") || col.includes("DAIRE") || col.includes("KAPI") || col === "NO" || col === "SIRA NO") && !col.includes("TC") && !col.includes("VERGİ") && !col.includes("VERGI") && !col.includes("TEL")) {
          if (colMap.bbNo === -1) colMap.bbNo = idx;
        }
        // Vekalet Durumu
        else if (col.includes("VEKALET") || col.includes("DURUM")) {
          if (colMap.proxyStatus === -1) colMap.proxyStatus = idx;
        }
        // Vekil TC
        else if ((col.includes("VEKİL") || col.includes("VEKIL")) && (col.includes("TC") || col.includes("TCKN"))) {
          if (colMap.proxyTc === -1) colMap.proxyTc = idx;
        }
        // Vekil Ad
        else if ((col.includes("VEKİL") || col.includes("VEKIL")) && (col.includes("AD") || col.includes("İSİM") || col.includes("SOYAD"))) {
          if (colMap.proxyName === -1) colMap.proxyName = idx;
        }
      });
      break;
    }
  }

  // 3. Veri Satırlarını Ayıkla
  const startLine = headerIdx !== -1 ? headerIdx + 1 : 0;
  const newOwners = [];
  const defaultAddress = document.getElementById("b-address")?.value || "Güngören / İSTANBUL";

  for (let i = startLine; i < matrix.length; i++) {
    const row = matrix[i].map(c => String(c || "").trim());
    if (row.length === 0 || row.every(c => c === "")) continue;

    const firstCell = (row[0] || "").toLowerCase();
    // Dipnotlar ve açıklamalar geldiyse sonlandır
    if (firstCell.startsWith("aciklama") || firstCell.startsWith("açıklama") || firstCell.startsWith("1-") || firstCell.startsWith("2-") || firstCell.startsWith("3-")) {
      break;
    }

    let tcVal = "";
    let adVal = "";
    let soyadVal = "";
    let phoneVal = "";
    let addrVal = "";
    let birthVal = "";
    let hisseStr = "1/1";
    let typeVal = "Konut (Daire)";
    let floorVal = "1. Kat";
    let bbNoVal = "";
    let proxyStatusStr = "";
    let proxyTcVal = "";
    let proxyNameVal = "";

    if (colMap.tc !== -1 && row[colMap.tc]) tcVal = cleanTcInput(row[colMap.tc]);
    if (colMap.ad !== -1 && row[colMap.ad]) adVal = row[colMap.ad];
    if (colMap.soyad !== -1 && row[colMap.soyad]) soyadVal = row[colMap.soyad];
    if (colMap.phone !== -1 && row[colMap.phone]) phoneVal = cleanPhoneInput(row[colMap.phone]);
    if (colMap.address !== -1 && row[colMap.address]) addrVal = row[colMap.address];
    if (colMap.birthDate !== -1 && row[colMap.birthDate]) birthVal = row[colMap.birthDate];
    if (colMap.share !== -1 && row[colMap.share]) hisseStr = row[colMap.share];
    if (colMap.type !== -1 && row[colMap.type]) typeVal = row[colMap.type];
    if (colMap.floor !== -1 && row[colMap.floor]) floorVal = row[colMap.floor];
    if (colMap.bbNo !== -1 && row[colMap.bbNo]) bbNoVal = row[colMap.bbNo];
    if (colMap.proxyStatus !== -1 && row[colMap.proxyStatus]) proxyStatusStr = row[colMap.proxyStatus].toLowerCase();
    if (colMap.proxyTc !== -1 && row[colMap.proxyTc]) proxyTcVal = cleanTcInput(row[colMap.proxyTc]);
    if (colMap.proxyName !== -1 && row[colMap.proxyName]) proxyNameVal = row[colMap.proxyName];

    // Akıllı Başlıksız Eşleme (Eğer sütunlar tespit edilemediyse satırdaki verileri tara)
    if (!tcVal) {
      for (let c = 0; c < row.length; c++) {
        const cleaned = cleanTcInput(row[c]);
        if (cleaned.length === 11) {
          tcVal = cleaned;
          break;
        }
      }
    }

    if (!adVal) {
      for (let c = 0; c < row.length; c++) {
        const val = row[c];
        if (val && val.length >= 2 && !val.match(/\d/) && !val.includes("/") && c !== colMap.floor && c !== colMap.type) {
          if (!adVal) {
            adVal = val;
          } else if (!soyadVal) {
            soyadVal = val;
            break;
          }
        }
      }
    }

    if (!phoneVal) {
      for (let c = 0; c < row.length; c++) {
        const cleaned = cleanPhoneInput(row[c]);
        if (cleaned.length === 10 && cleaned.startsWith("5")) {
          phoneVal = cleaned;
          break;
        }
      }
    }

    // BB No belirleme
    if (!bbNoVal) {
      // Satırda küçük bir tamsayı var mı bak
      for (let c = 0; c < Math.min(row.length, 3); c++) {
        const num = parseInt(row[c], 10);
        if (!isNaN(num) && num > 0 && num < 200 && String(num) === row[c].trim()) {
          bbNoVal = String(num);
          break;
        }
      }
      if (!bbNoVal) {
        bbNoVal = String(newOwners.length + 1);
      }
    }

    // Ad soyad ayrıştırma (tek hücrede birleşik geldiyse)
    if (adVal && !soyadVal && adVal.includes(" ")) {
      const parts = adVal.split(" ");
      soyadVal = parts.pop();
      adVal = parts.join(" ");
    }

    if (!addrVal || addrVal.length < 3) {
      addrVal = defaultAddress;
    }

    // Kat temizleme (Aşırı büyük sayı veya anlamsız veri olmasını engelle)
    if (!floorVal || floorVal.length > 20) {
      floorVal = "1. Kat";
    }

    // Hisse pay / payda temizleme
    let sNum = 1;
    let sDenom = 1;
    if (hisseStr && hisseStr.includes("/")) {
      const parts = hisseStr.replace(/[^0-9\/]/g, "").split("/");
      sNum = parseInt(parts[0], 10) || 1;
      sDenom = parseInt(parts[1], 10) || 1;
    }

    // En azından Ad veya TC veya BB No olan geçerli bir satır mı?
    if (tcVal.length >= 5 || adVal.length >= 2 || bbNoVal.length >= 1) {
      const hasProxy = proxyStatusStr.includes("vekal") || proxyTcVal.length > 5 || proxyNameVal.length > 2;
      newOwners.push({
        id: "owner_" + Date.now() + "_" + (newOwners.length + 1),
        parcel: activeInputParcel || projectActiveParcels[0] || "260/5",
        block: activeInputBlock || projectActiveBlocks[0] || "A Blok",
        tc: tcVal,
        phone: phoneVal,
        firstName: adVal,
        lastName: soyadVal,
        birthDate: birthVal,
        ownerAddress: addrVal,
        type: typeVal,
        floor: floorVal,
        oldUnitNo: bbNoVal,
        shareNum: sNum,
        shareDenom: sDenom,
        hasProxy: hasProxy,
        proxyTc: proxyTcVal,
        proxyName: proxyNameVal
      });
    }

    if (newOwners.length >= 300) {
      // 300 bağımsız bölümden fazlası bir binada olamaz, güvenle durdur
      break;
    }
  }

  if (newOwners.length > 0) {
    if (currentStructureType === "tevhid" && activeInputParcel) {
      // Sadece aktif parselin satırlarını güncelle, diğer parsellerdeki kayıtları koru!
      formOwners = [...formOwners.filter(o => (o.parcel || projectActiveParcels[0]) !== activeInputParcel), ...newOwners];
    } else if (currentStructureType === "blocks" && activeInputBlock) {
      // Sadece aktif bloğun satırlarını güncelle
      formOwners = [...formOwners.filter(o => (o.block || projectActiveBlocks[0]) !== activeInputBlock), ...newOwners];
    } else {
      formOwners = newOwners;
    }
    renderOwnersBlockTabs();
    renderContractorOwnersTable();
    if (typeof syncOwnersToSectionSchematic === "function") {
      syncOwnersToSectionSchematic(true);
    }
    saveDataToStorage(false); // Debounced hafif kaydet
    showToast(`🎉 Başarılı! Excel'den ${newOwners.length} hak sahibi bilgileri anında aktarıldı!`, "success");
  } else {
    showToast("Excel dosyasında geçerli hak sahibi satırı bulunamadı. Lütfen indirilen şablon sütunlarına uygun doldurunuz.", "warning");
  }
}

// =========================================================================
// RESMİ EK-1 DİLEKÇE YAZDIRMA (BAKANLIK FORMATI BİREBİR AYNISI)
// =========================================================================

// Kentsel Dönüşüm Başkanlığı Resmi Logosu SVG Çizimi
const KENTSEL_LOGO_SVG = `
  <svg class="ek1-logo-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="15" y="42" width="16" height="46" rx="2" stroke="#27272a" stroke-width="5" fill="#f4f4f5"/>
    <rect x="20" y="48" width="6" height="6" fill="#27272a"/>
    <rect x="20" y="60" width="6" height="6" fill="#27272a"/>
    <rect x="20" y="72" width="6" height="6" fill="#27272a"/>
    <path d="M38 28H58V88H38V28Z" stroke="#27272a" stroke-width="5" fill="#ffffff"/>
    <rect x="44" y="36" width="8" height="8" fill="#27272a"/>
    <rect x="44" y="50" width="8" height="8" fill="#27272a"/>
    <rect x="44" y="64" width="8" height="8" fill="#27272a"/>
    <path d="M65 48L85 36V88H65V48Z" stroke="#27272a" stroke-width="5" fill="#f4f4f5"/>
    <rect x="71" y="52" width="6" height="6" fill="#27272a"/>
    <rect x="71" y="66" width="6" height="6" fill="#27272a"/>
    <line x1="10" y1="92" x2="90" y2="92" stroke="#27272a" stroke-width="5" stroke-linecap="round"/>
  </svg>
`;

function extractCadastreValues(app = null) {
  let ykn = "";
  let oldAda = "";
  let oldParsel = "";
  let neighborhood = "";
  let streetAddress = "";

  const inputYkn = document.getElementById("b-ykn")?.value;
  const inputOldAdaParsel = document.getElementById("b-old-ada-parsel")?.value;
  const inputNewAdaParsel = document.getElementById("b-new-ada-parsel")?.value;
  const inputNeighborhood = document.getElementById("b-neighborhood")?.value;
  const inputAddress = document.getElementById("b-address")?.value;

  if (inputYkn && inputYkn.trim()) ykn = inputYkn.trim();
  if (inputNeighborhood && inputNeighborhood.trim()) neighborhood = inputNeighborhood.trim();
  if (inputAddress && inputAddress.trim()) streetAddress = inputAddress.trim();

  let rawAdaParsel = (inputOldAdaParsel || inputNewAdaParsel || "").trim();

  if (app && app.cadastre) {
    if (!ykn && app.cadastre.ykn) ykn = String(app.cadastre.ykn).trim();
    if (!neighborhood && app.cadastre.neighborhood) neighborhood = String(app.cadastre.neighborhood).trim();
    if (!streetAddress && app.cadastre.address) streetAddress = String(app.cadastre.address).trim();
    if (!rawAdaParsel) rawAdaParsel = (app.cadastre.oldAdaParsel || app.cadastre.newAdaParsel || "").trim();
  }

  // Ada / Parsel'i parseAdaParsel ile ayıkla
  const parsed = parseAdaParsel(rawAdaParsel);
  oldAda = parsed.ada;
  oldParsel = parsed.parsel;

  // Kullanıcı Talimatı: Yıkılan binaya ait standart tek ve resmi bina adresi
  // Örn: "Merkez Mah. Sokullu Paşa Cad. No:65 Güngören / İSTANBUL"
  let fullStandardAddress = "";
  if (neighborhood && streetAddress) {
    fullStandardAddress = `${neighborhood} ${streetAddress}`;
  } else if (streetAddress) {
    fullStandardAddress = streetAddress;
  } else if (neighborhood) {
    fullStandardAddress = `${neighborhood} Sokullu Paşa Cad. No:65`;
  } else {
    fullStandardAddress = "Merkez Mah. Sokullu Paşa Cad. No:65";
  }

  if (!fullStandardAddress.toLowerCase().includes("güngören")) {
    fullStandardAddress += " Güngören / İSTANBUL";
  }

  return {
    ykn: ykn || "……………",
    ada: oldAda || "……",
    parsel: oldParsel || "……",
    neighborhood: neighborhood || "Merkez Mah.",
    streetAddress: streetAddress || "",
    address: fullStandardAddress
  };
}

function buildExactEK1Html(data = null) {
  const ykn = (data && data.ykn && String(data.ykn).trim() && data.ykn !== "undefined") ? data.ykn : "………………….";
  const parsedCad = parseAdaParsel(data && (data.adaParsel || data.oldAdaParsel || (data.ada && data.parsel ? `${data.ada}/${data.parsel}` : data.ada || data.parsel)));
  const ada = parsedCad.ada;
  const parsel = parsedCad.parsel || (data && data.parsel && data.parsel !== "……" ? data.parsel : "………..");
  // Malik adresi: Excel'den yüklenen veya malik tablosundaki bağımsız bölüm malik adresi
  const malikAddress = (data && data.ownerAddress && String(data.ownerAddress).trim() && data.ownerAddress !== "undefined")
    ? data.ownerAddress
    : ((data && data.address && String(data.address).trim() && data.address !== "undefined")
      ? data.address
      : "Güngören / İSTANBUL");
  const unitNo = (data && data.unitNo && String(data.unitNo).trim() && data.unitNo !== "undefined") ? data.unitNo : "…..";
  const dateStr = (data && data.date) ? data.date : "……/…./20…";
  const nameStr = (data && data.fullName && data.fullName.trim()) ? data.fullName : "Adı Soyadı";
  const tcStr = (data && data.tc) ? data.tc : "T.C. Kimlik No: …………………";
  const malikPhone = (data && data.phone) ? data.phone : "";

  return `
    <div class="ek1-official-page">
      <div class="ek1-watermark">
        ${KENTSEL_LOGO_SVG}
      </div>

      <div class="ek1-top-row">
        <div class="ek1-logo-container">
          ${KENTSEL_LOGO_SVG}
          <div class="ek1-logo-text">
            <span>KENTSEL</span>
            <span>DÖNÜŞÜM</span>
            <span>BAŞKANLIĞI</span>
          </div>
        </div>
        <div class="ek1-badge-tag">EK-1</div>
      </div>

      <div class="ek1-recipient-title">
        ${data && data.municipality ? data.municipality : "GÜNGÖREN BELEDİYE BAŞKANLIĞINA"}
      </div>

      <div class="ek1-body-text">
        <p>
          <span class="ek1-blank">${ykn}</span> yapı kimlik, ${ada ? `<span class="ek1-blank">${ada}</span> ada, ` : ''}<span class="ek1-blank">${parsel}</span> parsel numaralı,
          <span class="ek1-blank">${malikAddress}</span> adresinde yer alan
          parselde e-devlet kapısı üzerinden 26.04.2023-02.06.2023 tarihleri arasında yapım için yardım
          başvurusunda bulunulmuş olup, 22.02.2024 tarih ve 8189 sayılı Cumhurbaşkanı Kararı ile koşulları
          belirlenen yapım için yardım kapsamında yukarıda bilgilerini ve açık adresini belirttiğim yapıda
          bulunan <span class="ek1-blank">${unitNo}</span> nolu bağımsız bölüm için hibe ve/veya kredi desteğinden faydalanmak istiyorum.
        </p>

        <p>
          Yapım için yardım başvurumun uygun bulunması halinde; tarafımca ve Başkanlıkça
          imzalanacak hibe taahhütnamesi ve/veya kredi sözleşmesinde belirtilen tutarın, 22.02.2024 tarih ve
          8189 sayılı Cumhurbaşkanı Kararında belirtilen koşullar dahilinde aktarılması hususunda;
        </p>

        <p style="margin-top: 14px;">
          Gereğini arz ederim.
        </p>
      </div>

      <div class="ek1-sig-container">
        <div class="ek1-sig-box">
          <div class="date-line">${dateStr}</div>
          <div class="name-line">${nameStr}</div>
          ${data && data.hasProxy ? `
            <div style="font-weight:700; font-size:9.5pt; margin-top:3px; color:#0f172a;">TCKN: ${data.proxyTc || '…………………'}</div>
            <div style="font-weight:700; font-size:9.5pt; color:#0f172a;">VK: ${data.proxyName || '…………………'}</div>
          ` : `
            <div class="tc-line">${tcStr}</div>
          `}
          <div class="sign-placeholder">İmza</div>
        </div>
      </div>

      <div class="ek1-bottom-block">
        <div class="ek1-contact-box">
          <div class="ek1-contact-title">İletişim Bilgileri</div>
          <div class="ek1-contact-row">
            <span>Adres</span>
            <span>:</span>
            <span>${malikAddress}</span>
          </div>
          <div class="ek1-contact-row">
            <span>Telefon</span>
            <span>:</span>
            <span>${malikPhone}</span>
          </div>
        </div>

        <div class="ek1-attachments-box">
          <div class="ek1-attachments-title">EKLER:</div>
          <div style="margin-top: 2px;">1- Nüfus cüzdanı fotokopisi</div>
          <div>2- Vekaleten yapılan başvurularda vekaletname aslı ve vekilin kimlik fotokopisi</div>
          <div>3- Kat irtifak listesi</div>
        </div>
      </div>
    </div>
  `;
}

let currentEK1OwnerIndex = 0;

// Dilekçe Modalını Açma (Varsayılan olarak tek sayfa veya isteğe göre toplu)
function printOfficialEK1Modal(useBlankTemplate = false, onlyFirst = true) {
  let app = null;
  if (selectedAppId) {
    app = applicationsList.find(a => a.id === selectedAppId);
  } else {
    app = {
      cadastre: {
        ykn: document.getElementById("b-ykn")?.value || "",
        oldAdaParsel: document.getElementById("b-old-ada-parsel")?.value || "",
        address: document.getElementById("b-address")?.value || ""
      },
      owners: formOwners
    };
  }

  const container = document.getElementById("ek1-dynamic-body");
  if (!container) return;
  container.innerHTML = "";

  if (useBlankTemplate || !app) {
    container.innerHTML = buildExactEK1Html(null);
  } else {
    const cad = extractCadastreValues(app);
    // Sürüsüyle evrak çıkmasını engellemek için varsayılan olarak seçili / ilk maliki tek sayfa açar
    const targetOwner = (app.owners && app.owners[currentEK1OwnerIndex]) ? app.owners[currentEK1OwnerIndex] : (app.owners ? app.owners[0] : {});
    const listToRender = onlyFirst ? [targetOwner || {}] : app.owners;

    listToRender.forEach(u => {
      const pageWrapper = document.createElement("div");
      pageWrapper.style.pageBreakAfter = "always";
      pageWrapper.style.marginBottom = "30px";

      const ownerAddr = (u.ownerAddress && u.ownerAddress.trim().length > 3) ? u.ownerAddress.trim() : cad.address;

      const data = {
        municipality: "GÜNGÖREN BELEDİYE BAŞKANLIĞINA",
        ykn: cad.ykn,
        ada: cad.ada,
        parsel: cad.parsel,
        address: cad.address,
        unitNo: u.oldUnitNo || "1",
        date: new Date().toLocaleDateString("tr-TR"),
        fullName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || "Malik Adı Soyadı",
        tc: u.tc ? `T.C. Kimlik No: ${u.tc}` : "T.C. Kimlik No: …………………",
        ownerAddress: ownerAddr,
        phone: u.phone || "",
        hasProxy: !!u.hasProxy,
        proxyTc: u.proxyTc || "",
        proxyName: u.proxyName || ""
      };

      pageWrapper.innerHTML = buildExactEK1Html(data);
      container.appendChild(pageWrapper);
    });
  }

  document.getElementById("print-ek1-modal").style.display = "flex";
}

// Müteahhit formundaki tek bir hak sahibi için dilekçe açma (TEK SAYFA!)
function printFormOwnerEK1(idx) {
  currentEK1OwnerIndex = idx;
  const u = formOwners[idx];
  if (!u) return;
  const cad = extractCadastreValues(null);

  const container = document.getElementById("ek1-dynamic-body");
  if (!container) return;
  container.innerHTML = "";

  const ownerAddr = (u.ownerAddress && u.ownerAddress.trim().length > 3) ? u.ownerAddress.trim() : cad.address;

  const data = {
    municipality: "GÜNGÖREN BELEDİYE BAŞKANLIĞINA",
    ykn: cad.ykn,
    ada: cad.ada,
    parsel: cad.parsel,
    address: cad.address,
    unitNo: u.oldUnitNo || `${idx + 1}`,
    date: new Date().toLocaleDateString("tr-TR"),
    fullName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || "Malik Adı Soyadı",
    tc: u.tc ? `T.C. Kimlik No: ${u.tc}` : "T.C. Kimlik No: …………………",
    ownerAddress: ownerAddr,
    phone: u.phone || "",
    hasProxy: !!u.hasProxy,
    proxyTc: u.proxyTc || "",
    proxyName: u.proxyName || ""
  };

  container.innerHTML = buildExactEK1Html(data);
  document.getElementById("print-ek1-modal").style.display = "flex";
}

// Tek bir hak sahibi için EK-1 açma (Belediye Yetkili Masası)
function printSingleAppEK1(appId, idx) {
  currentEK1OwnerIndex = idx;
  const app = applicationsList.find(a => a.id === appId);
  if (!app || !app.owners[idx]) return;
  const u = app.owners[idx];
  const cad = extractCadastreValues(app);

  const container = document.getElementById("ek1-dynamic-body");
  if (!container) return;
  container.innerHTML = "";

  const ownerAddr = (u.ownerAddress && u.ownerAddress.trim().length > 3) ? u.ownerAddress.trim() : cad.address;

  const data = {
    municipality: "GÜNGÖREN BELEDİYE BAŞKANLIĞINA",
    ykn: cad.ykn,
    ada: cad.ada,
    parsel: cad.parsel,
    address: cad.address,
    unitNo: u.oldUnitNo || `${idx + 1}`,
    date: new Date().toLocaleDateString("tr-TR"),
    fullName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || "Malik Adı Soyadı",
    tc: u.tc ? `T.C. Kimlik No: ${u.tc}` : "T.C. Kimlik No: …………………",
    ownerAddress: u.ownerAddress || cad.address,
    phone: u.phone || "",
    hasProxy: !!u.hasProxy,
    proxyTc: u.proxyTc || "",
    proxyName: u.proxyName || ""
  };

  container.innerHTML = buildExactEK1Html(data);
  document.getElementById("print-ek1-modal").style.display = "flex";
}

function openBlankEK1Modal() {
  const container = document.getElementById("ek1-dynamic-body");
  if (!container) return;
  container.innerHTML = buildExactEK1Html(null);
  document.getElementById("print-ek1-modal").style.display = "flex";
}

function closeEK1Modal() {
  const modal = document.getElementById("print-ek1-modal");
  if (modal) modal.style.display = "none";
}

// Tamamen boş, noktalı resmi şablonu aç (Kullanıcının attığı görselin aynısı)
function openBlankEK1Modal() {
  const container = document.getElementById("ek1-dynamic-body");
  if (!container) return;
  container.innerHTML = buildExactEK1Html(null);
  document.getElementById("print-ek1-modal").style.display = "flex";
}

// Aktif bağımsız bölüm maliki için doldurulmuş EK-1 dilekçesini aç
function printActiveOwnerEK1() {
  if (!activeMergerContext || !activeMergerContext.owner) {
    openBlankEK1Modal();
    return;
  }
  const { app, owner } = activeMergerContext;
  const container = document.getElementById("ek1-dynamic-body");
  if (!container) return;

  const ykn = (app && app.cadastre && app.cadastre.ykn) || document.getElementById("b-ykn")?.value || "……………";
  const oldAda = (app && app.cadastre && app.cadastre.oldAdaParsel ? app.cadastre.oldAdaParsel.split("/")[0] : document.getElementById("b-old-ada-parsel")?.value) || "……";
  const oldParsel = (app && app.cadastre && app.cadastre.oldAdaParsel ? app.cadastre.oldAdaParsel.split("/")[1] : "") || "……";
  const addr = (app && app.cadastre && app.cadastre.address) || document.getElementById("b-address")?.value || "Güngören / İSTANBUL";
  const unitNo = owner.oldUnitNo || "1";
  const dateStr = new Date().toLocaleDateString("tr-TR");
  const fullName = `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || "Malik Adı Soyadı";
  const tc = owner.tc ? `T.C. Kimlik No: ${owner.tc}` : "T.C. Kimlik No: …………………";
  const ownerAddress = owner.ownerAddress || addr;
  const phone = owner.phone || "";

  const data = {
    municipality: "GÜNGÖREN BELEDİYE BAŞKANLIĞINA",
    ykn: ykn,
    ada: oldAda,
    parsel: oldParsel,
    address: addr,
    unitNo: unitNo,
    date: dateStr,
    fullName: fullName,
    tc: tc,
    ownerAddress: ownerAddress,
    phone: phone,
    hasProxy: !!owner.hasProxy,
    proxyTc: owner.proxyTc || "",
    proxyName: owner.proxyName || ""
  };

  container.innerHTML = buildExactEK1Html(data);
  document.getElementById("print-ek1-modal").style.display = "flex";
}

// --- ARAAD KOPYALAYICI ---
function copyAraadQuick(tc, birthDate, name, btn) {
  if (!tc) {
    showToast("T.C. Kimlik No boş!", "warning");
    return;
  }
  navigator.clipboard.writeText(tc).then(() => {
    const orig = btn.innerText;
    btn.innerText = "✓";
    showToast(`${name} T.C. kopyalandı (${tc})`, "success");
    setTimeout(() => { btn.innerText = orig; }, 1500);
  });
}

function copyFullAraadSummary() {
  if (!selectedAppId) return;
  const app = applicationsList.find(a => a.id === selectedAppId);
  if (!app) return;

  let text = `GÜNGÖREN BELEDİYESİ YARISI BİZDEN - ARAAD AKTARIM FORMU\n`;
  text += `Müteahhit: ${app.company.name} (Vergi No: ${app.company.taxNo})\n`;
  text += `Yetkili: ${app.company.repName} (T.C: ${app.company.repTc} - Doğum: ${app.company.repBirth || '-'} - E-posta: ${app.company.repEmail || '-'})\n`;
  text += `Banka: Emlak Katılım IBAN: ${app.company.iban}\n`;
  text += `Yapı Kimlik No: ${app.cadastre.ykn} | Ada/Parsel: ${app.cadastre.oldAdaParsel}\n`;
  text += `-------------------------------------------------------------------------\n`;
  text += `BB NO | KAT | NİTELİK | T.C. | DOĞUM T. | AD SOYAD | TELEFON | HİSSE\n`;

  app.owners.forEach(u => {
    text += `${u.oldUnitNo} | ${u.floor} | ${u.type} | ${u.tc} | ${u.birthDate} | ${u.firstName} ${u.lastName} | ${u.phone} | ${u.shareNum}/${u.shareDenom}\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast("Tüm binanın ARAAD özet tablosu panoya kopyalandı!", "success");
  });
}

// --- İLK AÇILIŞ İÇİN ÖRNEK BAŞVURU TOHUMLAMA ---
function seedInitialApplications() {
  applicationsList = [
    {
      id: "app_seed_1",
      appNo: "GB-2024-1452",
      submissionDate: "22.10.2024",
      status: "havuzda",
      claimedBy: null,
      company: {
        name: "Güngören Prestij Yapı ve İnşaat Ltd. Şti.",
        taxNo: "3482910482",
        iban: "TR54 0020 9000 0012 3456 7890 12",
        repName: "Mustafa Güven",
        repTc: "10293847562",
        repBirth: "1975-06-14",
        repEmail: "mustafa.guven@prestijyapi.com.tr",
        repPhone: "5354442211",
        address: "Akıncılar Mah. Posta Cad. No: 18 Güngören / İSTANBUL"
      },
      cadastre: {
        ykn: "1084729",
        neighborhood: "Haznedar Mah.",
        permitDate: "2024-04-15",
        oldAdaParsel: "1452 / 8",
        newAdaParsel: "1452 / 8",
        address: "Bağcılar Caddesi No: 42, Haznedar",
        oldM2: 1200,
        newM2: 1950,
        shelterM2: 80,
        parkingM2: 150
      },
      submittedByEmail: "ornek@insaat.com",
      messages: [
        {
          sender: "Hatice Nur Okumuş (Sistem Yöneticisi)",
          senderRole: "staff",
          text: "4 nolu Bağımsız Bölüm hissedarlarının hisse toplamlarını lütfen kontrol ediniz. Islak imzalı taranmış dilekçenizi ekleyiniz.",
          time: "14:30 - 22.10.2024"
        }
      ],
      owners: [
        { id: "o1", oldUnitNo: "1", floor: "Bodrum", type: "Ticari (Dükkan)", tc: "29481029384", phone: "5321112233", firstName: "Ahmet", lastName: "Yılmaz", birthDate: "14.05.1970", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Dükkan:1", shareNum: 1, shareDenom: 1, hasProxy: false },
        { id: "o2", oldUnitNo: "2", floor: "Bodrum", type: "Ticari (Dükkan)", tc: "38592019485", phone: "5332223344", firstName: "Mehmet", lastName: "Kaya", birthDate: "20.10.1974", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Dükkan:2", shareNum: 1, shareDenom: 1, hasProxy: false },
        { id: "o3", oldUnitNo: "3", floor: "Zemin", type: "Konut (Daire)", tc: "47693028596", phone: "5353334455", firstName: "Ayşe", lastName: "Demir", birthDate: "05.03.1978", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Daire:3", shareNum: 1, shareDenom: 1, hasProxy: true, proxyTc: "10829384712", proxyName: "Kemal Demir" },
        { id: "o4_1", oldUnitNo: "4", floor: "Zemin", type: "Konut (Daire)", tc: "58704139607", phone: "5424445566", firstName: "Fatma", lastName: "Şahin", birthDate: "12.08.1965", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Daire:4", shareNum: 3, shareDenom: 12, hasProxy: false },
        { id: "o4_2", oldUnitNo: "4", floor: "Zemin", type: "Konut (Daire)", tc: "69815240718", phone: "5435556677", firstName: "Hasan", lastName: "Şahin", birthDate: "19.01.1988", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Daire:4", shareNum: 1, shareDenom: 12, hasProxy: false },
        { id: "o5", oldUnitNo: "5", floor: "1.Kat", type: "Konut (Daire)", tc: "24360795263", phone: "5051234567", firstName: "Mustafa", lastName: "Koç", birthDate: "11.12.1960", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Daire:5", shareNum: 1, shareDenom: 1, hasProxy: false }
      ],
      buildingDocs: {
        contracts: {
          name: "Gungoren_Ada1452_Toplu_Insaat_Sozlesmesi.pdf",
          size: 2840120,
          type: "application/pdf",
          uploadedAt: "22.10.2024 14:30",
          docKey: "bdoc_seed1_contracts",
          dataUrl: VALID_MINIMAL_PDF
        },
        proxies: {
          name: "Gungoren_Ada1452_Noter_Onayli_Toplu_Vekaletnameler.pdf",
          size: 4125890,
          type: "application/pdf",
          uploadedAt: "22.10.2024 14:32",
          docKey: "bdoc_seed1_proxies",
          dataUrl: VALID_MINIMAL_PDF
        }
      }
    }
  ];
  saveDataToStorage();
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =========================================================================
// BAĞIMSIZ BÖLÜM EVRAKLARI (X.B.B.pdf) VE OTOMATİK PDF BİRLEŞTİRİCİ
// =========================================================================
let activeMergerContext = null;

function openUnitDocModal(source, idxOrAppId, optIdx = null) {
  let owner = null;
  let app = null;
  let index = null;
  let appId = null;

  if (source === "contractor") {
    index = idxOrAppId;
    owner = formOwners[index];
    if (!owner) return;
    app = {
      cadastre: {
        ykn: document.getElementById("b-ykn")?.value || "",
        oldAdaParsel: document.getElementById("b-old-ada-parsel")?.value || "",
        address: document.getElementById("b-address")?.value || "",
        neighborhood: document.getElementById("b-neighborhood")?.value || ""
      }
    };
    activeMergerContext = { source: "contractor", app, owner, index };
  } else {
    appId = idxOrAppId;
    index = optIdx;
    app = applicationsList.find(a => a.id === appId);
    if (!app || !app.owners[index]) return;
    owner = app.owners[index];
    activeMergerContext = { source: "staff", app, owner, index, appId };
  }

  // Başlık ve Etiket Güncelle
  const unitBadge = document.getElementById("merger-modal-unit-badge");
  const subText = document.getElementById("merger-modal-sub");
  const singleTitle = document.getElementById("single-upload-title");

  if (unitBadge) unitBadge.innerText = `${owner.oldUnitNo}.B.B.pdf`;
  if (subText) subText.innerText = `Bağımsız Bölüm No: ${owner.oldUnitNo} - ${owner.firstName || ''} ${owner.lastName || 'Malik'}`;
  if (singleTitle) singleTitle.innerText = `${owner.oldUnitNo}.B.B.pdf Hazır Dosyasını Seçin`;

  // Dosya inputlarını sıfırla
  const petInput = document.getElementById("merge-file-petition");
  const oldInput = document.getElementById("merge-file-old-deed");
  const newInput = document.getElementById("merge-file-new-deed");
  const idInput = document.getElementById("merge-file-id");
  const taxInput = document.getElementById("merge-file-tax-decl");
  const singleInput = document.getElementById("merge-file-single");

  if (petInput) petInput.value = "";
  if (oldInput) oldInput.value = "";
  if (newInput) newInput.value = "";
  if (idInput) idInput.value = "";
  if (taxInput) taxInput.value = "";
  if (singleInput) singleInput.value = "";

  const selBox = document.getElementById("single-file-selected-box");
  const nameEl = document.getElementById("single-selected-name");
  const sizeEl = document.getElementById("single-selected-size");
  if (owner.attachedDoc && owner.uploadType === "single" && selBox && nameEl && sizeEl) {
    selBox.style.display = "block";
    nameEl.innerText = `✓ Mevcut Kayıtlı: ${owner.attachedDoc.name || `${owner.oldUnitNo}.B.B.pdf`}`;
    sizeEl.innerText = `Boyut: ${owner.attachedDoc.size ? (owner.attachedDoc.size / 1024).toFixed(0) + ' KB' : 'Hazır'} (Yeni dosya seçilmezse bu korunur)`;
  } else if (selBox) {
    selBox.style.display = "none";
  }

  // Mod seçimi: 5 evrak parçaları kayıtlıysa veya uploadType individual ise mutlaka auto modunu aç
  const hasIndividualDocs = owner.individualDocs && Object.values(owner.individualDocs).some(d => d && d.name);
  if (hasIndividualDocs || owner.uploadType === "individual" || !owner.attachedDoc) {
    switchMergerMode("auto");
  } else {
    switchMergerMode("single");
  }

  const btnMerge = document.getElementById("btn-do-merge");
  if (btnMerge) btnMerge.innerText = `⚡ ${owner.oldUnitNo}.B.B.pdf Sıralı Otomatik Birleştir`;

  const isCustomPet = !!(owner.individualDocs?.petition && !owner.individualDocs.petition.isAutoGenerated);
  const radioAuto = document.querySelector('input[name="petition-source"][value="auto"]');
  const radioCustom = document.querySelector('input[name="petition-source"][value="custom"]');
  if (isCustomPet && radioCustom) {
    radioCustom.checked = true;
    togglePetitionUpload(true);
  } else if (radioAuto) {
    radioAuto.checked = true;
    togglePetitionUpload(false);
  }

  // 5 evrak slotunun kayıtlı durumlarını ekrana bas
  renderMergerSlotStatuses(owner);

  document.getElementById("pdf-merger-modal").style.display = "flex";
}

function renderMergerSlotStatuses(owner) {
  const infoEl = document.getElementById("merger-modal-current-doc-info");
  if (infoEl) {
    if (owner && owner.attachedDoc) {
      infoEl.style.display = "block";
      infoEl.innerHTML = `
        <div style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:10px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:22px;">📄</span>
            <div>
              <div style="font-size:13px; font-weight:800; color:#15803d;">
                Kayıtlı Dosya: ${escapeHtml(owner.attachedDoc.name || `${owner.oldUnitNo}.B.B.pdf`)}
              </div>
              <div style="font-size:11.5px; color:#166534;">
                ${owner.attachedDoc.size ? (owner.attachedDoc.size / 1024).toFixed(0) + ' KB &bull; ' : ''}
                ${owner.individualDocs ? '⚡ 5 Evrak Birleştirilmiş Dosya' : '📁 Tek Dosya Yüklemesi'}
                &bull; Yükleme Tarihi: ${owner.attachedDoc.uploadedAt || '-'}
              </div>
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn-xs-doc" style="background:#0284c7; color:#fff; padding:6px 12px; border-radius:6px; font-weight:700; font-size:12px;" onclick="viewOwnerAttachedDocDirectly('${activeMergerContext?.source || 'contractor'}', ${activeMergerContext?.index})">
              👁️ Mevcut Dosyayı Gör
            </button>
          </div>
        </div>
      `;
    } else {
      infoEl.style.display = "none";
      infoEl.innerHTML = "";
    }
  }

  const ind = owner?.individualDocs || {};

  const renderSlot = (slotId, doc, label, isOptional = false) => {
    const el = document.getElementById(slotId);
    if (!el) return;
    if (doc && doc.name) {
      el.innerHTML = `
        <div style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:8px; padding:8px 12px; margin-top:6px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:12px; font-weight:800; color:#15803d; display:flex; align-items:center; gap:4px;">
              <span>✅</span> <span>Kayıtlı: <strong>${escapeHtml(doc.name)}</strong></span>
            </div>
            <div style="font-size:11px; color:#166534; margin-top:2px;">
              ${doc.size ? (doc.size / 1024).toFixed(0) + ' KB &bull; ' : ''}<span style="color:#047857; font-weight:600;">(Yeni dosya seçilmezse bu korunur)</span>
            </div>
          </div>
          <span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-size:11px; font-weight:800; border:1px solid #86efac;">Hazır</span>
        </div>
      `;
    } else {
      el.innerHTML = `
        <div style="background:#f8fafc; border:1px dashed ${isOptional ? '#cbd5e1' : '#f59e0b'}; border-radius:8px; padding:7px 12px; margin-top:6px;">
          <span style="font-size:11.5px; color:${isOptional ? '#64748b' : '#b45309'}; font-weight:600;">
            ${isOptional ? '⚪ Bu evrak isteğe bağlıdır (varsa seçiniz)' : '⚠️ Henüz dosya seçilmedi (Aşağıdan dosya seçebilirsiniz)'}
          </span>
        </div>
      `;
    }
  };

  renderSlot("slot-status-petition", ind.petition, "Dilekçe");
  renderSlot("slot-status-old-deed", ind.oldDeed, "Eski Tapu");
  renderSlot("slot-status-new-deed", ind.newDeed, "Yeni Tapu");
  renderSlot("slot-status-tax-decl", ind.taxDecl, "Emlak Beyanı", true);
  renderSlot("slot-status-id", ind.idCard, "Kimlik");
}

function handleMergerFileInputChange(slotKey, input) {
  const slotMap = {
    petition: "slot-status-petition",
    oldDeed: "slot-status-old-deed",
    newDeed: "slot-status-new-deed",
    taxDecl: "slot-status-tax-decl",
    id: "slot-status-id"
  };
  const targetId = slotMap[slotKey];
  const el = document.getElementById(targetId);
  if (!el) return;

  if (input.files && input.files[0]) {
    const f = input.files[0];
    el.innerHTML = `
      <div style="background:#eff6ff; border:1.5px solid #3b82f6; border-radius:8px; padding:8px 12px; margin-top:6px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:12.5px; font-weight:800; color:#1d4ed8; display:flex; align-items:center; gap:4px;">
            <span>📎</span> <span>Yeni Seçildi: <strong>${escapeHtml(f.name)}</strong></span>
          </div>
          <div style="font-size:11px; color:#2563eb; margin-top:2px;">
            Boyut: ${(f.size / 1024).toFixed(0)} KB &bull; Tür: ${f.type || 'Belge'} &bull; <strong style="color:#1e40af;">Birleştirmede bu dosya kullanılacak</strong>
          </div>
        </div>
        <span class="badge-status-pill" style="background:#dbeafe; color:#1e40af; font-size:11px; font-weight:800; border:1px solid #93c5fd;">Yeni</span>
      </div>
    `;
  }
}

function closeMergerModal() {
  document.getElementById("pdf-merger-modal").style.display = "none";
}

// Hızlı Evrak Dosyası Seçildiğinde Canlı İsim ve Boyut Göster
function handleSingleFilePreviewChange(input) {
  const box = document.getElementById("single-file-selected-box");
  const nameEl = document.getElementById("single-selected-name");
  const sizeEl = document.getElementById("single-selected-size");
  if (!input.files || input.files.length === 0) {
    if (box) box.style.display = "none";
    return;
  }
  const file = input.files[0];
  if (box && nameEl && sizeEl) {
    box.style.display = "block";
    nameEl.innerText = `✓ Seçilen Dosya: ${file.name}`;
    sizeEl.innerText = `Boyut: ${(file.size / 1024).toFixed(1)} KB • Tür: ${file.type || 'Belge'}`;
  }
}

// TABLODAN DOĞRUDAN 1 TIKLA DOSYA SEÇME VE YÜKLEME
function triggerDirectOwnerFileUpload(index) {
  const fileInput = document.getElementById(`direct-owner-file-${index}`);
  if (fileInput) {
    fileInput.click();
  }
}

async function handleDirectOwnerFileUpload(index, input) {
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];
  const owner = formOwners[index];
  if (!owner) return;

  try {
    let dataUrl = null;
    let fileSize = file.size;
    const isPdf = file.type === "application/pdf" || (file.name && file.name.toLowerCase().endsWith(".pdf"));

    if (!isPdf) {
      try {
        const pLib = await ensurePdfLibLoaded();
        if (pLib) {
          const doc = await pLib.PDFDocument.create();
          await appendFileToPdfDoc(doc, file);
          const pdfBytes = await doc.save();
          const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
          dataUrl = await readFileAsDataUrl(pdfBlob);
          fileSize = pdfBlob.size;
        }
      } catch (convErr) {
        console.warn("Görsel PDF dönüştürme uyarısı:", convErr);
      }
    }

    if (!dataUrl) {
      dataUrl = await readFileAsDataUrl(file);
    }

    const targetApp = getContractorActiveApp();
    const docKey = `doc_${targetApp?.id || 'new'}_${owner.oldUnitNo || index}_${Date.now()}`;
    owner.attachedDoc = {
      name: `${owner.oldUnitNo || (index + 1)}.B.B.pdf`,
      dataUrl: dataUrl,
      docKey: docKey,
      size: fileSize,
      uploadedAt: new Date().toLocaleDateString("tr-TR"),
      uploadType: "single"
    };
    owner.uploadType = "single";
    owner.individualDocs = null;

    // Önbellek ve Veritabanı
    window.YB_DOC_STORE[docKey] = dataUrl;
    try { sessionStorage.setItem(docKey, dataUrl); } catch (ex) { }
    saveDocToDB(docKey, dataUrl);

    // Aktif başvuruya anında bağla ve belediye sistemine ilet
    if (targetApp) {
      if (!targetApp.owners) targetApp.owners = JSON.parse(JSON.stringify(formOwners));
      if (!targetApp.owners[index]) {
        targetApp.owners[index] = JSON.parse(JSON.stringify(owner));
      } else {
        targetApp.owners[index].attachedDoc = JSON.parse(JSON.stringify(owner.attachedDoc));
        targetApp.owners[index].uploadType = "single";
        targetApp.owners[index].individualDocs = null;
      }
      targetApp.lastUpdated = Date.now();
      safeSetLocalStorage("yb_last_submitted_app", sanitizeForStorage(targetApp));
    }

    saveDataToStorage();
    renderContractorOwnersTable();
    try { window.dispatchEvent(new Event("storage")); } catch (ex) { }
    showToast(`✅ ${owner.oldUnitNo || (index + 1)} nolu Bağımsız Bölüm için evrak başarıyla yüklendi: "${owner.attachedDoc.name}"`, "success");
    input.value = "";
  } catch (err) {
    console.error("Doğrudan evrak yükleme hatası:", err);
    showToast("Dosya okunurken bir hata oluştu: " + err.message, "danger");
  }
}

async function removeOwnerAttachedDoc(source, index) {
  const confirmed = await showCustomConfirm({
    title: "Evrak Dosyasını Kaldır",
    message: "Bu daireye ait yüklenen evrak dosyasını silmek istediğinize emin misiniz? Bu işlem sonrasında evrakları tekrar yüklemeniz gerekecektir.",
    confirmText: "🗑️ Evet, Kaldır",
    cancelText: "Vazgeç",
    type: "danger"
  });
  if (!confirmed) return;

  if (source === "contractor") {
    if (formOwners[index]) {
      formOwners[index].attachedDoc = null;
      formOwners[index].individualDocs = null;
    }
    const targetApp = getContractorActiveApp();
    if (targetApp && targetApp.owners && targetApp.owners[index]) {
      targetApp.owners[index].attachedDoc = null;
      targetApp.owners[index].individualDocs = null;
      targetApp.lastUpdated = Date.now();
      safeSetLocalStorage("yb_last_submitted_app", sanitizeForStorage(targetApp));
    }
    saveDataToStorage(true);
    renderContractorOwnersTable();
    showToast("Daire evrak dosyası kaldırıldı.", "info");
  }
}

// DOĞRUDAN EVRAK GÖRÜNTÜLEME & ÖNİZLEME MODALI (MÜTEAHHİT PORTALI)
async function viewOwnerAttachedDocDirectly(source, idxOrAppId, optIdx = null) {
  let owner = null;
  let app = null;
  if (source === "contractor") {
    owner = formOwners[idxOrAppId];
    app = {
      appNo: activeContractorEditingAppId ? (applicationsList.find(a => a.id === activeContractorEditingAppId)?.appNo || "Taslak Dosya") : "Yeni Başvuru",
      cadastre: {
        oldAdaParsel: document.getElementById("b-old-ada-parsel")?.value || ""
      }
    };
  } else {
    app = applicationsList.find(a => a.id === idxOrAppId);
    if (app && app.owners[optIdx]) owner = app.owners[optIdx];
  }

  if (!owner || !owner.attachedDoc) {
    showToast("Görüntülenecek ekli evrak bulunamadı.", "warning");
    return;
  }

  const docKey = owner.attachedDoc.docKey;
  let viewUrl = (docKey && window.YB_DOC_STORE[docKey]) ? window.YB_DOC_STORE[docKey] : owner.attachedDoc.dataUrl;
  if ((!viewUrl || viewUrl === VALID_MINIMAL_PDF) && docKey) {
    try {
      const fromDb = await getDocFromDB(docKey);
      if (fromDb) viewUrl = fromDb;
    } catch (e) { }
  }
  if (!viewUrl) viewUrl = owner.attachedDoc.dataUrl;

  const modal = document.getElementById("document-preview-modal");
  const titleEl = document.getElementById("doc-preview-modal-title");
  const subEl = document.getElementById("doc-preview-modal-sub");
  const bodyEl = document.getElementById("doc-preview-modal-body");
  const dlBtn = document.getElementById("btn-doc-preview-download");

  if (!modal || !titleEl || !bodyEl) return;

  titleEl.innerText = `${owner.oldUnitNo || '-'} Nolu B.B. - Evrak Dosyası (${owner.attachedDoc.name || 'Evrak.pdf'})`;
  if (subEl) {
    subEl.innerText = `Hak Sahibi: ${owner.firstName || ''} ${owner.lastName || 'Malik'} • Dosya: ${app.appNo || '-'} • Boyut: ${(owner.attachedDoc.size ? (owner.attachedDoc.size / 1024).toFixed(1) + ' KB' : 'Bilinmiyor')}`;
  }

  const isPdf = (owner.attachedDoc.name && owner.attachedDoc.name.toLowerCase().endsWith(".pdf")) || (viewUrl && viewUrl.startsWith("data:application/pdf"));

  if (viewUrl && viewUrl !== VALID_MINIMAL_PDF) {
    if (isPdf) {
      let previewBlobUrl = viewUrl;
      if (viewUrl.startsWith("data:")) {
        const b = dataUrlToBlob(viewUrl);
        if (b) previewBlobUrl = URL.createObjectURL(b);
      }

      bodyEl.innerHTML = `
        <div style="text-align:center; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; border:1.5px solid #86efac; border-radius:8px; padding:10px 14px; flex-wrap:wrap; gap:8px;">
          <span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800; font-size:12px;">
            ✓ Birleştirilmiş Resmi Doküman (${escapeHtml(owner.attachedDoc.name || 'Evrak.pdf')})
          </span>
          <div style="display:flex; gap:8px; align-items:center;">
            <a href="${previewBlobUrl}" target="_blank" download="${escapeHtml(owner.attachedDoc.name || 'Evrak.pdf')}" class="btn-xs-doc" style="background:#15803d; color:#fff; text-decoration:none; padding:6px 12px; border-radius:6px; font-weight:700; font-size:12px; display:inline-flex; align-items:center; gap:4px;">
              📥 Dosyayı İndir
            </a>
            <span style="font-size:12px; color:#166534; font-weight:600;">
              Yükleme Tarihi: ${owner.attachedDoc.uploadedAt || new Date().toLocaleDateString("tr-TR")}
            </span>
          </div>
        </div>
        <iframe src="${previewBlobUrl}#toolbar=1" style="width:100%; height:550px; border:1px solid #cbd5e1; border-radius:8px; background:#fff;"></iframe>
      `;
    } else {
      bodyEl.innerHTML = `
        <div style="text-align:center; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:10px 14px;">
          <span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:700;">
            ✓ Yüklenmiş Görsel Belge (${escapeHtml(owner.attachedDoc.name)})
          </span>
          <span style="font-size:12px; color:#166534; font-weight:600;">
            Yükleme Tarihi: ${owner.attachedDoc.uploadedAt || new Date().toLocaleDateString("tr-TR")}
          </span>
        </div>
        <div style="text-align:center; padding:10px;">
          <img src="${viewUrl}" style="max-width:100%; max-height:550px; border:1px solid #cbd5e1; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
        </div>
      `;
    }
  } else {
    bodyEl.innerHTML = `
      <div style="text-align:center; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:10px 14px;">
        <span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:700;">
          ✓ Yüklenmiş Belge Kaydı (${escapeHtml(owner.attachedDoc.name || 'Evrak.pdf')})
        </span>
        <span style="font-size:12px; color:#166534; font-weight:600;">
          Yükleme Tarihi: ${owner.attachedDoc.uploadedAt || new Date().toLocaleDateString("tr-TR")}
        </span>
      </div>
      <div style="padding:28px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; text-align:center;">
        <div style="font-size:38px; margin-bottom:10px;">📄</div>
        <h4 style="margin:0 0 8px 0; color:#1e293b;">${escapeHtml(owner.attachedDoc.name || 'Evrak Dosyası')}</h4>
        <p style="font-size:13px; color:#64748b; margin:0 0 16px 0;">Dosya boyutu: ${(owner.attachedDoc.size ? (owner.attachedDoc.size / 1024).toFixed(1) + ' KB' : 'Bilinmiyor')} &bull; Belge sistemde güvenle saklanmaktadır.</p>
        <button type="button" class="btn-action-sm" onclick="downloadAttachedDoc('${source}', '${idxOrAppId}', ${optIdx})" style="background:#15803d; color:#fff; font-weight:700; padding:8px 18px; border-radius:6px; cursor:pointer;">
          📥 Dosyayı İndir
        </button>
      </div>
    `;
  }

  if (dlBtn) {
    dlBtn.onclick = function () {
      downloadAttachedDoc(source, idxOrAppId, optIdx);
    };
  }

  modal.style.display = "flex";
}

function closeDocumentPreviewModal() {
  const modal = document.getElementById("document-preview-modal");
  if (modal) modal.style.display = "none";
}

function switchMergerMode(mode) {
  const btnAuto = document.getElementById("tab-btn-mode-auto");
  const btnSingle = document.getElementById("tab-btn-mode-single");
  const viewAuto = document.getElementById("merger-mode-auto-view");
  const viewSingle = document.getElementById("merger-mode-single-view");

  if (mode === "auto") {
    if (btnAuto) btnAuto.classList.add("active");
    if (btnSingle) btnSingle.classList.remove("active");
    if (viewAuto) viewAuto.style.display = "block";
    if (viewSingle) viewSingle.style.display = "none";
  } else {
    if (btnSingle) btnSingle.classList.add("active");
    if (btnAuto) btnAuto.classList.remove("active");
    if (viewSingle) viewSingle.style.display = "block";
    if (viewAuto) viewAuto.style.display = "none";
  }
}

function togglePetitionUpload(isCustom) {
  const fileInput = document.getElementById("merge-file-petition");
  if (fileInput) {
    fileInput.style.display = isCustom ? "block" : "none";
  }
}

// SEÇENEK 2: ZATEN BİRLEŞTİRİLMİŞ TEK PDF YÜKLE
async function executeSinglePdfAttach() {
  if (!activeMergerContext) return;
  const { source, owner, appId, index } = activeMergerContext;
  const fileInput = document.getElementById("merge-file-single");
  const file = fileInput.files[0];

  if (!file) {
    showToast("Lütfen birleştirilmiş PDF dosyasını seçiniz.", "warning");
    return;
  }

  const btn = document.getElementById("btn-save-single");
  const origText = btn.innerText;
  btn.innerText = "⏳ Dosya Ekleniyor...";
  btn.disabled = true;

  try {
    let dataUrl = null;
    let fileSize = file.size;
    const isPdf = file.type === "application/pdf" || (file.name && file.name.toLowerCase().endsWith(".pdf"));

    if (!isPdf) {
      try {
        const pLib = await ensurePdfLibLoaded();
        if (pLib) {
          const doc = await pLib.PDFDocument.create();
          await appendFileToPdfDoc(doc, file);
          const pdfBytes = await doc.save();
          const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
          dataUrl = await readFileAsDataUrl(pdfBlob);
          fileSize = pdfBlob.size;
        }
      } catch (convErr) {
        console.warn("Görsel PDF dönüştürme uyarısı:", convErr);
      }
    }

    if (!dataUrl) {
      dataUrl = await readFileAsDataUrl(file);
    }

    const targetApp = getContractorActiveApp();
    const docKey = `doc_${targetApp?.id || 'app'}_${owner.oldUnitNo || index}_${Date.now()}`;
    owner.attachedDoc = {
      name: `${owner.oldUnitNo}.B.B.pdf`,
      dataUrl: dataUrl,
      docKey: docKey,
      size: fileSize,
      uploadedAt: new Date().toLocaleDateString("tr-TR"),
      uploadType: "single"
    };
    owner.uploadType = "single";
    owner.individualDocs = null;

    window.YB_DOC_STORE[docKey] = dataUrl;
    try { sessionStorage.setItem(docKey, dataUrl); } catch (ex) { }
    saveDocToDB(docKey, dataUrl);

    // Aktif başvuruya anında bağla ve belediye sistemine ilet
    if (targetApp) {
      if (!targetApp.owners) targetApp.owners = JSON.parse(JSON.stringify(formOwners));
      if (!targetApp.owners[index]) {
        targetApp.owners[index] = JSON.parse(JSON.stringify(owner));
      } else {
        targetApp.owners[index].attachedDoc = JSON.parse(JSON.stringify(owner.attachedDoc));
        targetApp.owners[index].uploadType = "single";
        targetApp.owners[index].individualDocs = null;
      }
      targetApp.lastUpdated = Date.now();
      safeSetLocalStorage("yb_last_submitted_app", sanitizeForStorage(targetApp));
    }

    if (source === "contractor") {
      renderContractorOwnersTable();
    } else {
      openApplicationDetail(appId);
    }
    saveDataToStorage();
    try { window.dispatchEvent(new Event("storage")); } catch (ex) { }

    showToast(`✅ "${owner.oldUnitNo}.B.B.pdf" birleştirilmiş dosyası başarıyla eklendi!`, "success");
    closeMergerModal();
    btn.innerText = origText;
    btn.disabled = false;
  } catch (err) {
    console.error("Tek PDF ekleme hatası:", err);
    showToast("Dosya eklenirken hata: " + err.message, "danger");
    btn.innerText = origText;
    btn.disabled = false;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Tarayıcıda PDFLib Kütüphanesini Güvenle Yükleme Yardımcısı (Yerel Öncelikli & Çoklu Yedekli)
async function ensurePdfLibLoaded() {
  if (typeof PDFLib !== "undefined") return window.PDFLib;
  if (typeof pdfLib !== "undefined") return window.pdfLib;

  const sources = [
    "pdf-lib.min.js",
    "https://cdn.jsdelivr.net/npm/pdf-lib/dist/pdf-lib.min.js",
    "https://unpkg.com/pdf-lib/dist/pdf-lib.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"
  ];

  for (const src of sources) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject();
        document.head.appendChild(script);
      });
      if (typeof PDFLib !== "undefined") return window.PDFLib;
      if (typeof pdfLib !== "undefined") return window.pdfLib;
    } catch (e) {
      console.warn("PDFLib kaynağı yüklenemedi:", src, e);
    }
  }
  return null;
}

// SEÇENEK 1: 5 EVRAKI TEK TEK YÜKLE VE OTOMATİK SIRALAYARAK BİRLEŞTİR (RESMİ SAYFA 2 SIRASI)
async function executePdfMerge() {
  if (!activeMergerContext) return;
  const { app, owner, source, appId, index } = activeMergerContext;

  const btn = document.getElementById("btn-do-merge");
  const origText = btn.innerText;
  btn.innerText = "⏳ Dosyalar Resmi Sıraya Diziliyor ve Kaydediliyor...";
  btn.disabled = true;

  try {
    const pdfLibInstance = await ensurePdfLibLoaded();
    if (!pdfLibInstance) {
      showToast("PDF kütüphanesi yüklenemedi. Lütfen internet bağlantınızı kontrol edip tekrar deneyiniz.", "danger");
      btn.innerText = origText;
      btn.disabled = false;
      return;
    }
    const existingDocs = owner.individualDocs || {};

    // 1. ADIM: DİLEKÇE (EN ÜSTTE OLACAK - ISLAK İMZALI TARANMIŞ VEYA SİSTEM ŞABLONU)
    const petitionSource = document.querySelector('input[name="petition-source"]:checked')?.value || "auto";
    const customPetitionFile = document.getElementById("merge-file-petition").files[0];
    let petitionDataUrl = null;
    let petitionName = `${owner.oldUnitNo}_EK-1_Dilekcesi.pdf`;
    let petitionSize = 0;
    let isAutoPet = false;

    if (petitionSource === "custom" && customPetitionFile) {
      petitionDataUrl = await readFileAsDataUrl(customPetitionFile);
      petitionName = customPetitionFile.name;
      petitionSize = customPetitionFile.size;
    } else if (petitionSource === "custom" && existingDocs.petition && !existingDocs.petition.isAutoGenerated) {
      petitionDataUrl = existingDocs.petition.dataUrl;
      petitionName = existingDocs.petition.name;
      petitionSize = existingDocs.petition.size;
    } else {
      isAutoPet = true;
      if (pdfLibInstance) {
        try {
          const petDoc = await pdfLibInstance.PDFDocument.create();
          await appendOfficialPetitionPage(petDoc, app, owner);
          const petBytes = await petDoc.save();
          const petBlob = new Blob([petBytes], { type: "application/pdf" });
          petitionDataUrl = await readFileAsDataUrl(petBlob);
          petitionSize = petBlob.size;
        } catch (pe) {
          console.warn("Otomatik dilekçe tekli PDF oluşturma uyarısı:", pe);
        }
      }
    }

    const getResolvedDocData = async (file, existingDoc) => {
      if (file) {
        const dUrl = await readFileAsDataUrl(file);
        return { fileOrDoc: file, dataUrl: dUrl, name: file.name, size: file.size };
      }
      if (!existingDoc) return { fileOrDoc: null, dataUrl: null, name: null, size: 0 };
      let dUrl = existingDoc.dataUrl;
      const dKey = existingDoc.docKey;
      if ((!dUrl || dUrl === VALID_MINIMAL_PDF) && dKey) {
        dUrl = window.YB_DOC_STORE[dKey] || sessionStorage.getItem(dKey);
        if (!dUrl) {
          try { dUrl = await getDocFromDB(dKey); } catch (e) { }
        }
      }
      return {
        fileOrDoc: (dUrl && dUrl !== VALID_MINIMAL_PDF) ? { ...existingDoc, dataUrl: dUrl } : existingDoc,
        dataUrl: (dUrl && dUrl !== VALID_MINIMAL_PDF) ? dUrl : null,
        name: existingDoc.name,
        size: existingDoc.size || 0
      };
    };

    // 2. ADIM: ESKİ BİNAYA AİT TAPU
    const oldDeedFile = document.getElementById("merge-file-old-deed").files[0];
    const resolvedOldDeed = await getResolvedDocData(oldDeedFile, existingDocs.oldDeed);

    // 3. ADIM: YENİ BİNANIN KAT İRTİFAKLI TAPUSU
    const newDeedFile = document.getElementById("merge-file-new-deed").files[0];
    const resolvedNewDeed = await getResolvedDocData(newDeedFile, existingDocs.newDeed);

    // 4. ADIM: EMLAK BEYANI (KAT İRTİFAKLIYSA MUAF, ARSA İSE EKLENİR)
    const taxDeclFile = document.getElementById("merge-file-tax-decl").files[0];
    const resolvedTaxDecl = await getResolvedDocData(taxDeclFile, existingDocs.taxDecl);

    // 5. ADIM: MALİK T.C. KİMLİK FOTOKOPİSİ
    const idFile = document.getElementById("merge-file-id").files[0];
    const resolvedId = await getResolvedDocData(idFile, existingDocs.idCard);

    let mergedDataUrl = null;
    let mergedBlob = null;
    let totalMergedPages = 1;

    // Eğer PDF-Lib çalışır durumdaysa gerçek PDF birleştirmesi yap
    if (pdfLibInstance) {
      try {
        const mergedPdf = await pdfLibInstance.PDFDocument.create();

        // 1. DİLEKÇE SAYFASI
        if (petitionSource === "custom" && (customPetitionFile || (existingDocs.petition && !existingDocs.petition.isAutoGenerated))) {
          const petTarget = customPetitionFile || existingDocs.petition;
          try {
            await appendAnyDocToPdfDoc(mergedPdf, petTarget);
          } catch (petErr) {
            console.warn("Özel dilekçe ekleme uyarısı:", petErr);
            await appendOfficialPetitionPage(mergedPdf, app, owner);
          }
        } else {
          await appendOfficialPetitionPage(mergedPdf, app, owner);
        }

        // 2. ESKİ TAPU SAYFASI
        if (resolvedOldDeed.fileOrDoc) {
          try {
            await appendAnyDocToPdfDoc(mergedPdf, resolvedOldDeed.fileOrDoc);
          } catch (odErr) {
            console.error("Eski tapu PDF'e eklenirken hata:", odErr);
            showToast(`Uyarı: Eski tapu dosyası eklenirken hata oluştu: ` + odErr.message, "warning");
          }
        }

        // 3. YENİ TAPU SAYFASI
        if (resolvedNewDeed.fileOrDoc) {
          try {
            await appendAnyDocToPdfDoc(mergedPdf, resolvedNewDeed.fileOrDoc);
          } catch (ndErr) {
            console.error("Yeni tapu PDF'e eklenirken hata:", ndErr);
            showToast(`Uyarı: Yeni tapu dosyası eklenirken hata oluştu: ` + ndErr.message, "warning");
          }
        }

        // 4. EMLAK BEYANI SAYFASI
        if (resolvedTaxDecl.fileOrDoc) {
          try {
            await appendAnyDocToPdfDoc(mergedPdf, resolvedTaxDecl.fileOrDoc);
          } catch (tdErr) {
            console.error("Emlak beyanı PDF'e eklenirken hata:", tdErr);
          }
        }

        // 5. MALİK KİMLİK SAYFASI
        if (resolvedId.fileOrDoc) {
          try {
            await appendAnyDocToPdfDoc(mergedPdf, resolvedId.fileOrDoc);
          } catch (idErr) {
            console.error("Kimlik dosyası PDF'e eklenirken hata:", idErr);
            showToast(`Uyarı: Kimlik fotokopisi eklenirken hata oluştu: ` + idErr.message, "warning");
          }
        }

        totalMergedPages = mergedPdf.getPageCount();
        const pdfBytes = await mergedPdf.save();
        mergedBlob = new Blob([pdfBytes], { type: "application/pdf" });
        mergedDataUrl = await readFileAsDataUrl(mergedBlob);
      } catch (mergeErr) {
        console.error("Canlı PDF birleştirme genel hatası:", mergeErr);
        showToast("PDF birleştirme sırasında hata: " + mergeErr.message, "danger");
      }
    }

    const targetApp = getContractorActiveApp();
    const appPrefix = targetApp?.id || 'app';
    const unitPrefix = owner.oldUnitNo || index;
    const nowTs = Date.now();

    const saveIndividualDoc = (docType, fileName, size, dataUrl, isAuto = false) => {
      if (!dataUrl) return null;
      const docKey = `doc_${appPrefix}_${unitPrefix}_${docType}_${nowTs}`;
      window.YB_DOC_STORE[docKey] = dataUrl;
      try { sessionStorage.setItem(docKey, dataUrl); } catch (ex) { }
      saveDocToDB(docKey, dataUrl);
      return {
        name: fileName,
        size: size,
        docKey: docKey,
        dataUrl: dataUrl,
        type: docType,
        isAutoGenerated: isAuto,
        uploadedAt: new Date().toLocaleDateString("tr-TR")
      };
    };

    owner.individualDocs = {
      petition: customPetitionFile ? saveIndividualDoc("dilekce", customPetitionFile.name, customPetitionFile.size, petitionDataUrl, false) : (isAutoPet ? saveIndividualDoc("dilekce", petitionName, petitionSize, petitionDataUrl, true) : existingDocs.petition),
      oldDeed: resolvedOldDeed.dataUrl ? saveIndividualDoc("eski_tapu", resolvedOldDeed.name, resolvedOldDeed.size, resolvedOldDeed.dataUrl) : existingDocs.oldDeed,
      newDeed: resolvedNewDeed.dataUrl ? saveIndividualDoc("yeni_tapu", resolvedNewDeed.name, resolvedNewDeed.size, resolvedNewDeed.dataUrl) : existingDocs.newDeed,
      taxDecl: resolvedTaxDecl.dataUrl ? saveIndividualDoc("emlak_beyani", resolvedTaxDecl.name, resolvedTaxDecl.size, resolvedTaxDecl.dataUrl) : existingDocs.taxDecl,
      idCard: resolvedId.dataUrl ? saveIndividualDoc("kimlik", resolvedId.name, resolvedId.size, resolvedId.dataUrl) : existingDocs.idCard
    };
    owner.uploadType = "individual";

    const mergedDocKey = `doc_${appPrefix}_${unitPrefix}_merged_${nowTs}`;
    const fallbackDataUrl = mergedDataUrl || petitionDataUrl || resolvedOldDeed.dataUrl || resolvedNewDeed.dataUrl || resolvedId.dataUrl || resolvedTaxDecl.dataUrl || VALID_MINIMAL_PDF;
    const totalSize = (owner.individualDocs.petition?.size || 0) +
      (owner.individualDocs.oldDeed?.size || 0) +
      (owner.individualDocs.newDeed?.size || 0) +
      (owner.individualDocs.taxDecl?.size || 0) +
      (owner.individualDocs.idCard?.size || 0);

    owner.attachedDoc = {
      name: `${owner.oldUnitNo}.B.B.pdf`,
      dataUrl: fallbackDataUrl,
      docKey: mergedDocKey,
      size: mergedBlob ? mergedBlob.size : totalSize,
      uploadedAt: new Date().toLocaleDateString("tr-TR"),
      uploadType: "individual"
    };

    window.YB_DOC_STORE[mergedDocKey] = fallbackDataUrl;
    try { sessionStorage.setItem(mergedDocKey, fallbackDataUrl); } catch (ex) { }
    saveDocToDB(mergedDocKey, fallbackDataUrl);

    // Aktif başvuruya anında bağla ve belediye sistemine ilet
    if (targetApp) {
      if (!targetApp.owners) targetApp.owners = JSON.parse(JSON.stringify(formOwners));
      if (targetApp.owners[index]) {
        targetApp.owners[index].attachedDoc = JSON.parse(JSON.stringify(owner.attachedDoc));
        targetApp.owners[index].individualDocs = JSON.parse(JSON.stringify(owner.individualDocs));
        targetApp.owners[index].uploadType = "individual";
      } else {
        targetApp.owners.push(JSON.parse(JSON.stringify(owner)));
      }
      targetApp.lastUpdated = Date.now();
      safeSetLocalStorage("yb_last_submitted_app", sanitizeForStorage(targetApp));
    }

    if (source === "contractor") {
      renderContractorOwnersTable();
    } else {
      openApplicationDetail(appId);
    }
    saveDataToStorage();
    try { window.dispatchEvent(new Event("storage")); } catch (ex) { }

    // Otomatik olarak bilgisayara da indir (varsa)
    if (mergedBlob) {
      try {
        const blobUrl = URL.createObjectURL(mergedBlob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `${owner.oldUnitNo}.B.B.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
      } catch (e) { }
    }

    showToast(`🎉 "${owner.oldUnitNo}.B.B.pdf" evrakları (${totalMergedPages} sayfa) başarıyla birleştirildi ve kaydedildi!`, "success");
    closeMergerModal();
  } catch (err) {
    console.error("PDF birleştirme hatası:", err);
    showToast("PDF birleştirilirken bir hata oluştu: " + err.message, "danger");
  } finally {
    btn.innerText = origText;
    btn.disabled = false;
  }
}

// Ekli Evrakı İndirme / Görüntüleme
async function downloadAttachedDoc(source, idxOrAppId, optIdx = null) {
  let owner = null;
  if (source === "contractor") {
    owner = formOwners[idxOrAppId];
  } else {
    const app = applicationsList.find(a => a.id === idxOrAppId);
    if (app && app.owners[optIdx]) owner = app.owners[optIdx];
  }

  if (!owner || !owner.attachedDoc) {
    showToast("Ekli evrak bulunamadı.", "warning");
    return;
  }

  const docKey = owner.attachedDoc.docKey;
  let dlUrl = (docKey && window.YB_DOC_STORE[docKey]) ? window.YB_DOC_STORE[docKey] : owner.attachedDoc.dataUrl;
  if ((!dlUrl || dlUrl === VALID_MINIMAL_PDF) && docKey) {
    try {
      const fromDb = await getDocFromDB(docKey);
      if (fromDb) dlUrl = fromDb;
    } catch (e) { }
  }
  if (!dlUrl) dlUrl = owner.attachedDoc.dataUrl;

  const docName = owner.attachedDoc.name || `${owner.oldUnitNo || '1'}.B.B.pdf`;

  if (dlUrl && dlUrl !== VALID_MINIMAL_PDF && !dlUrl.includes("...")) {
    let blobUrl = null;
    let needsRevoke = false;
    if (dlUrl.startsWith("data:")) {
      const blob = dataUrlToBlob(dlUrl);
      if (blob) {
        blobUrl = URL.createObjectURL(blob);
        needsRevoke = true;
      }
    } else if (dlUrl.startsWith("blob:")) {
      blobUrl = dlUrl;
    }

    if (blobUrl) {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = docName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (needsRevoke) {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
      }
      showToast(`✅ "${docName}" dosyası başarıyla indirildi.`, "success");
      return;
    }
  }

  // Fallback özet dosyası
  const content = `T.C. GÜNGÖREN BELEDİYE BAŞKANLIĞI
Kentsel Dönüşüm Müdürlüğü • Yarısı Bizden Dosya Masası

Evrak: ${docName}
Hak Sahibi: ${owner.firstName || ''} ${owner.lastName || 'Malik'} (T.C: ${owner.tc || '-'})
Bağımsız Bölüm: ${owner.oldUnitNo || '-'} nolu BB
Yükleme Tarihi: ${owner.attachedDoc.uploadedAt || new Date().toLocaleDateString("tr-TR")}
`;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const textUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = textUrl;
  a.download = docName.replace(/\.pdf$/i, ".txt");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(textUrl), 15000);
  showToast(`✅ "${docName}" özeti indirildi.`, "success");
}

function dataUrlToUint8Array(dataUrl) {
  if (!dataUrl) return new Uint8Array(0);
  const commaIdx = dataUrl.indexOf(",");
  const base64 = commaIdx !== -1 ? dataUrl.substring(commaIdx + 1) : dataUrl;
  const binaryStr = atob(base64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

function dataUrlToBlob(dataUrl) {
  if (!dataUrl) return null;
  if (dataUrl instanceof Blob) return dataUrl;
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return null;
  const header = dataUrl.substring(0, commaIdx);
  const base64 = dataUrl.substring(commaIdx + 1);
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "application/pdf";
  const binaryStr = atob(base64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // DİKKAT: data: ve blob: URL'lerine ASLA crossOrigin atanmamalıdır!
    // Chrome ve Edge tarayıcıları data: URI'de crossOrigin="anonymous" görünce CORS hatası verip img.onerror tetikler!
    if (typeof src === "string" && !src.startsWith("data:") && !src.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
    let isSettled = false;
    img.onload = () => {
      if (!isSettled) {
        isSettled = true;
        resolve(img);
      }
    };
    img.onerror = (err) => {
      if (!isSettled) {
        isSettled = true;
        console.error("Görsel yüklenirken hata oluştu:", err);
        reject(new Error("Görsel okunamadı veya bozuk"));
      }
    };
    img.src = src;
    if (img.complete && img.naturalWidth > 0) {
      if (!isSettled) {
        isSettled = true;
        resolve(img);
      }
    }
  });
}

// =========================================================================
// GÖRSEL VE BELGELERİ PDF DOKÜMANINA EKLEME MOTORU (DOĞRUDAN BİNARY & EXIF UYUMLU)
// =========================================================================

// Görseli standart A4 sayfasına orantılı ve yüksek kaliteli şekilde ekler
async function renderImageBytesToPdf(mergedPdf, bytes, name = "", dataUrl = null, originalFileOrDoc = null) {
  let embeddedImg = null;

  // 1. JPEG Tespiti: Magic bytes 0xFF, 0xD8 (veya dosya adı/uzantısı/mime)
  const isJpg = (bytes && bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xD8) ||
    name.endsWith(".jpg") || name.endsWith(".jpeg") || (dataUrl && dataUrl.startsWith("data:image/jpeg"));

  // 2. PNG Tespiti: Magic bytes 0x89, 0x50, 0x4E, 0x47
  const isPng = (bytes && bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) ||
    name.endsWith(".png") || (dataUrl && dataUrl.startsWith("data:image/png"));

  // 3. Doğrudan PDF-Lib Binary Embed:
  // HTML5 Canvas ve URL.createObjectURL KULLANMAZ!
  // Chrome file:/// protokolü altında canvas tainted hatası vermez, sıfır kayıp ve ultra hızlıdır.
  if (isJpg) {
    try {
      embeddedImg = await mergedPdf.embedJpg(bytes);
    } catch (jpgErr) {
      console.warn("PDF-Lib doğrudan embedJpg uyarısı, canvas fallback'e geçiliyor:", jpgErr);
    }
  } else if (isPng) {
    try {
      embeddedImg = await mergedPdf.embedPng(bytes);
    } catch (pngErr) {
      console.warn("PDF-Lib doğrudan embedPng uyarısı, canvas fallback'e geçiliyor:", pngErr);
    }
  }

  // 4. Doğrudan binary embed başarısız olduysa veya dosya WebP / BMP / GIF ise: Güvenli Canvas Dönüştürücüsü
  if (!embeddedImg) {
    let safeDataUrl = dataUrl;
    if (!safeDataUrl) {
      if (originalFileOrDoc instanceof Blob || originalFileOrDoc instanceof File) {
        safeDataUrl = await readFileAsDataUrl(originalFileOrDoc);
      } else {
        const mime = isJpg ? "image/jpeg" : (isPng ? "image/png" : "image/jpeg");
        const blob = new Blob([bytes], { type: mime });
        safeDataUrl = await readFileAsDataUrl(blob);
      }
    }

    const img = await loadImageElement(safeDataUrl);
    const canvas = document.createElement("canvas");
    let width = img.naturalWidth || img.width || 1200;
    let height = img.naturalHeight || img.height || 1600;

    if (width <= 0 || height <= 0) {
      width = 1200;
      height = 1600;
    }

    // A4 için optimize edilmiş çözünürlük sınırı (2400px)
    const maxDim = 2400;
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    try {
      const pngDataUrl = canvas.toDataURL("image/png");
      const pngBytes = dataUrlToUint8Array(pngDataUrl);
      embeddedImg = await mergedPdf.embedPng(pngBytes);
    } catch (cErr) {
      const jpgDataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const jpgBytes = dataUrlToUint8Array(jpgDataUrl);
      embeddedImg = await mergedPdf.embedJpg(jpgBytes);
    }
  }

  if (!embeddedImg) {
    throw new Error("Görsel dosyası işlenemedi ve PDF dokümanına eklenemedi.");
  }

  // 5. Standart A4 Sayfa [595.28, 841.89] (Yatay görsel ise yatay A4 [841.89, 595.28])
  const isLandscape = embeddedImg.width > embeddedImg.height * 1.15;
  const page = mergedPdf.addPage(isLandscape ? [841.89, 595.28] : [595.28, 841.89]);
  const { width: pWidth, height: pHeight } = page.getSize();
  const margin = 20;

  const imgDims = embeddedImg.scaleToFit(pWidth - (margin * 2), pHeight - (margin * 2));
  page.drawImage(embeddedImg, {
    x: (pWidth - imgDims.width) / 2,
    y: (pHeight - imgDims.height) / 2,
    width: imgDims.width,
    height: imgDims.height
  });
}

// Hem File/Blob hem de kayıtlı doc nesnesini ({ name, dataUrl, docKey }) PDF dokümanına ekler
async function appendAnyDocToPdfDoc(mergedPdf, fileOrDoc) {
  if (!fileOrDoc) return;
  const pLib = window.PDFLib || window.pdfLib;
  if (!pLib) throw new Error("PDF kütüphanesi (pdf-lib) yüklenemedi.");

  let bytes = null;
  let name = "";
  let dataUrl = null;

  // 1. File veya Blob nesnesi
  if (fileOrDoc instanceof Blob || fileOrDoc instanceof File) {
    name = (fileOrDoc.name || "").toLowerCase();
    const buffer = await fileOrDoc.arrayBuffer();
    bytes = new Uint8Array(buffer);
  }
  // 2. dataUrl string'i
  else if (typeof fileOrDoc === "string") {
    dataUrl = fileOrDoc;
    bytes = dataUrlToUint8Array(dataUrl);
  }
  // 3. Kayıtlı evrak nesnesi: { name, dataUrl, docKey, size }
  else if (fileOrDoc && typeof fileOrDoc === "object") {
    name = (fileOrDoc.name || "").toLowerCase();
    dataUrl = fileOrDoc.dataUrl;
    const docKey = fileOrDoc.docKey;
    if ((!dataUrl || dataUrl === VALID_MINIMAL_PDF) && docKey) {
      dataUrl = window.YB_DOC_STORE[docKey] || sessionStorage.getItem(docKey);
      if (!dataUrl) {
        try { dataUrl = await getDocFromDB(docKey); } catch (e) { }
      }
    }
    if (dataUrl && dataUrl !== VALID_MINIMAL_PDF) {
      bytes = dataUrlToUint8Array(dataUrl);
    }
  }

  if (!bytes || bytes.length === 0) return;

  // 4.1 PDF Dokümanı İse: Sayfalarını kopyala ve sırayla ekle
  const isPdf = (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) ||
    name.endsWith(".pdf") || (dataUrl && dataUrl.startsWith("data:application/pdf"));
  if (isPdf) {
    const srcPdf = await pLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
    copiedPages.forEach(p => mergedPdf.addPage(p));
    return;
  }

  // 4.2 Görsel İse (JPG, PNG, WebP vb.): A4 sayfaya yerleştir
  await renderImageBytesToPdf(mergedPdf, bytes, name, dataUrl, fileOrDoc);
}

// Geriye dönük uyumluluk yardımcıları
async function renderImageFileToPdf(mergedPdf, fileOrDataUrl) {
  return appendAnyDocToPdfDoc(mergedPdf, fileOrDataUrl);
}

async function appendFileToPdfDoc(mergedPdf, file) {
  return appendAnyDocToPdfDoc(mergedPdf, file);
}

// Dilekçe sayfasını PDF olarak oluştur ve ekle
async function appendOfficialPetitionPage(mergedPdf, app, owner) {
  const page = mergedPdf.addPage([595.28, 841.89]); // A4
  const pLib = window.PDFLib || window.pdfLib;
  const font = await mergedPdf.embedFont(pLib.StandardFonts.HelveticaBold);
  const regularFont = await mergedPdf.embedFont(pLib.StandardFonts.Helvetica);

  // Başlıklar
  page.drawText("EK-1", { x: 520, y: 800, size: 14, font });
  page.drawText("T.C. GUNGOREN BELEDIYE BASKANLIGINA", { x: 140, y: 760, size: 13, font });
  page.drawText("(Kentsel Donusum Mudurlugu)", { x: 210, y: 742, size: 11, font: regularFont });

  // Metin satırları
  const ykn = (app && app.cadastre && app.cadastre.ykn) || "---";
  const parsedCad = parseAdaParsel(app && app.cadastre ? (app.cadastre.oldAdaParsel || app.cadastre.newAdaParsel) : "");
  const ada = parsedCad.ada;
  const parsel = parsedCad.parsel || "---";
  const addr = (app && app.cadastre && app.cadastre.address) ? `${app.cadastre.neighborhood || ''} ${app.cadastre.address}`.trim() : "Gungoren";
  const malikAddr = (owner && owner.ownerAddress && String(owner.ownerAddress).trim()) ? owner.ownerAddress : addr;
  const unitNo = owner.oldUnitNo || "1";
  const fullName = `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || "Malik";
  const tc = owner.tc || "---";
  const dateStr = new Date().toLocaleDateString("tr-TR");

  const adaLine = ada ? `${ykn} yapi kimlik, ${ada} ada, ${parsel} parsel numarali,` : `${ykn} yapi kimlik, ${parsel} parsel numarali,`;

  const lines = [
    adaLine,
    `${malikAddr} adresinde yer alan parselde e-devlet kapisi uzerinden 26.04.2023-02.06.2023`,
    `tarihleri arasinda yapim icin yardim basvurusunda bulunulmus olup, 22.02.2024 tarih ve 8189`,
    `sayili Cumhurbaskani Karari ile kosullari belirlenen yapim icin yardim kapsaminda yukarida`,
    `bilgilerini ve acik adresini belirttigim yapida bulunan ${unitNo} nolu bagimsiz bolum icin`,
    `hibe ve/veya kredi desteginden faydalanmak istiyorum.`,
    ``,
    `Yapim icin yardim basvurumun uygun bulunmasi halinde; tarafimca ve Baskanlikca`,
    `imzalanacak hibe taahhutnamesi ve/veya kredi sozlesmesinde belirtilen tutarin, 22.02.2024`,
    `tarih ve 8189 sayili Cumhurbaskani Kararinda belirtilen kosullar dahilinde aktarilmasi hususunda;`,
    ``,
    `Geregini arz ederim.`
  ];

  let yPos = 690;
  lines.forEach(line => {
    if (line) page.drawText(line, { x: 50, y: yPos, size: 10.5, font: regularFont });
    yPos -= 19;
  });

  // Sağ İmza Bloğu
  page.drawText(`${dateStr}`, { x: 420, y: 450, size: 10, font: regularFont });
  page.drawText(fullName, { x: 420, y: 432, size: 11, font });

  if (owner.hasProxy) {
    page.drawText(`TCKN: ${owner.proxyTc || '---'}`, { x: 420, y: 415, size: 10, font });
    page.drawText(`VK: ${owner.proxyName || '---'}`, { x: 420, y: 398, size: 10, font });
    page.drawText("Imza", { x: 450, y: 365, size: 10, font: regularFont });
  } else {
    page.drawText(`T.C. Kimlik No: ${tc}`, { x: 420, y: 412, size: 10, font: regularFont });
    page.drawText("Imza", { x: 450, y: 375, size: 10, font: regularFont });
  }

  // Sol Alt İletişim & Ekler
  page.drawText("Iletisim Bilgileri", { x: 50, y: 340, size: 10.5, font });
  page.drawText(`Adres   : ${malikAddr}`, { x: 50, y: 320, size: 9.5, font: regularFont });
  page.drawText(`Telefon : ${owner.phone || '---'}`, { x: 50, y: 302, size: 9.5, font: regularFont });

  page.drawText("EKLER:", { x: 50, y: 260, size: 10, font });
  page.drawText("1- Nufus cuzdani fotokopisi", { x: 50, y: 242, size: 9, font: regularFont });
  page.drawText("2- Vekaleten yapilan basvurularda vekaletname asli ve vekilin kimlik fotokopisi", { x: 50, y: 226, size: 9, font: regularFont });
  page.drawText("3- Kat irtifak listesi", { x: 50, y: 210, size: 9, font: regularFont });
}

// =========================================================================
// BİNA GENELİ TOPLU EVRAKLAR (SÖZLEŞMELER VE VEKALETNAMELER - MÜTEAHHİT)
// =========================================================================
function renderBuildingDocsUI() {
  // 1. Toplu Sözleşmeler
  const cBadge = document.getElementById("badge-status-collective-contracts");
  const cUploadBox = document.getElementById("box-upload-collective-contracts");
  const cReadyBox = document.getElementById("box-ready-collective-contracts");
  const cFileName = document.getElementById("file-name-collective-contracts");
  const cFileMeta = document.getElementById("file-meta-collective-contracts");

  if (formBuildingDocs && formBuildingDocs.contracts) {
    const doc = formBuildingDocs.contracts;
    if (cBadge) {
      cBadge.style.background = "#dcfce7";
      cBadge.style.color = "#15803d";
      cBadge.innerText = "✓ Yüklendi";
    }
    if (cUploadBox) cUploadBox.style.display = "none";
    if (cReadyBox) cReadyBox.style.display = "block";
    if (cFileName) cFileName.innerText = doc.name || "Toplu_Sozlesme.pdf";
    if (cFileMeta) {
      const sizeStr = doc.size ? (doc.size > 1024 * 1024 ? (doc.size / (1024 * 1024)).toFixed(2) + " MB" : (doc.size / 1024).toFixed(1) + " KB") : "";
      cFileMeta.innerText = `${sizeStr ? sizeStr + ' • ' : ''}Yüklenme: ${doc.uploadedAt || 'Bugün'}`;
    }
  } else {
    if (cBadge) {
      cBadge.style.background = "#f1f5f9";
      cBadge.style.color = "#475569";
      cBadge.innerText = "Yüklenmedi";
    }
    if (cUploadBox) cUploadBox.style.display = "block";
    if (cReadyBox) cReadyBox.style.display = "none";
  }

  // 2. Toplu Vekaletnameler
  const pBadge = document.getElementById("badge-status-collective-proxies");
  const pUploadBox = document.getElementById("box-upload-collective-proxies");
  const pReadyBox = document.getElementById("box-ready-collective-proxies");
  const pFileName = document.getElementById("file-name-collective-proxies");
  const pFileMeta = document.getElementById("file-meta-collective-proxies");

  if (formBuildingDocs && formBuildingDocs.proxies) {
    const doc = formBuildingDocs.proxies;
    if (pBadge) {
      pBadge.style.background = "#dcfce7";
      pBadge.style.color = "#15803d";
      pBadge.innerText = "✓ Yüklendi";
    }
    if (pUploadBox) pUploadBox.style.display = "none";
    if (pReadyBox) pReadyBox.style.display = "block";
    if (pFileName) pFileName.innerText = doc.name || "Toplu_Vekaletnameler.pdf";
    if (pFileMeta) {
      const sizeStr = doc.size ? (doc.size > 1024 * 1024 ? (doc.size / (1024 * 1024)).toFixed(2) + " MB" : (doc.size / 1024).toFixed(1) + " KB") : "";
      pFileMeta.innerText = `${sizeStr ? sizeStr + ' • ' : ''}Yüklenme: ${doc.uploadedAt || 'Bugün'}`;
    }
  } else {
    if (pBadge) {
      pBadge.style.background = "#f1f5f9";
      pBadge.style.color = "#475569";
      pBadge.innerText = "Yüklenmedi";
    }
    if (pUploadBox) pUploadBox.style.display = "block";
    if (pReadyBox) pReadyBox.style.display = "none";
  }

  // 3. Birleştirilmiş Daire Evrakları Dosyası
  const mUploadBox = document.getElementById("box-upload-merged-units");
  const mReadyBox = document.getElementById("box-ready-merged-units");
  const mFileName = document.getElementById("file-name-merged-units");
  const mFileMeta = document.getElementById("file-meta-merged-units");
  const mergedOuterBox = document.getElementById("contractor-merged-upload-box");

  if (formBuildingDocs && formBuildingDocs.mergedUnitsDoc) {
    const doc = formBuildingDocs.mergedUnitsDoc;
    if (mUploadBox) mUploadBox.style.display = "none";
    if (mReadyBox) mReadyBox.style.display = "block";
    if (mFileName) mFileName.innerText = doc.name || "Birlestirilmis_Daire_Evraklari.pdf";
    if (mFileMeta) {
      const sizeStr = doc.size ? (doc.size > 1024 * 1024 ? (doc.size / (1024 * 1024)).toFixed(2) + " MB" : (doc.size / 1024).toFixed(1) + " KB") : "";
      mFileMeta.innerText = `${sizeStr ? sizeStr + ' • ' : ''}Yüklenme: ${doc.uploadedAt || 'Bugün'}`;
    }
    if (mergedOuterBox) mergedOuterBox.style.display = "block";
  } else {
    if (mUploadBox) mUploadBox.style.display = "block";
    if (mReadyBox) mReadyBox.style.display = "none";
  }
}

// --- MÜTEAHHİT YÜKLEME MODU GEÇİŞİ (BİRLEŞTİRİLMİŞ vs TEK TEK) ---
let currentContractorUploadMode = "individual";

function toggleContractorUploadMode(mode) {
  currentContractorUploadMode = mode;
  const btnMerged = document.getElementById("btn-toggle-merged-upload");
  const btnIndiv = document.getElementById("btn-toggle-individual-upload");
  const mergedBox = document.getElementById("contractor-merged-upload-box");

  if (mode === "merged") {
    if (btnMerged) {
      btnMerged.style.background = "#0f3460";
      btnMerged.style.color = "#ffffff";
      btnMerged.style.borderColor = "#0f3460";
    }
    if (btnIndiv) {
      btnIndiv.style.background = "#f1f5f9";
      btnIndiv.style.color = "#0f2b46";
      btnIndiv.style.borderColor = "#cbd5e1";
    }
    if (mergedBox) mergedBox.style.display = "block";
  } else {
    if (btnIndiv) {
      btnIndiv.style.background = "#0f3460";
      btnIndiv.style.color = "#ffffff";
      btnIndiv.style.borderColor = "#0f3460";
    }
    if (btnMerged) {
      btnMerged.style.background = "#f1f5f9";
      btnMerged.style.color = "#0f2b46";
      btnMerged.style.borderColor = "#cbd5e1";
    }
    if (mergedBox && (!formBuildingDocs || !formBuildingDocs.mergedUnitsDoc)) {
      mergedBox.style.display = "none";
    }
  }
}

function handleMergedUnitsDocUpload(input) {
  handleBuildingDocUpload('mergedUnitsDoc', input);
}

function viewMergedUnitsDoc() {
  viewBuildingDoc('mergedUnitsDoc');
}

function downloadMergedUnitsDoc() {
  downloadBuildingDoc('mergedUnitsDoc');
}

function deleteMergedUnitsDoc() {
  deleteBuildingDoc('mergedUnitsDoc');
}

// --- MÜTEAHHİT TÜM EVRAKLARI GÖRÜNTÜLEME VE OTOMATİK BİRLEŞTİRME MODALI ---
function openContractorAllDocsModal() {
  const modal = document.getElementById("contractor-all-docs-modal");
  const countBadge = document.getElementById("c-all-docs-count-badge");
  const subtitle = document.getElementById("c-all-docs-subtitle");
  const tbody = document.getElementById("c-all-docs-tbody");
  const uploadedCountEl = document.getElementById("c-all-docs-uploaded-count");
  const totalCountEl = document.getElementById("c-all-docs-total-count");

  if (!modal || !tbody) return;

  const totalOwners = (formOwners || []).length;
  let uploadedCount = 0;
  let totalDocsExpected = totalOwners + 2;

  if (formBuildingDocs && formBuildingDocs.contracts) uploadedCount++;
  if (formBuildingDocs && formBuildingDocs.proxies) uploadedCount++;
  if (formBuildingDocs && formBuildingDocs.mergedUnitsDoc) uploadedCount++;

  const ownersWithDoc = (formOwners || []).filter(u => u.attachedDoc && (u.attachedDoc.dataUrl || u.attachedDoc.url)).length;
  uploadedCount += ownersWithDoc;

  if (countBadge) {
    countBadge.innerText = `${uploadedCount} Evrak Yüklendi`;
  }
  if (uploadedCountEl) uploadedCountEl.innerText = uploadedCount;
  if (totalCountEl) totalCountEl.innerText = totalDocsExpected;

  tbody.innerHTML = "";

  // 1. Toplu Sözleşmeler Satırı
  const cDoc = formBuildingDocs && formBuildingDocs.contracts;
  const trC = document.createElement("tr");
  trC.style.background = cDoc ? "#f0fdf4" : "#fff1f2";
  trC.innerHTML = `
    <td style="font-weight:700; text-align:center;"><span class="badge-status-pill" style="background:#e0f2fe; color:#0369a1; font-weight:800;">BİNA</span></td>
    <td><strong>Toplu Yapım / İnşaat Sözleşmeleri</strong></td>
    <td>Bina Geneli</td>
    <td>${cDoc ? '<span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800;">✓ Yüklendi</span>' : '<span class="badge-status-pill" style="background:#fee2e2; color:#b91c1c; font-weight:700;">❌ Yüklenmedi</span>'}</td>
    <td>${cDoc ? `<strong>${escapeHtml(cDoc.name || 'Sozlesme.pdf')}</strong> <small style="color:#166534; display:block;">${cDoc.size ? (cDoc.size / 1024).toFixed(0) + ' KB' : ''}</small>` : '<span style="color:#94a3b8;">Dosya yok</span>'}</td>
    <td class="text-center">
      ${cDoc ? `
        <div style="display:flex; gap:4px; justify-content:center;">
          <button type="button" class="btn-xs-doc" style="background:#0284c7; color:#fff;" onclick="viewBuildingDoc('contracts')">👁️ Gör</button>
          <button type="button" class="btn-xs-doc" style="background:#15803d; color:#fff;" onclick="downloadBuildingDoc('contracts')">📥 İndir</button>
        </div>
      ` : '<span style="font-size:11px; color:#94a3b8;">-</span>'}
    </td>
  `;
  tbody.appendChild(trC);

  // 2. Toplu Vekaletnameler Satırı
  const pDoc = formBuildingDocs && formBuildingDocs.proxies;
  const trP = document.createElement("tr");
  trP.style.background = pDoc ? "#f0fdf4" : "#fff1f2";
  trP.innerHTML = `
    <td style="font-weight:700; text-align:center;"><span class="badge-status-pill" style="background:#e0f2fe; color:#0369a1; font-weight:800;">BİNA</span></td>
    <td><strong>Toplu Noter Onaylı Vekaletnameler</strong></td>
    <td>Bina Geneli</td>
    <td>${pDoc ? '<span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800;">✓ Yüklendi</span>' : '<span class="badge-status-pill" style="background:#fee2e2; color:#b91c1c; font-weight:700;">❌ Yüklenmedi</span>'}</td>
    <td>${pDoc ? `<strong>${escapeHtml(pDoc.name || 'Vekaletnameler.pdf')}</strong> <small style="color:#166534; display:block;">${pDoc.size ? (pDoc.size / 1024).toFixed(0) + ' KB' : ''}</small>` : '<span style="color:#94a3b8;">Dosya yok</span>'}</td>
    <td class="text-center">
      ${pDoc ? `
        <div style="display:flex; gap:4px; justify-content:center;">
          <button type="button" class="btn-xs-doc" style="background:#0284c7; color:#fff;" onclick="viewBuildingDoc('proxies')">👁️ Gör</button>
          <button type="button" class="btn-xs-doc" style="background:#15803d; color:#fff;" onclick="downloadBuildingDoc('proxies')">📥 İndir</button>
        </div>
      ` : '<span style="font-size:11px; color:#94a3b8;">-</span>'}
    </td>
  `;
  tbody.appendChild(trP);

  // 3. Birleştirilmiş Daire Evrakları (Varsa)
  const mDoc = formBuildingDocs && formBuildingDocs.mergedUnitsDoc;
  if (mDoc) {
    const trM = document.createElement("tr");
    trM.style.background = "#f0fdf4";
    trM.innerHTML = `
      <td style="font-weight:700; text-align:center;"><span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800;">TOPLU</span></td>
      <td><strong>Birleştirilmiş Tüm Daireler Dosyası</strong></td>
      <td>Tüm Daireler</td>
      <td><span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800;">✓ Yüklendi</span></td>
      <td><strong>${escapeHtml(mDoc.name || 'Birlestirilmis_Daire_Evraklari.pdf')}</strong> <small style="color:#166534; display:block;">${mDoc.size ? (mDoc.size / 1024).toFixed(0) + ' KB' : ''}</small></td>
      <td class="text-center">
        <div style="display:flex; gap:4px; justify-content:center;">
          <button type="button" class="btn-xs-doc" style="background:#0284c7; color:#fff;" onclick="viewMergedUnitsDoc()">👁️ Gör</button>
          <button type="button" class="btn-xs-doc" style="background:#15803d; color:#fff;" onclick="downloadMergedUnitsDoc()">📥 İndir</button>
        </div>
      </td>
    `;
    tbody.appendChild(trM);
  }

  // 4. Malikler / Bağımsız Bölümler Satırları
  (formOwners || []).forEach((u, idx) => {
    const tr = document.createElement("tr");
    const hasDoc = !!(u.attachedDoc && (u.attachedDoc.dataUrl || u.attachedDoc.url));
    const isCoveredByMerged = !hasDoc && !!mDoc;

    tr.style.background = (hasDoc || isCoveredByMerged) ? "#ffffff" : "#fff1f2";
    tr.innerHTML = `
      <td style="font-weight:700; text-align:center;">${escapeHtml(u.oldUnitNo || idx + 1)}</td>
      <td><strong>${escapeHtml(u.firstName || '')} ${escapeHtml(u.lastName || '')}</strong> <small style="display:block; color:#64748b;">TC: ${escapeHtml(u.tc || '-')}</small></td>
      <td>${escapeHtml(u.floor || '-')}. Kat / ${escapeHtml(u.type || 'Konut')}</td>
      <td>
        ${hasDoc ? '<span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800;">✓ Yüklendi</span>' : (isCoveredByMerged ? '<span class="badge-status-pill" style="background:#ecfdf5; color:#065f46; font-weight:700;">✅ Toplu Dosyada</span>' : '<span class="badge-status-pill" style="background:#fee2e2; color:#b91c1c; font-weight:700;">❌ Yüklenmedi</span>')}
      </td>
      <td>
        ${hasDoc ? `<strong>${escapeHtml(u.attachedDoc.name || `${u.oldUnitNo}.B.B.pdf`)}</strong> <small style="color:#166534; display:block;">${u.attachedDoc.size ? (u.attachedDoc.size / 1024).toFixed(0) + ' KB' : ''}</small>` : (isCoveredByMerged ? '<span style="color:#047857; font-size:11.5px;">Birleşik dosyada mevcut</span>' : '<span style="color:#dc2626; font-size:11.5px;">Ayrı evrak yüklenmedi</span>')}
      </td>
      <td class="text-center">
        ${hasDoc ? `
          <div style="display:flex; gap:4px; justify-content:center;">
            <button type="button" class="btn-xs-doc" style="background:#0284c7; color:#fff;" onclick="viewOwnerAttachedDocDirectly('contractor', ${idx})">👁️ Gör</button>
            <button type="button" class="btn-xs-doc" style="background:#15803d; color:#fff;" onclick="downloadAttachedDoc('contractor', ${idx})">📥 İndir</button>
          </div>
        ` : (isCoveredByMerged ? `
          <button type="button" class="btn-xs-doc" style="background:#0284c7; color:#fff;" onclick="viewMergedUnitsDoc()">👁️ Toplu Dosyayı Gör</button>
        ` : `
          <button type="button" class="btn-xs-doc" style="background:#eff6ff; color:#1e40af; border:1px solid #3b82f6;" onclick="closeContractorAllDocsModal(); triggerDirectOwnerFileUpload(${idx});">📁 Yükle</button>
        `)}
      </td>
    `;
    tbody.appendChild(tr);
  });

  modal.style.display = "flex";
}

function closeContractorAllDocsModal() {
  const modal = document.getElementById("contractor-all-docs-modal");
  if (modal) modal.style.display = "none";
}

function downloadAllContractorDocs() {
  if (formBuildingDocs && formBuildingDocs.mergedUnitsDoc) {
    downloadMergedUnitsDoc();
    return;
  }
  if (formBuildingDocs && formBuildingDocs.contracts) {
    downloadBuildingDoc('contracts');
    return;
  }
  const firstWithDoc = (formOwners || []).find(u => u.attachedDoc);
  if (firstWithDoc) {
    const idx = formOwners.indexOf(firstWithDoc);
    downloadAttachedDoc('contractor', idx);
  } else {
    showToast("İndirilecek herhangi bir evrak henüz yüklenmemiş.", "warning");
  }
}

async function handleBuildingDocUpload(type, input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
  const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(file.name);

  if (!isPdf && !isImage) {
    showToast("Lütfen sadece PDF veya Görsel (JPG, PNG) formatında dosya yükleyiniz.", "warning");
    input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = async function (e) {
    const dataUrl = e.target.result;
    const docKey = `bdoc_${type}_${Date.now()}`;
    const docObj = {
      name: file.name,
      size: file.size,
      type: file.type || (isPdf ? "application/pdf" : "image/jpeg"),
      uploadedAt: new Date().toLocaleDateString("tr-TR") + " " + new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
      docKey: docKey,
      dataUrl: dataUrl
    };

    if (!formBuildingDocs) formBuildingDocs = { contracts: null, proxies: null, mergedUnitsDoc: null };
    formBuildingDocs[type] = docObj;
    window.YB_DOC_STORE[docKey] = dataUrl;
    try { sessionStorage.setItem(docKey, dataUrl); } catch (ex) { }
    saveDocToDB(docKey, dataUrl);

    // Eğer aktif düzenlenen dosya varsa senkronize et
    if (activeContractorEditingAppId) {
      const app = applicationsList.find(a => a.id === activeContractorEditingAppId);
      if (app) {
        if (!app.buildingDocs) app.buildingDocs = { contracts: null, proxies: null, mergedUnitsDoc: null };
        app.buildingDocs[type] = JSON.parse(JSON.stringify(docObj));
        if (type === 'mergedUnitsDoc') app.mergedUnitsDoc = JSON.parse(JSON.stringify(docObj));
        app.lastUpdated = Date.now();
        safeSetLocalStorage("yb_last_submitted_app", sanitizeForStorage(app));
        safeSetLocalStorage("yb_applications_list", sanitizeForStorage(applicationsList));
        saveDataToStorage();
      }
    }

    renderBuildingDocsUI();
    renderContractorOwnersTable();
    autoSaveContractorDraft();
    input.value = "";
    const label = type === 'contracts' ? 'Toplu Yapım / İnşaat Sözleşmesi' : (type === 'proxies' ? 'Toplu Vekaletname' : 'Birleştirilmiş Daire Evrakları Dosyası');
    showToast(`✅ ${label} (${file.name}) başarıyla yüklendi!`, "success");
  };
  reader.readAsDataURL(file);
}

async function deleteBuildingDoc(type) {
  if (!formBuildingDocs || !formBuildingDocs[type]) return;
  const label = type === 'contracts' ? 'Toplu Yapım / İnşaat Sözleşmesi' : (type === 'proxies' ? 'Toplu Vekaletname' : 'Birleştirilmiş Daire Evrakları Dosyası');
  const confirmed = await showCustomConfirm({
    title: "Dosyayı Kaldır",
    message: `"${label}" dosyasını silmek istediğinize emin misiniz?`,
    confirmText: "🗑️ Evet, Sil",
    cancelText: "Vazgeç",
    type: "danger"
  });
  if (!confirmed) return;

  formBuildingDocs[type] = null;
  const inputEl = document.getElementById(type === 'contracts' ? 'input-collective-contracts' : (type === 'proxies' ? 'input-collective-proxies' : 'input-merged-units'));
  if (inputEl) inputEl.value = '';

  renderBuildingDocsUI();
  renderContractorOwnersTable();
  autoSaveContractorDraft();

  if (activeContractorEditingAppId) {
    const app = applicationsList.find(a => a.id === activeContractorEditingAppId);
    if (app) {
      if (!app.buildingDocs) app.buildingDocs = { contracts: null, proxies: null, mergedUnitsDoc: null };
      app.buildingDocs[type] = null;
      if (type === 'mergedUnitsDoc') app.mergedUnitsDoc = null;
      app.lastUpdated = Date.now();
      safeSetLocalStorage("yb_last_submitted_app", sanitizeForStorage(app));
      safeSetLocalStorage("yb_applications_list", sanitizeForStorage(applicationsList));
      saveDataToStorage();
    }
  }
  showToast(`🗑️ ${label} dosyası silindi.`, "info");
}

async function viewBuildingDoc(type) {
  const doc = formBuildingDocs && formBuildingDocs[type];
  if (!doc) {
    showToast("Görüntülenecek dosya bulunamadı.", "warning");
    return;
  }
  const modal = document.getElementById("document-preview-modal");
  const titleEl = document.getElementById("doc-preview-modal-title");
  const subEl = document.getElementById("doc-preview-modal-sub");
  const bodyEl = document.getElementById("doc-preview-modal-body");
  const dlBtn = document.getElementById("btn-doc-preview-download");
  if (!modal || !titleEl || !bodyEl) return;

  const typeName = type === 'contracts' ? 'Toplu Yapım / İnşaat Sözleşmesi' : (type === 'proxies' ? 'Toplu Noter Onaylı Vekaletname' : 'Birleştirilmiş Daire Evrakları Dosyası');
  titleEl.innerText = `🏢 ${typeName} (${doc.name || 'Evrak.pdf'})`;

  let viewUrl = doc.dataUrl;
  if ((!viewUrl || viewUrl === VALID_MINIMAL_PDF) && doc.docKey) {
    viewUrl = window.YB_DOC_STORE[doc.docKey] || sessionStorage.getItem(doc.docKey);
    if (!viewUrl) {
      try {
        const fromDb = await getDocFromDB(doc.docKey);
        if (fromDb) viewUrl = fromDb;
      } catch (e) { }
    }
  }
  if (!viewUrl) viewUrl = doc.dataUrl;

  const sizeStr = doc.size ? (doc.size > 1024 * 1024 ? (doc.size / (1024 * 1024)).toFixed(2) + " MB" : (doc.size / 1024).toFixed(1) + " KB") : "Bilinmiyor";
  if (subEl) {
    subEl.innerText = `Resmi Belge • Boyut: ${sizeStr} • Yükleme: ${doc.uploadedAt || 'Bugün'}`;
  }

  const isPdf = (doc.name && doc.name.toLowerCase().endsWith(".pdf")) || (viewUrl && viewUrl.startsWith("data:application/pdf"));

  if (viewUrl && viewUrl !== VALID_MINIMAL_PDF) {
    if (isPdf) {
      bodyEl.innerHTML = `
        <div style="text-align:center; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:10px 14px;">
          <span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:700;">
            ✓ Yüklenmiş Orijinal Belge (${escapeHtml(doc.name)})
          </span>
          <span style="font-size:12px; color:#166534; font-weight:600;">
            Tarih: ${doc.uploadedAt || new Date().toLocaleDateString("tr-TR")}
          </span>
        </div>
        <iframe src="${viewUrl}" style="width:100%; height:560px; border:1px solid #cbd5e1; border-radius:8px; background:#fff;"></iframe>
      `;
    } else {
      bodyEl.innerHTML = `
        <div style="text-align:center; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:10px 14px;">
          <span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:700;">
            ✓ Yüklenmiş Görsel Belge (${escapeHtml(doc.name)})
          </span>
          <span style="font-size:12px; color:#166534; font-weight:600;">
            Tarih: ${doc.uploadedAt || new Date().toLocaleDateString("tr-TR")}
          </span>
        </div>
        <div style="text-align:center; padding:10px;">
          <img src="${viewUrl}" style="max-width:100%; max-height:560px; border:1px solid #cbd5e1; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
        </div>
      `;
    }
  } else {
    bodyEl.innerHTML = `
      <div style="text-align:center; padding:40px 20px; background:#f8fafc; border-radius:8px;">
        <span style="font-size:42px;">📄</span>
        <h4 style="margin:10px 0 6px 0; color:#0f172a;">${escapeHtml(doc.name)}</h4>
        <p style="color:#64748b; font-size:13px; margin:0 0 16px 0;">Belge boyutu: ${sizeStr}</p>
        <button type="button" class="yb-btn yb-btn-primary" onclick="downloadBuildingDoc('${type}')">📥 Dosyayı İndir</button>
      </div>
    `;
  }

  if (dlBtn) {
    dlBtn.onclick = () => downloadBuildingDoc(type);
  }

  modal.style.display = "flex";
}

async function downloadBuildingDoc(type) {
  const doc = formBuildingDocs && formBuildingDocs[type];
  if (!doc) {
    showToast("İndirilecek dosya bulunamadı.", "warning");
    return;
  }
  let dataUrl = doc.dataUrl;
  if ((!dataUrl || dataUrl === VALID_MINIMAL_PDF) && doc.docKey) {
    dataUrl = window.YB_DOC_STORE[doc.docKey] || sessionStorage.getItem(doc.docKey);
    if (!dataUrl) {
      try {
        const fromDb = await getDocFromDB(doc.docKey);
        if (fromDb) dataUrl = fromDb;
      } catch (e) { }
    }
  }
  if (!dataUrl) dataUrl = doc.dataUrl || VALID_MINIMAL_PDF;

  const defaultNames = {
    contracts: 'Toplu_Yapim_Sozlesmesi.pdf',
    proxies: 'Toplu_Vekaletnameler.pdf',
    mergedUnitsDoc: 'Birlestirilmis_Daire_Evraklari.pdf'
  };

  const fileName = doc.name || defaultNames[type] || 'Evrak.pdf';

  if (dataUrl && dataUrl !== VALID_MINIMAL_PDF) {
    let blobUrl = null;
    let needsRevoke = false;
    if (dataUrl.startsWith("data:")) {
      const blob = dataUrlToBlob(dataUrl);
      if (blob) {
        blobUrl = URL.createObjectURL(blob);
        needsRevoke = true;
      }
    } else if (dataUrl.startsWith("blob:")) {
      blobUrl = dataUrl;
    }

    if (blobUrl) {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (needsRevoke) {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
      }
      showToast(`📥 "${fileName}" indirildi.`, "success");
      return;
    }
  }

  showToast(`⚠️ Dosya içeriği henüz yüklenmemiş veya boş.`, "warning");
}

// =========================================================================
// RESMİ KILAVUZU YAZDIRMA (5 SAYFA EKSİKSİZ VE DOLU DOLU A4 ÇIKTI)
// =========================================================================
function printOfficialGuideModal() {
  let printArea = document.getElementById("print-guide-area");
  if (!printArea) {
    printArea = document.createElement("div");
    printArea.id = "print-guide-area";
    document.body.appendChild(printArea);
  }

  // 5 sekmenin içeriğini resmi bir döküman olarak derle
  const sec0 = document.getElementById("guide-tab-content-0")?.innerHTML || "";
  const sec1 = document.getElementById("guide-tab-content-1")?.innerHTML || "";
  const sec2 = document.getElementById("guide-tab-content-2")?.innerHTML || "";
  const sec3 = document.getElementById("guide-tab-content-3")?.innerHTML || "";
  const sec4 = document.getElementById("guide-tab-content-4")?.innerHTML || "";

  printArea.innerHTML = `
    <div style="font-family: Arial, sans-serif; color: #000; padding: 25px; line-height: 1.5; font-size: 11pt;">
      <div style="text-align: center; border-bottom: 2px solid #0f3460; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 16pt; color: #0f3460; font-weight: 800;">T.C. GÜNGÖREN BELEDİYESİ</h2>
        <h3 style="margin: 4px 0; font-size: 13pt; color: #334155; font-weight: 700;">Kentsel Dönüşüm Müdürlüğü</h3>
        <div style="font-size: 11pt; font-weight: bold; color: #1e40af; margin-top: 4px;">YARISI BİZDEN BAŞVURU & EVRAK KILAVUZU (RESMİ ŞARTNAME)</div>
      </div>

      <div class="guide-print-section" style="margin-bottom: 25px;">
        <h3 style="font-size: 13pt; color: #0f3460; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px;">1. BÖLÜM: GEREKEN EVRAKLAR LİSTESİ (13 MADDE)</h3>
        ${sec0}
      </div>

      <div class="guide-print-section" style="margin-bottom: 25px; page-break-before: always;">
        <h3 style="font-size: 13pt; color: #0f3460; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px;">2. BÖLÜM: VEKALETNAME ŞARTI & NOTER METNİ</h3>
        ${sec1}
      </div>

      <div class="guide-print-section" style="margin-bottom: 25px; page-break-before: always;">
        <h3 style="font-size: 13pt; color: #0f3460; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px;">3. BÖLÜM: DİKKAT EDİLECEK HUSUSLAR & İMZA GÜNLERİ</h3>
        ${sec2}
      </div>

      <div class="guide-print-section" style="margin-bottom: 25px; page-break-before: always;">
        <h3 style="font-size: 13pt; color: #0f3460; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px;">4. BÖLÜM: FLASH BELLEK DİJİTAL AKTARIM SIRALAMASI</h3>
        ${sec3}
      </div>

      <div class="guide-print-section" style="margin-bottom: 25px; page-break-before: always;">
        <h3 style="font-size: 13pt; color: #0f3460; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px;">5. BÖLÜM: ESKİ BİNAYA AİT ŞEMATİK KESİT ÖRNEĞİ</h3>
        ${sec4}
      </div>
    </div>
  `;

  // Yazdır
  setTimeout(() => {
    window.print();
  }, 150);
}

// =========================================================================
// ŞİFRE DEĞİŞTİRME YÖNETİMİ (MÜTEAHHİT & YETKİLİ)
// =========================================================================
function openChangePasswordModal(type = "contractor") {
  const modal = document.getElementById("change-password-modal");
  if (modal) modal.style.display = "flex";
  const pass1 = document.getElementById("cp-new-pass");
  const pass2 = document.getElementById("cp-new-pass-confirm");
  if (pass1) pass1.value = "";
  if (pass2) pass2.value = "";
}

function closeChangePasswordModal() {
  const modal = document.getElementById("change-password-modal");
  if (modal) modal.style.display = "none";
}

function submitChangePassword() {
  const pass1 = document.getElementById("cp-new-pass")?.value || "";
  const pass2 = document.getElementById("cp-new-pass-confirm")?.value || "";

  if (pass1.length < 4) {
    showToast("Yeni şifreniz en az 4 karakter olmalıdır!", "warning");
    return;
  }
  if (pass1 !== pass2) {
    showToast("Girdiğiniz yeni şifreler birbiriyle uyuşmuyor!", "danger");
    return;
  }

  if (activeContractorUser) {
    activeContractorUser.password = pass1;
    const userInList = contractorUsers.find(u => u.id === activeContractorUser.id || u.email === activeContractorUser.email);
    if (userInList) userInList.password = pass1;
    saveDataToStorage();
    closeChangePasswordModal();
    showToast("Tebrikler! Giriş şifreniz başarıyla değiştirildi ve kaydedildi.", "success");
  } else {
    closeChangePasswordModal();
    showToast("Şifreniz güncellendi.", "success");
  }
}

// =========================================================================
// ESKİ BİNA ŞEMATİK KESİT ÇİZİM MODÜLÜ (RESMİ KILAVUZ SAYFA 5)
// =========================================================================
let buildingSchematicConfig = {
  basements: 0,
  groundUnits: 1,
  floors: 0,
  unitsPerFloor: 1,
  units: {}
};

function initSchematicSection() {
  if (formOwners && formOwners.length > 0) {
    syncOwnersToSectionSchematic(true);
  } else {
    resetSchematicToExample(false);
  }
}

function resetSchematicToExample(showNotice = true) {
  buildingSchematicConfig.basements = 1;
  buildingSchematicConfig.groundUnits = 3;
  buildingSchematicConfig.floors = 4;
  buildingSchematicConfig.unitsPerFloor = 2;
  buildingSchematicConfig.units = {
    "B1-0": { unitLabel: "DÜKKAN NO (1)", ownerName: "" },
    "Z-0": { unitLabel: "DÜKKAN NO (2)", ownerName: "" },
    "Z-1": { unitLabel: "DÜKKAN NO (3)", ownerName: "" },
    "Z-2": { unitLabel: "DÜKKAN NO (4)", ownerName: "" },
    "F1-0": { unitLabel: "KONUT NO: 5", ownerName: "" },
    "F1-1": { unitLabel: "KONUT NO: 6", ownerName: "" },
    "F2-0": { unitLabel: "KONUT NO: 7", ownerName: "" },
    "F2-1": { unitLabel: "KONUT NO: 8", ownerName: "" },
    "F3-0": { unitLabel: "KONUT NO: 9", ownerName: "" },
    "F3-1": { unitLabel: "KONUT NO: 10", ownerName: "" },
    "F4-0": { unitLabel: "KONUT NO: 11", ownerName: "" },
    "F4-1": { unitLabel: "KONUT NO: 12", ownerName: "" }
  };

  const selB = document.getElementById("sec-cfg-basement");
  const selG = document.getElementById("sec-cfg-ground");
  const selF = document.getElementById("sec-cfg-floors");
  const selU = document.getElementById("sec-cfg-units-per-floor");
  if (selB) selB.value = "1";
  if (selG) selG.value = "3";
  if (selF) selF.value = "4";
  if (selU) selU.value = "2";

  renderSchematicBuildingSvg();
  if (showNotice) {
    showToast("Resmi Kılavuz Sayfa 5'teki örnek kat şablonu yüklendi.", "info");
  }
}

// Hak Sahipleri Listesindeki Kat ve Birimleri Şematik Kesite Aktarma (SADECE MEVCUT OLANLARI GÖSTERİR)
function syncOwnersToSectionSchematic(isAuto = false) {
  if (!formOwners || formOwners.length === 0) {
    if (!isAuto) showToast("Önce 3. Adımdaki Hak Sahipleri tablosuna kayıt ekleyiniz.", "warning");
    return;
  }

  const isTevhid = currentStructureType === "tevhid";
  const isBlocks = currentStructureType === "blocks";

  // Çoklu blok veya Tevhid parsel sekmelerini yönet
  const blockTabs = document.getElementById("schematic-block-tabs-container");
  if (blockTabs) {
    if (isTevhid && projectActiveParcels.length > 0) {
      if (!projectActiveParcels.includes(activeSchematicBlock)) {
        activeSchematicBlock = activeInputParcel || projectActiveParcels[0];
      }
      blockTabs.style.display = "flex";
      blockTabs.innerHTML = projectActiveParcels.map(p => `
        <button type="button" class="btn-struct-pill ${p === activeSchematicBlock ? 'active' : ''}"
          style="padding: 6px 14px; font-size: 12px; font-weight:700;" onclick="switchSchematicBlock('${escapeHtml(p)}')">
          📍 ${escapeHtml(p)} Parseli Şeması
        </button>
      `).join("");
    } else if (isBlocks && projectActiveBlocks.length > 0) {
      if (!projectActiveBlocks.includes(activeSchematicBlock)) {
        activeSchematicBlock = activeInputBlock || projectActiveBlocks[0];
      }
      blockTabs.style.display = "flex";
      blockTabs.innerHTML = projectActiveBlocks.map(b => `
        <button type="button" class="btn-struct-pill ${b === activeSchematicBlock ? 'active' : ''}"
          style="padding: 6px 14px; font-size: 12px; font-weight:700;" onclick="switchSchematicBlock('${escapeHtml(b)}')">
          🏢 ${escapeHtml(b)} Şematik Kesiti
        </button>
      `).join("");
    } else {
      blockTabs.style.display = "none";
    }
  }

  // Şemaya aktarılacak aktif birimleri belirle
  const curTarget = isTevhid ? (activeSchematicBlock || activeInputParcel || projectActiveParcels[0])
    : (activeSchematicBlock || activeInputBlock || projectActiveBlocks[0]);

  let activeList = [];
  if (isTevhid) {
    activeList = (formOwners || []).filter(o => (o.parcel || projectActiveParcels[0]) === curTarget);
  } else if (isBlocks) {
    activeList = (formOwners || []).filter(o => (o.block || projectActiveBlocks[0]) === curTarget);
  } else {
    activeList = formOwners || [];
  }

  const container = document.getElementById("schematic-section-svg-container");
  if (activeList.length === 0) {
    if (container) {
      container.innerHTML = `
        <div style="background:#f8fafc; border:2px dashed #cbd5e1; border-radius:14px; padding:36px 20px; text-align:center; max-width:580px; margin:20px auto;">
          <span style="font-size:36px; display:block; margin-bottom:8px;">📍</span>
          <h4 style="font-size:16px; font-weight:800; color:#0f172a; margin:0 0 6px;">
            "${escapeHtml(curTarget)}" Parselinde Henüz Hak Sahibi Kaydı Yok
          </h4>
          <p style="font-size:12.5px; color:#64748b; margin:0 0 16px; line-height:1.5;">
            Bu parsele ait yıkılacak binanın maliklerini <strong>3. Adım: Hak Sahipleri &amp; Evrak Yükleme</strong> bölümündeki 
            <strong style="color:#0284c7;">"${escapeHtml(curTarget)} Parseli"</strong> sekmesinden ekleyebilirsiniz.
          </p>
          <button type="button" class="btn-action-sm btn-outline-primary" 
            onclick="switchActiveInputParcel('${escapeHtml(curTarget)}'); document.getElementById('contractor-owners-tbody')?.scrollIntoView({ behavior: 'smooth' });"
            style="font-size:12.5px; padding:8px 18px; font-weight:700;">
            ➕ "${escapeHtml(curTarget)}" Parseline Hak Sahibi Ekle
          </button>
        </div>
      `;
    }
    return;
  }

  // Hak sahiplerini analiz et: Aynı kattaki ve aynı bağımsız bölümdeki (hisseli) malikleri fiziksel tek bir daire kutusunda birleştir
  const aggregatedUnits = [];
  const unitMapByKey = {};

  activeList.forEach((o, oIdx) => {
    const rawFloor = (o.floor || "").toLowerCase().trim();
    const bbNo = String(o.oldUnitNo || (oIdx + 1)).trim();
    const type = o.type || "Konut";
    const name = `${o.firstName || ''} ${o.lastName || ''}`.trim();
    const key = `${rawFloor}___${bbNo}`;

    if (!unitMapByKey[key]) {
      const isShop = type.toLowerCase().includes("dükkan") || type.toLowerCase().includes("ticari");
      unitMapByKey[key] = {
        rawFloor,
        bbNo,
        isShop,
        type,
        names: name ? [name] : [],
        count: 1
      };
      aggregatedUnits.push(unitMapByKey[key]);
    } else {
      unitMapByKey[key].count++;
      if (name && !unitMapByKey[key].names.includes(name)) {
        unitMapByKey[key].names.push(name);
      }
    }
  });

  const basements = [];
  const grounds = [];
  const floorMap = {};

  aggregatedUnits.forEach(u => {
    const isShared = u.names.length > 1 || u.count > 1;
    const nameStr = u.names.join(" & ") || "";
    const label = u.isShop
      ? `DÜKKAN NO (${u.bbNo})${isShared ? ' (Hisseli)' : ''}`
      : `KONUT NO: ${u.bbNo}${isShared ? ' (Hisseli)' : ''}`;

    const item = { bbNo: u.bbNo, label, name: nameStr };

    if (u.rawFloor.includes("bodrum")) {
      let bNum = 1;
      const bMatch = u.rawFloor.match(/\d+/);
      if (bMatch) bNum = parseInt(bMatch[0], 10);
      item.bNum = Math.max(1, Math.min(8, bNum));
      basements.push(item);
    } else if (u.rawFloor.includes("zemin") || u.rawFloor === "0") {
      grounds.push(item);
    } else {
      let floorNum = 1;
      const match = u.rawFloor.match(/\d+/);
      if (match) {
        floorNum = parseInt(match[0], 10);
        if (isNaN(floorNum) || floorNum < 1 || floorNum > 15) {
          floorNum = 1;
        }
      }
      if (!floorMap[floorNum]) floorMap[floorNum] = [];
      floorMap[floorNum].push(item);
    }
  });

  // Konfigürasyonu sadece gerçekten girilen katlar kadar ayarla:
  let bCount = 0;
  if (basements.length > 0) {
    const maxB = Math.max(...basements.map(b => b.bNum || 1));
    bCount = Math.min(8, Math.max(maxB, Math.min(8, basements.length)));
  }
  const gCount = grounds.length > 0 ? Math.min(4, Math.max(1, grounds.length)) : 0;
  const floorKeys = Object.keys(floorMap).map(Number).sort((a, b) => a - b);
  const maxFloor = floorKeys.length > 0 ? Math.min(15, Math.max(...floorKeys)) : 0;

  // Kattaki maksimum birim sayısı
  let maxUnitsInFloor = 1;
  floorKeys.forEach(k => {
    if (floorMap[k].length > maxUnitsInFloor) maxUnitsInFloor = floorMap[k].length;
  });
  if (gCount > maxUnitsInFloor) maxUnitsInFloor = gCount;
  if (maxUnitsInFloor > 4) maxUnitsInFloor = 4;

  let finalBasements = bCount;
  let finalGround = gCount;
  let finalFloors = maxFloor;
  if (finalBasements === 0 && finalGround === 0 && finalFloors === 0) {
    finalGround = 1;
  }

  buildingSchematicConfig.basements = finalBasements;
  buildingSchematicConfig.groundUnits = finalGround;
  buildingSchematicConfig.floors = finalFloors;
  buildingSchematicConfig.unitsPerFloor = maxUnitsInFloor;
  buildingSchematicConfig.units = {};

  // Bodrumları yerleştir (Her bodrum katına ait bağımsız bölümleri B{kat}-{indeks} olarak eşle)
  const basementMap = {};
  basements.forEach((item, idx) => {
    let bFloor = (item.bNum && item.bNum <= finalBasements) ? item.bNum : Math.min(finalBasements, idx + 1);
    if (!basementMap[bFloor]) basementMap[bFloor] = [];
    basementMap[bFloor].push(item);
  });
  for (let b = 1; b <= finalBasements; b++) {
    const list = basementMap[b] || [];
    if (list.length === 0) {
      buildingSchematicConfig.units[`B${b}-0`] = { unitLabel: `BODRUM NO (${b})`, ownerName: "" };
    } else {
      list.forEach((item, idx) => {
        buildingSchematicConfig.units[`B${b}-${idx}`] = { unitLabel: item.label, ownerName: item.name };
      });
    }
  }

  // Zeminleri yerleştir
  grounds.forEach((item, idx) => {
    const key = `Z-${idx}`;
    buildingSchematicConfig.units[key] = { unitLabel: item.label, ownerName: item.name };
  });

  // Normal Katları yerleştir
  for (let f = 1; f <= finalFloors; f++) {
    const list = floorMap[f] || [];
    list.forEach((item, idx) => {
      const key = `F${f}-${idx}`;
      buildingSchematicConfig.units[key] = { unitLabel: item.label, ownerName: item.name };
    });
  }

  // Select inputlarını senkronize et
  const selB = document.getElementById("sec-cfg-basement");
  const selG = document.getElementById("sec-cfg-ground");
  const selF = document.getElementById("sec-cfg-floors");
  const selU = document.getElementById("sec-cfg-units-per-floor");
  if (selB) selB.value = String(finalBasements);
  if (selG) selG.value = String(finalGround);
  if (selF) selF.value = String(finalFloors);
  if (selU) selU.value = String(maxUnitsInFloor);

  renderSchematicBuildingSvg();
  if (!isAuto) {
    showToast("Hak sahipleri listesindeki bağımsız bölümler kat şemasına başarıyla yerleştirildi!", "success");
  }
}

// Birebir Kılavuz Sayfa 5 İzometrik 3D Çatılı Kesit Çizimi (SADECE MEVCUT KATLARI GÖSTERİR)
function renderSchematicBuildingSvg() {
  const container = document.getElementById("schematic-section-svg-container");
  if (!container) return;

  // Formdaki seçimleri al
  const bSel = document.getElementById("sec-cfg-basement");
  const gSel = document.getElementById("sec-cfg-ground");
  const fSel = document.getElementById("sec-cfg-floors");
  const uSel = document.getElementById("sec-cfg-units-per-floor");

  let basements = bSel ? parseInt(bSel.value, 10) : buildingSchematicConfig.basements;
  let groundUnits = gSel ? parseInt(gSel.value, 10) : buildingSchematicConfig.groundUnits;
  let normalFloors = fSel ? parseInt(fSel.value, 10) : buildingSchematicConfig.floors;
  let unitsPerFloor = uSel ? parseInt(uSel.value, 10) : buildingSchematicConfig.unitsPerFloor;

  if (isNaN(basements) || basements < 0) basements = 0;
  if (basements > 8) basements = 8;
  if (isNaN(groundUnits) || groundUnits < 0) groundUnits = 0;
  if (groundUnits > 4) groundUnits = 4;
  if (isNaN(normalFloors) || normalFloors < 0) normalFloors = 0;
  if (normalFloors > 15) normalFloors = 15;
  if (isNaN(unitsPerFloor) || unitsPerFloor < 1) unitsPerFloor = 1;
  if (unitsPerFloor > 4) unitsPerFloor = 4;

  // Eğer hiçbir kat seçili değilse en az 1 Zemin kat göster
  if (basements === 0 && groundUnits === 0 && normalFloors === 0) {
    groundUnits = 1;
  }

  buildingSchematicConfig.basements = basements;
  buildingSchematicConfig.groundUnits = groundUnits;
  buildingSchematicConfig.floors = normalFloors;
  buildingSchematicConfig.unitsPerFloor = unitsPerFloor;

  // Ada / Parsel Bilgisi
  const newAdaParsel = document.getElementById("b-new-ada-parsel")?.value.trim() || "……";
  const oldAdaParsel = document.getElementById("b-old-ada-parsel")?.value.trim() || "……";

  // Geometri Hesaplamaları
  const floorHeight = 62;
  const totalFloorCount = normalFloors + (groundUnits > 0 ? 1 : 0) + basements;
  const effectiveTotalFloors = Math.max(1, totalFloorCount);
  const frontWidth = 420;
  const leftPerspectiveWidth = 145; // Sol yan cephe genişliği
  const startX = 180; // Ön cephenin sol kenarı
  const roofHeight = 110;
  const startY = 50 + roofHeight; // En üst katın üst çizgisi
  const svgTotalHeight = startY + (effectiveTotalFloors * floorHeight) + 90;
  const svgTotalWidth = 660;

  // Perspektif eğim parametreleri
  const skewY = -38; // Sol cephenin yukarı doğru perspektif eğimi

  let svgContent = `
    <svg viewBox="0 0 ${svgTotalWidth} ${svgTotalHeight}" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; font-family:'Inter', Arial, sans-serif;">
      <defs>
        <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#0f172a" flood-opacity="0.08"/>
        </filter>
      </defs>

      <!-- ÇATI (ÜÇGEN BEŞİK ÇATI VE PRİZMA - SADECE EN ÜST MEVCUT KATIN ÜSTÜNDE) -->
      <!-- Sol Yan Çatı Yüzeyi -->
      <polygon points="${startX},${startY} ${startX - leftPerspectiveWidth},${startY + skewY} ${startX - leftPerspectiveWidth + 80},${startY + skewY - roofHeight + 15} ${startX + (frontWidth / 2)},${startY - roofHeight + 15}"
               fill="#f8fafc" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round"/>
      <!-- Ön Üçgen Alınlık -->
      <polygon points="${startX},${startY} ${startX + (frontWidth / 2)},${startY - roofHeight + 15} ${startX + frontWidth},${startY}"
               fill="#eff6ff" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round"/>
      <!-- Çatı Mahyası & Çizgisi -->
      <line x1="${startX + (frontWidth / 2)}" y1="${startY - roofHeight + 15}" x2="${startX + (frontWidth / 2)}" y2="${startY}" stroke="#93c5fd" stroke-width="1.5" stroke-dasharray="3,3"/>
  `;

  let currentY = startY;

  // 1. NORMAL KATLAR (Sadece var olan katlar yukarıdan aşağı çizilir)
  for (let f = normalFloors; f >= 1; f--) {
    const floorKey = `F${f}`;
    const floorLabel = `${f} NO'LU KAT`;

    // Sol Yan Cephe
    svgContent += `
      <polygon points="${startX},${currentY} ${startX - leftPerspectiveWidth},${currentY + skewY} ${startX - leftPerspectiveWidth},${currentY + skewY + floorHeight} ${startX},${currentY + floorHeight}"
               fill="#ffffff" stroke="#2563eb" stroke-width="2"/>
      <text x="${startX - (leftPerspectiveWidth / 2) - 8}" y="${currentY + (floorHeight / 2) + (skewY / 2) + 4}"
            fill="#1e3a8a" font-size="11.5" font-weight="800" text-anchor="middle"
            transform="rotate(-15, ${startX - (leftPerspectiveWidth / 2)}, ${currentY + (floorHeight / 2) + (skewY / 2)})">
        ${floorLabel}
      </text>
    `;

    // Ön Cephe (Daire Bölmeleri)
    const colWidth = frontWidth / unitsPerFloor;
    for (let c = 0; c < unitsPerFloor; c++) {
      const cellId = `${floorKey}-${c}`;
      const cellData = buildingSchematicConfig.units[cellId] || {
        unitLabel: `KONUT NO: ${(f - 1) * unitsPerFloor + c + 1 + (groundUnits > 0 ? groundUnits : 0) + (basements > 0 ? 1 : 0)}`,
        ownerName: ""
      };
      const cellX = startX + (c * colWidth);

      svgContent += `
        <g class="schematic-unit-cell" onclick="openEditUnitCellModal('${cellId}', '${floorLabel}')">
          <rect x="${cellX}" y="${currentY}" width="${colWidth}" height="${floorHeight}"
                fill="#ffffff" stroke="#2563eb" stroke-width="2"/>
          <text x="${cellX + (colWidth / 2)}" y="${currentY + 22}"
                fill="#0f172a" font-size="10.5" font-weight="600" text-anchor="middle">
            ${cellData.ownerName ? cellData.ownerName : '............................'}
          </text>
          <text x="${cellX + (colWidth / 2)}" y="${currentY + 44}"
                fill="#1e40af" font-size="11" font-weight="800" text-anchor="middle">
            ${cellData.unitLabel}
          </text>
        </g>
      `;
    }

    currentY += floorHeight;
  }

  // 2. ZEMİN KAT (Sadece zemin kat birimi varsa çizilir)
  if (groundUnits > 0) {
    const floorLabel = "ZEMİN KAT";
    svgContent += `
      <!-- Sol Yan Zemin -->
      <polygon points="${startX},${currentY} ${startX - leftPerspectiveWidth},${currentY + skewY} ${startX - leftPerspectiveWidth},${currentY + skewY + floorHeight} ${startX},${currentY + floorHeight}"
               fill="#f8fafc" stroke="#2563eb" stroke-width="2"/>
      <text x="${startX - (leftPerspectiveWidth / 2) - 8}" y="${currentY + (floorHeight / 2) + (skewY / 2) + 4}"
            fill="#b45309" font-size="12" font-weight="800" text-anchor="middle"
            transform="rotate(-15, ${startX - (leftPerspectiveWidth / 2)}, ${currentY + (floorHeight / 2) + (skewY / 2)})">
        ${floorLabel}
      </text>
    `;

    const gColWidth = frontWidth / groundUnits;
    for (let c = 0; c < groundUnits; c++) {
      const cellId = `Z-${c}`;
      const defaultNo = c + 1;
      const cellData = buildingSchematicConfig.units[cellId] || {
        unitLabel: `DÜKKAN NO (${defaultNo})`,
        ownerName: ""
      };
      const cellX = startX + (c * gColWidth);

      svgContent += `
        <g class="schematic-unit-cell" onclick="openEditUnitCellModal('${cellId}', '${floorLabel}')">
          <rect x="${cellX}" y="${currentY}" width="${gColWidth}" height="${floorHeight}"
                fill="#fefce8" stroke="#2563eb" stroke-width="2"/>
          <text x="${cellX + (gColWidth / 2)}" y="${currentY + 22}"
                fill="#0f172a" font-size="10" font-weight="600" text-anchor="middle">
            ${cellData.ownerName ? cellData.ownerName : '............................'}
          </text>
          <text x="${cellX + (gColWidth / 2)}" y="${currentY + 44}"
                fill="#854d0e" font-size="11" font-weight="800" text-anchor="middle">
            ${cellData.unitLabel}
          </text>
        </g>
      `;
    }

    currentY += floorHeight;
  }

  // 3. BODRUM KATLAR (Sadece bodrum kat varsa çizilir)
  for (let b = 1; b <= basements; b++) {
    const floorLabel = basements === 1 ? "BODRUM KAT" : `${b}. BODRUM KAT`;
    svgContent += `
      <!-- Sol Yan Bodrum -->
      <polygon points="${startX},${currentY} ${startX - leftPerspectiveWidth},${currentY + skewY} ${startX - leftPerspectiveWidth},${currentY + skewY + floorHeight} ${startX},${currentY + floorHeight}"
               fill="#f1f5f9" stroke="#2563eb" stroke-width="2"/>
      <text x="${startX - (leftPerspectiveWidth / 2) - 8}" y="${currentY + (floorHeight / 2) + (skewY / 2) + 4}"
            fill="#334155" font-size="11.5" font-weight="800" text-anchor="middle"
            transform="rotate(-15, ${startX - (leftPerspectiveWidth / 2)}, ${currentY + (floorHeight / 2) + (skewY / 2)})">
        ${floorLabel}
      </text>
    `;

    // Bodrum katındaki birimleri bul
    const matchingBKeys = Object.keys(buildingSchematicConfig.units)
      .filter(k => k.startsWith(`B${b}-`))
      .sort((a, b) => {
        const ia = parseInt(a.split("-")[1], 10) || 0;
        const ib = parseInt(b.split("-")[1], 10) || 0;
        return ia - ib;
      });
    const bUnitCount = Math.max(1, matchingBKeys.length);
    const bColWidth = frontWidth / bUnitCount;

    for (let c = 0; c < bUnitCount; c++) {
      const cellId = `B${b}-${c}`;
      const cellData = buildingSchematicConfig.units[cellId] || {
        unitLabel: bUnitCount > 1 ? `DÜKKAN/DEPO (${c + 1})` : `DÜKKAN NO (${b})`,
        ownerName: ""
      };
      const cellX = startX + (c * bColWidth);

      svgContent += `
        <g class="schematic-unit-cell" onclick="openEditUnitCellModal('${cellId}', '${floorLabel}')">
          <rect x="${cellX}" y="${currentY}" width="${bColWidth}" height="${floorHeight}"
                fill="#f1f5f9" stroke="#2563eb" stroke-width="2"/>
          <text x="${cellX + (bColWidth / 2)}" y="${currentY + 22}"
                fill="#0f172a" font-size="10.5" font-weight="600" text-anchor="middle">
            ${cellData.ownerName ? cellData.ownerName : (bUnitCount > 1 ? '....................' : '........................................................')}
          </text>
          <text x="${cellX + (bColWidth / 2)}" y="${currentY + 44}"
                fill="#0f172a" font-size="11.5" font-weight="800" text-anchor="middle">
            ${cellData.unitLabel}
          </text>
        </g>
      `;
    }

    currentY += floorHeight;
  }

  // EN ALT RESMİ ALT ÇİZGİ VE ADA / PARSEL BİLGİSİ
  let footerOldText = "";
  if (currentStructureType === "tevhid") {
    const curP = activeSchematicBlock || activeInputParcel || projectActiveParcels[0];
    const parsedCur = parseSingleAdaParsel(curP);
    footerOldText = parsedCur.ada ? `Eski ${parsedCur.ada} Ada / ${parsedCur.parsel} Parsel` : `Eski ${curP} Parseli`;
  } else if (currentStructureType === "blocks") {
    const curB = activeSchematicBlock || activeInputBlock || projectActiveBlocks[0];
    const oldRaw = document.getElementById("b-old-ada-parsel")?.value.trim() || "";
    footerOldText = `${curB} (Eski ${oldRaw ? parseAdaParsel(oldRaw).displayText : 'Bina'})`;
  } else {
    const oldRaw = document.getElementById("b-old-ada-parsel")?.value.trim() || "";
    footerOldText = oldRaw ? `Eski ${parseAdaParsel(oldRaw).displayText}` : "Eski Bina";
  }
  const newRaw = document.getElementById("b-new-ada-parsel")?.value.trim() || "";
  const footerNewText = newRaw ? `Yeni ${parseAdaParsel(newRaw).displayText}` : "Yeni Proje";

  svgContent += `
      <line x1="${startX - leftPerspectiveWidth - 10}" y1="${currentY + 25}" x2="${startX + frontWidth + 20}" y2="${currentY + 25}"
            stroke="#1e3a8a" stroke-width="2"/>
      <text x="${startX + (frontWidth / 2) - 20}" y="${currentY + 48}"
            fill="#0f172a" font-size="12.5" font-weight="800" text-anchor="middle">
        📍 ${footerOldText}  ➜  🏗️ ${footerNewText}
      </text>
    </svg>
  `;

  container.innerHTML = svgContent;
}

// Birim Düzenleme Modalı
function openEditUnitCellModal(cellId, floorName) {
  const modal = document.getElementById("edit-unit-cell-modal");
  if (!modal) return;

  const cellData = buildingSchematicConfig.units[cellId] || { unitLabel: "", ownerName: "" };
  document.getElementById("edit-cell-id").value = cellId;
  document.getElementById("edit-cell-floor").value = floorName;
  document.getElementById("edit-cell-unit-label").value = cellData.unitLabel || "";
  document.getElementById("edit-cell-owner-name").value = cellData.ownerName || "";

  modal.style.display = "flex";
}

function closeEditUnitCellModal() {
  const modal = document.getElementById("edit-unit-cell-modal");
  if (modal) modal.style.display = "none";
}

function saveEditedUnitCell() {
  const cellId = document.getElementById("edit-cell-id")?.value;
  const unitLabel = document.getElementById("edit-cell-unit-label")?.value.trim();
  const ownerName = document.getElementById("edit-cell-owner-name")?.value.trim();

  if (!cellId) return;

  buildingSchematicConfig.units[cellId] = {
    unitLabel: unitLabel || "BİRİM",
    ownerName: ownerName || ""
  };

  closeEditUnitCellModal();
  renderSchematicBuildingSvg();
  showToast("Kat şemasındaki birim bilgisi güncellendi.", "success");
}

// Şematik Kesit Yazdırma / PDF Modalı
function printSchematicSectionModal() {
  const svgContainer = document.getElementById("schematic-section-svg-container");
  const target = document.getElementById("print-schematic-svg-target");
  const modal = document.getElementById("print-schematic-modal");

  if (!svgContainer || !target || !modal) return;

  // SVG içeriğini klonla
  target.innerHTML = svgContainer.innerHTML;
  modal.style.display = "flex";
}

function closePrintSchematicModal() {
  const modal = document.getElementById("print-schematic-modal");
  if (modal) modal.style.display = "none";
}



