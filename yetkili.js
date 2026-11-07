/**
 * ====================================================================
 * GÜNGÖREN BELEDİYESİ - YARISI BİZDEN YETKİLİ / PERSONEL MASASI SİSTEMİ
 * SAYFA: yetkili.html
 * ====================================================================
 */

// --- AKTİF PERSONEL TANIMLARI (DİNAMİK LOCALSTORAGE DESTEKLİ) ---
const DEFAULT_STAFF_LIST = {
  nur: { id: "nur", name: "Hatice Nur Okumuş", role: "Sistem Yöneticisi", avatar: "HN", pin: "123456", isAdmin: true },
  personel1: { id: "personel1", name: "Emrah Gürdamur", role: "İnceleme Personeli 1", avatar: "EG", pin: "123456", isAdmin: false },
  personel2: { id: "personel2", name: "Sabri Gökhan Öztürk", role: "İnceleme Personeli 2", avatar: "SG", pin: "123456", isAdmin: false }
};

let STAFF_LIST = Object.assign({}, DEFAULT_STAFF_LIST);

let currentStaff = null;
let selectedAppId = null;
let activeChatAppId = null;
let activeMergerContext = null;
let activePreviewDocType = null;

// Tüm Başvurular Havuzu ve Müteahhit Listesi
let applicationsList = [];
let contractorUsers = [];

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

// --- KADASTRO & ADA PARSEL PARSER & TARİH FORMATLAYICI ---
function parseAdaParsel(input) {
  if (!input) return { ada: "", parsel: "", displayText: "" };
  let str = String(input).trim();

  // Tevhid: Virgülle ayrılmış 2-3 eski parsel girilmişse
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
  populateStaffLoginDropdown();

  // Oturum kontrolü
  checkStaffAuth();

  // Havuzda hiç başvuru yoksa başlangıç için test verisini tohumla
  if (applicationsList.length === 0) {
    seedInitialApplications();
  }

  // Sekmeler arası canlı senkronizasyon (Müteahhit veya Yetkili sekmesi)
  window.addEventListener("storage", (e) => {
    if (!e.key || e.key === "yb_applications_list" || e.key === "yb_last_submitted_app") {
      loadDataFromStorage();
      if (typeof renderApplicationsPool === "function") renderApplicationsPool();
      if (typeof renderRegisteredContractorsList === "function") renderRegisteredContractorsList();
      if (selectedAppId && typeof openApplicationDetail === "function") {
        openApplicationDetail(selectedAppId);
      }
    }
  });
  window.addEventListener("focus", () => {
    loadDataFromStorage();
    if (typeof renderApplicationsPool === "function") renderApplicationsPool();
    if (typeof renderRegisteredContractorsList === "function") renderRegisteredContractorsList();
    if (selectedAppId && typeof openApplicationDetail === "function") {
      openApplicationDetail(selectedAppId);
    }
  });

  // Canlı senkronizasyon (Hafif ve tarayıcıyı kasmayan periyodik kontrol)
  let lastCheckedTs = localStorage.getItem("yb_last_update_ts") || "0";
  let lastCheckedSubmittedLen = (localStorage.getItem("yb_last_submitted_app") || "").length;

  setInterval(() => {
    const curTs = localStorage.getItem("yb_last_update_ts") || "0";
    const curSubmittedLen = (localStorage.getItem("yb_last_submitted_app") || "").length;

    if (curTs !== lastCheckedTs || curSubmittedLen !== lastCheckedSubmittedLen) {
      lastCheckedTs = curTs;
      lastCheckedSubmittedLen = curSubmittedLen;
      loadDataFromStorage();
      if (typeof renderApplicationsPool === "function") renderApplicationsPool();
      if (typeof renderRegisteredContractorsList === "function") renderRegisteredContractorsList();
      if (selectedAppId && typeof openApplicationDetail === "function") {
        openApplicationDetail(selectedAppId);
      }
    }
  }, 2500);
});

function populateStaffLoginDropdown() {
  const select = document.getElementById("select-staff-user");
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = "";

  Object.values(STAFF_LIST).forEach(staff => {
    const opt = document.createElement("option");
    opt.value = staff.id;
    opt.innerText = `👤 ${staff.name} (${staff.role})`;
    select.appendChild(opt);
  });

  if (currentVal && STAFF_LIST[currentVal]) {
    select.value = currentVal;
  }
}

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
  } catch (e) {}
  try {
    const db = await openDocDB();
    if (!db) return;
    const tx = db.transaction(YB_STORE_NAME, "readwrite");
    const store = tx.objectStore(YB_STORE_NAME);
    store.put({ id: docKey, dataUrl: dataUrl, timestamp: Date.now() });
  } catch (e) {}
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
  } catch (e) {}
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
  } catch (e) {}
}
try { preloadDocsFromDB(); } catch (e) {}

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
          try { sessionStorage.setItem(docKey, o.attachedDoc.dataUrl); } catch (e) {}
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
              try { sessionStorage.setItem(docKey, doc.dataUrl); } catch (e) {}
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
            try { sessionStorage.setItem(docKey, doc.dataUrl); } catch (e) {}
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
        } catch (e2) {}
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
        } catch(e) {}
      }
      localStorage.setItem(key, valStr);
    } catch (secondError) {
      console.warn(`Second quota failure for "${key}". Purging temporary items...`, secondError);
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

try { cleanupStorageQuota(); } catch (e) {}

// --- LOCAL STORAGE YÖNETİMİ & SİLİNENLER KARA LİSTESİ ---
function getDeletedAppIds() {
  try {
    return JSON.parse(localStorage.getItem("yb_deleted_app_ids") || "[]");
  } catch (e) {
    return [];
  }
}

function markAppAsDeleted(appId, appNo) {
  try {
    const deleted = getDeletedAppIds();
    if (appId && !deleted.includes(appId)) deleted.push(appId);
    if (appNo && !deleted.includes(appNo)) deleted.push(appNo);
    safeSetLocalStorage("yb_deleted_app_ids", deleted);
  } catch (e) {}
}

function saveDataToStorage() {
  try {
    const deletedIds = getDeletedAppIds();

    // Silinmiş dosyaların hafızada kalmasını önle
    applicationsList = applicationsList.filter(a => !deletedIds.includes(a.id) && !deletedIds.includes(a.appNo));

    // Havuzu kaydederken diğer sekmelerden eklenen veya güncellenen başvuruları koru
    const rawApps = localStorage.getItem("yb_applications_list");
    if (rawApps) {
      try {
        const storedApps = JSON.parse(rawApps);
        storedApps.forEach(stored => {
          if (deletedIds.includes(stored.id) || deletedIds.includes(stored.appNo)) {
            return;
          }
          const idx = applicationsList.findIndex(a => a.id === stored.id || a.appNo === stored.appNo);
          if (idx !== -1) {
            if (applicationsList[idx].status === "onaylandi") {
              stored.status = "onaylandi";
              return;
            }
            const storedTime = stored.lastUpdated || (stored.isRevised ? 1 : 0);
            const memTime = applicationsList[idx].lastUpdated || 0;
            if (storedTime > memTime) {
              applicationsList[idx] = stored;
            }
          } else {
            applicationsList.push(stored);
          }
        });
      } catch (e) {}
    }

    safeSetLocalStorage("yb_applications_list", sanitizeForStorage(applicationsList));
    lastCheckedAppsHash = localStorage.getItem("yb_applications_list") || "";
    safeSetLocalStorage("yb_contractor_users", contractorUsers);
    safeSetLocalStorage("yb_staff_list_custom", STAFF_LIST);
    if (currentStaff) {
      safeSetLocalStorage("yb_active_staff_id", currentStaff.id);
    } else {
      localStorage.removeItem("yb_active_staff_id");
    }
  } catch (e) {
    console.error("Yetkili kaydetme hatası:", e);
    try {
      cleanupStorageQuota();
      safeSetLocalStorage("yb_applications_list", sanitizeForStorage(applicationsList));
    } catch(err2) {}
  }
}

function loadDataFromStorage() {
  try {
    const deletedIds = getDeletedAppIds();
    const rawApps = localStorage.getItem("yb_applications_list");
    const rawUsers = localStorage.getItem("yb_contractor_users");
    const rawStaffList = localStorage.getItem("yb_staff_list_custom");
    const activeStaffId = localStorage.getItem("yb_active_staff_id");

    if (rawStaffList) {
      try {
        STAFF_LIST = JSON.parse(rawStaffList);
      } catch (err) {
        STAFF_LIST = Object.assign({}, DEFAULT_STAFF_LIST);
      }
    }

    if (rawApps) {
      const parsedApps = JSON.parse(rawApps);
      applicationsList = parsedApps.filter(a => !deletedIds.includes(a.id) && !deletedIds.includes(a.appNo));
      // Önbellekten belge URL'lerini geri bağla
      applicationsList.forEach(app => {
        if (app && app.owners && Array.isArray(app.owners)) {
          app.owners.forEach((o, idx) => {
            if (o.attachedDoc) {
              const key = o.attachedDoc.docKey || `doc_${app.id}_${o.oldUnitNo || idx}`;
              if (window.YB_DOC_STORE && window.YB_DOC_STORE[key]) {
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

    // Müteahhidin son gönderdiği dosya yedeği varsa havuzda güncelle veya ekle (silinmemişse!)
    const rawLastSubmitted = localStorage.getItem("yb_last_submitted_app");
    if (rawLastSubmitted) {
      try {
        const lastApp = JSON.parse(rawLastSubmitted);
        if (lastApp && (deletedIds.includes(lastApp.id) || deletedIds.includes(lastApp.appNo))) {
          localStorage.removeItem("yb_last_submitted_app");
        } else if (lastApp && lastApp.id) {
          const existingIdx = applicationsList.findIndex(a => a.id === lastApp.id || a.appNo === lastApp.appNo);
          if (existingIdx !== -1) {
            // Eğer dosya yetkili tarafından onaylandıysa, eski lastApp bunu geri çevirmesin!
            if (applicationsList[existingIdx].status === "onaylandi") {
              lastApp.status = "onaylandi";
              try { safeSetLocalStorage("yb_last_submitted_app", sanitizeForStorage(lastApp)); } catch(e){}
              return;
            }
            const storedTime = lastApp.lastUpdated || (lastApp.isRevised ? 1 : 0);
            const memTime = applicationsList[existingIdx].lastUpdated || 0;
            if (storedTime > memTime) {
              applicationsList[existingIdx] = lastApp;
            }
          } else {
            applicationsList.unshift(lastApp);
          }
        }
      } catch (err) {}
    }

    // 1965 Parsel Başvuru Dosyası Kurtarma / Doğrulama Garantisi (GB-2026-7841)
    // SADECE kullanıcı veya yetkili tarafından silinmediyse ilk kurulumda oluştur!
    const is1965Deleted = deletedIds.includes("app_1965_submitted") || deletedIds.includes("GB-2026-7841");
    const has1965 = applicationsList.some(a => 
      (a.cadastre && (
        String(a.cadastre.oldAdaParsel || '').includes("1965") ||
        String(a.cadastre.parsel || '').includes("1965") ||
        String(a.cadastre.newAdaParsel || '').includes("1965")
      )) || a.appNo === "GB-2026-7841"
    );

    if (!has1965 && !is1965Deleted) {
      const app1965 = {
        id: "app_1965_submitted",
        appNo: "GB-2026-7841",
        submissionDate: new Date().toLocaleDateString("tr-TR"),
        status: "havuzda",
        isSubmitted: true,
        claimedBy: null,
        submittedByEmail: "ornek@insaat.com",
        messages: [],
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
          oldAdaParsel: "1965",
          newAdaParsel: "1965",
          ada: "",
          parsel: "1965",
          adaParselFormatted: "1965 Parsel",
          address: "Haznedar Mah. 1965 Parsel Güngören / İSTANBUL",
          oldM2: 850,
          newM2: 1200,
          shelterM2: 60,
          parkingM2: 90
        },
        owners: [
          {
            id: "o1",
            oldUnitNo: "1",
            floor: "Bodrum",
            type: "Ticari (Dükkan)",
            tc: "29481029384",
            phone: "5321112233",
            firstName: "Ahmet",
            lastName: "Yılmaz",
            birthDate: "14.05.1970",
            ownerAddress: "Haznedar Mah. 1965 Parsel Dükkan:1",
            shareNum: 1,
            shareDenom: 1,
            hasProxy: false,
            appointmentDate: "2026-11-03",
            appointmentDay: "Salı",
            attachedDoc: {
              name: "1.B.B.pdf",
              dataUrl: "data:application/pdf;base64,JVBERi0xLjQKJcTl8uXprKWVo...",
              uploadedAt: new Date().toLocaleDateString("tr-TR"),
              size: 245600
            }
          },
          {
            id: "o2",
            oldUnitNo: "2",
            floor: "Zemin",
            type: "Konut (Daire)",
            tc: "38592019485",
            phone: "5332223344",
            firstName: "Mehmet",
            lastName: "Kaya",
            birthDate: "20.10.1974",
            ownerAddress: "Haznedar Mah. 1965 Parsel Daire:2",
            shareNum: 1,
            shareDenom: 1,
            hasProxy: true,
            proxyName: "Mustafa Güven",
            proxyTc: "10293847562",
            attachedDoc: {
              name: "2.B.B.pdf",
              dataUrl: "data:application/pdf;base64,JVBERi0xLjQKJcTl8uXprKWVo...",
              uploadedAt: new Date().toLocaleDateString("tr-TR"),
              size: 198400
            }
          },
          {
            id: "o3",
            oldUnitNo: "3",
            floor: "1.Kat",
            type: "Konut (Daire)",
            tc: "47693028596",
            phone: "5353334455",
            firstName: "Ayşe",
            lastName: "Demir",
            birthDate: "05.03.1978",
            ownerAddress: "Haznedar Mah. 1965 Parsel Daire:3",
            shareNum: 1,
            shareDenom: 1,
            hasProxy: false,
            appointmentDate: "2026-11-05",
            appointmentDay: "Perşembe",
            attachedDoc: {
              name: "3.B.B.pdf",
              dataUrl: "data:application/pdf;base64,JVBERi0xLjQKJcTl8uXprKWVo...",
              uploadedAt: new Date().toLocaleDateString("tr-TR"),
              size: 312500
            }
          }
        ]
      };
      applicationsList.unshift(app1965);
      safeSetLocalStorage("yb_applications_list", sanitizeForStorage(applicationsList));
    }

    // Başlangıç tohumlama: Sistemde kayıtlı müteahhit yoksa örnek firmaları yükle
    if (!contractorUsers || contractorUsers.length === 0) {
      contractorUsers = [
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
      safeSetLocalStorage("yb_contractor_users", contractorUsers);
    }

    if (activeStaffId && STAFF_LIST[activeStaffId]) {
      currentStaff = STAFF_LIST[activeStaffId];
    }
  } catch (e) {
    console.error("Yetkili yükleme hatası:", e);
  }
}

// --- PERSONEL OTURUM YÖNETİMİ ---
function checkStaffAuth() {
  const loginSection = document.getElementById("staff-login-section");
  const dashboardSection = document.getElementById("staff-dashboard-section");
  const headerAuthInfo = document.getElementById("staff-header-auth-info");
  const adminTabBtn = document.getElementById("btn-staff-subtab-admin");

  if (currentStaff) {
    if (loginSection) loginSection.style.display = "none";
    if (dashboardSection) dashboardSection.style.display = "block";
    if (headerAuthInfo) headerAuthInfo.style.display = "flex";

    // Sistem Yöneticisi sekmesi sadece Hatice Nur Okumuş (isAdmin: true) için açılır
    if (adminTabBtn) {
      adminTabBtn.style.display = currentStaff.isAdmin ? "inline-flex" : "none";
    }

    updateStaffUI();
    renderApplicationsPool();
    renderRegisteredContractorsList();
    if (currentStaff.isAdmin) {
      renderAdminManagementView();
    }
  } else {
    if (loginSection) loginSection.style.display = "block";
    if (dashboardSection) dashboardSection.style.display = "none";
    if (headerAuthInfo) headerAuthInfo.style.display = "none";
    if (adminTabBtn) adminTabBtn.style.display = "none";
  }
}

function handleStaffLoginSubmit(e) {
  if (e) e.preventDefault();
  const staffSelect = document.getElementById("select-staff-user");
  const passInput = document.getElementById("staff-login-password");

  const staffId = staffSelect ? staffSelect.value : "nur";
  const password = passInput ? passInput.value.trim() : "";

  // Bu personelin önceden değiştirdiği bir şifresi var mı?
  const customPwd = localStorage.getItem("yb_staff_pwd_" + staffId);

  let isPasswordValid = false;
  if (customPwd) {
    isPasswordValid = (password === customPwd);
  } else {
    const staffObj = STAFF_LIST[staffId];
    const defaultPin = staffObj ? staffObj.pin : "123456";
    isPasswordValid = (password === defaultPin || password === "123456" || password === "123" || password === "gungoren");
  }

  if (!isPasswordValid) {
    showToast("Hatalı şifre girdiniz! (Giriş için varsayılan şifreniz: 123456'dır)", "danger");
    return;
  }

  currentStaff = STAFF_LIST[staffId] || STAFF_LIST.nur;
  saveDataToStorage();
  checkStaffAuth();
  showToast(`Hoş geldiniz Sn. ${currentStaff.name}. Yetkili masası hazırlandı.`, "success");
}

function openStaffChangePasswordModal() {
  const modal = document.getElementById("staff-change-password-modal");
  if (modal) modal.style.display = "flex";
  const pass1 = document.getElementById("scp-new-pass");
  const pass2 = document.getElementById("scp-new-pass-confirm");
  if (pass1) pass1.value = "";
  if (pass2) pass2.value = "";
}

function closeStaffChangePasswordModal() {
  const modal = document.getElementById("staff-change-password-modal");
  if (modal) modal.style.display = "none";
}

function submitStaffChangePassword() {
  const pass1 = document.getElementById("scp-new-pass")?.value || "";
  const pass2 = document.getElementById("scp-new-pass-confirm")?.value || "";

  if (!currentStaff) {
    showToast("Aktif oturum bulunamadı!", "danger");
    return;
  }
  if (pass1.length < 3) {
    showToast("Yeni şifreniz en az 3 karakter olmalıdır!", "warning");
    return;
  }
  if (pass1 !== pass2) {
    showToast("Girdiğiniz yeni şifreler birbiriyle uyuşmuyor!", "danger");
    return;
  }

  localStorage.setItem("yb_staff_pwd_" + currentStaff.id, pass1);
  closeStaffChangePasswordModal();
  showToast(`Sn. ${currentStaff.name}, giriş şifreniz başarıyla kaydedildi! Bir sonraki girişinizde bu şifrenizi kullanabilirsiniz.`, "success");
}

function handleStaffLogout() {
  if (!confirm("Yetkili masasından çıkış yapmak istediğinize emin misiniz?")) return;
  currentStaff = null;
  saveDataToStorage();
  checkStaffAuth();
  showToast("Yetkili oturumu güvenle kapatıldı.", "info");
}

function changeActiveStaff(staffId) {
  if (STAFF_LIST[staffId]) {
    currentStaff = STAFF_LIST[staffId];
    saveDataToStorage();
    updateStaffUI();
    showToast(`Aktif masa "${currentStaff.name}" olarak değiştirildi.`, "info");
  }
}

function updateStaffUI() {
  if (!currentStaff) return;
  const avatar = document.getElementById("active-staff-avatar");
  const name = document.getElementById("active-staff-name");
  const topName = document.getElementById("top-staff-name");
  const topRole = document.getElementById("top-staff-role");
  const select = document.getElementById("staff-select");

  if (avatar) avatar.innerText = currentStaff.avatar;
  if (name) name.innerText = `${currentStaff.name} (${currentStaff.role})`;
  if (topName) topName.innerText = currentStaff.name;
  if (topRole) topRole.innerText = currentStaff.role;
  if (select) select.value = currentStaff.id;
}

// --- PERSONEL ALT SEKMELERİ (HAVUZ vs KAYITLI MÜTEAHHİTLER vs SİSTEM YÖNETİMİ) ---
function switchStaffSubTab(tab) {
  const btnPool = document.getElementById("btn-staff-subtab-pool");
  const btnContractors = document.getElementById("btn-staff-subtab-contractors");
  const btnAdmin = document.getElementById("btn-staff-subtab-admin");
  const secPool = document.getElementById("staff-section-pool");
  const secContractors = document.getElementById("staff-section-contractors");
  const secAdmin = document.getElementById("staff-section-admin");

  if (btnPool) btnPool.classList.toggle("active", tab === "pool");
  if (btnContractors) btnContractors.classList.toggle("active", tab === "contractors");
  if (btnAdmin) btnAdmin.classList.toggle("active", tab === "admin");

  if (secPool) secPool.style.display = (tab === "pool") ? "block" : "none";
  if (secContractors) secContractors.style.display = (tab === "contractors") ? "block" : "none";
  if (secAdmin) secAdmin.style.display = (tab === "admin") ? "block" : "none";

  if (tab === "pool") renderApplicationsPool();
  if (tab === "contractors") renderRegisteredContractorsList();
  if (tab === "admin") renderAdminManagementView();
}

// =========================================================================
// SİSTEM YÖNETİCİSİ PANELİ (PERSONEL & MÜTEAHHİT SİLME / EKLEME)
// =========================================================================
function renderAdminManagementView() {
  renderAdminStaffTable();
  renderAdminQuickContractorsList();
  renderAdminQuickApplicationsList();
}

function renderAdminStaffTable() {
  const tbody = document.getElementById("admin-staff-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  Object.values(STAFF_LIST).forEach(staff => {
    const tr = document.createElement("tr");
    const isMainAdmin = (staff.id === "nur");

    tr.innerHTML = `
      <td>
        <div class="staff-avatar" style="width:36px; height:36px; font-size:12px; background:${isMainAdmin ? '#1e3a8a' : '#0284c7'}; color:#fff; display:flex; align-items:center; justify-content:center; border-radius:50%; font-weight:800;">
          ${escapeHtml(staff.avatar || staff.id.substring(0,2).toUpperCase())}
        </div>
      </td>
      <td>
        <strong>${escapeHtml(staff.name)}</strong>
        ${isMainAdmin ? '<span class="badge-status-pill" style="background:#fee2e2; color:#b91c1c; font-size:10px; margin-left:6px;">Ana Yönetici</span>' : ''}
      </td>
      <td>${escapeHtml(staff.role)}</td>
      <td class="font-mono">${escapeHtml(staff.id)}</td>
      <td class="text-center">
        <span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-size:11px;">Aktif</span>
      </td>
      <td class="text-center">
        <div style="display:flex; justify-content:center; gap:6px;">
          <button type="button" class="btn-action-sm btn-outline-warning" style="font-size:11px; padding:3px 8px;" onclick="resetStaffPassword('${staff.id}')">
            🔑 Şifre Sıfırla
          </button>
          ${!isMainAdmin ? `
            <button type="button" class="btn-action-sm btn-outline-danger" style="font-size:11px; padding:3px 8px; background:#fef2f2; color:#dc2626; border-color:#fca5a5;" onclick="deleteStaffUser('${staff.id}')">
              🗑️ Sil
            </button>
          ` : `
            <span style="font-size:11px; color:#94a3b8; padding:3px 8px;">(Korumalı)</span>
          `}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAdminQuickContractorsList() {
  const container = document.getElementById("admin-contractors-quick-list");
  if (!container) return;
  container.innerHTML = "";

  if (contractorUsers.length === 0) {
    container.innerHTML = '<div style="font-size:12px; color:#94a3b8; padding:8px;">Kayıtlı müteahhit firma bulunmuyor.</div>';
    return;
  }

  contractorUsers.forEach(u => {
    const item = document.createElement("div");
    item.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px;";
    item.innerHTML = `
      <div>
        <strong style="font-size:12.5px; color:#0f172a; display:block;">${escapeHtml(u.companyName)}</strong>
        <span style="font-size:11px; color:#64748b;">${escapeHtml(u.repName)} &bull; ${escapeHtml(u.email)}</span>
      </div>
      <button type="button" class="btn-action-sm" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-size:11.5px; padding:4px 8px; font-weight:700;" onclick="adminDeleteContractor('${u.id}', '${escapeHtml(u.companyName)}')">
        🗑️ Firmayı Sil
      </button>
    `;
    container.appendChild(item);
  });
}

function renderAdminQuickApplicationsList() {
  const container = document.getElementById("admin-applications-quick-list");
  if (!container) return;
  container.innerHTML = "";

  if (applicationsList.length === 0) {
    container.innerHTML = '<div style="font-size:12px; color:#94a3b8; padding:8px;">Havuzda dosya bulunmuyor.</div>';
    return;
  }

  applicationsList.forEach(a => {
    const item = document.createElement("div");
    item.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px;";
    item.innerHTML = `
      <div>
        <strong style="font-size:12.5px; color:#0f172a; display:block;">${escapeHtml(a.appNo)} - ${escapeHtml(a.cadastre.oldAdaParsel || '')}</strong>
        <span style="font-size:11px; color:#64748b;">${escapeHtml(a.company.name)} (${a.owners ? a.owners.length : 0} Malik)</span>
      </div>
      <button type="button" class="btn-action-sm" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-size:11.5px; padding:4px 8px; font-weight:700;" onclick="adminDeleteApplication('${a.id}', '${escapeHtml(a.appNo)}')">
        🗑️ Dosyayı Sil
      </button>
    `;
    container.appendChild(item);
  });
}

// Personel Ekleme / Silme
function openAddStaffModal() {
  const modal = document.getElementById("add-staff-modal");
  if (modal) {
    modal.style.display = "flex";
    document.getElementById("new-staff-name").value = "";
    document.getElementById("new-staff-role").value = "İnceleme Personeli";
    document.getElementById("new-staff-id").value = "personel" + (Object.keys(STAFF_LIST).length + 1);
    document.getElementById("new-staff-pass").value = "123456";
  }
}

function closeAddStaffModal() {
  const modal = document.getElementById("add-staff-modal");
  if (modal) modal.style.display = "none";
}

function submitAddNewStaff() {
  const name = document.getElementById("new-staff-name")?.value.trim();
  const role = document.getElementById("new-staff-role")?.value.trim();
  let id = document.getElementById("new-staff-id")?.value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const pass = document.getElementById("new-staff-pass")?.value.trim() || "123456";

  if (!name || !id) {
    showToast("Lütfen ad soyad ve personel ID alanlarını doldurunuz.", "warning");
    return;
  }

  if (STAFF_LIST[id]) {
    showToast("Bu kullanıcı ID koduyla zaten bir personel mevcut!", "warning");
    return;
  }

  const initials = name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();

  STAFF_LIST[id] = {
    id: id,
    name: name,
    role: role || "İnceleme Personeli",
    avatar: initials,
    pin: pass,
    isAdmin: false
  };

  localStorage.setItem("yb_staff_pwd_" + id, pass);
  saveDataToStorage();
  populateStaffLoginDropdown();
  renderAdminStaffTable();
  closeAddStaffModal();
  showToast(`Sn. ${name} başarıyla sisteme yeni personel olarak eklendi!`, "success");
}

function deleteStaffUser(staffId) {
  if (staffId === "nur") {
    showToast("Sistem Yöneticisi hesabı silinemez!", "danger");
    return;
  }
  const staff = STAFF_LIST[staffId];
  if (!staff) return;

  if (!confirm(`"${staff.name}" personel hesabını sistemden silmek istediğinize emin misiniz?`)) return;

  delete STAFF_LIST[staffId];
  saveDataToStorage();
  populateStaffLoginDropdown();
  renderAdminStaffTable();
  showToast(`"${staff.name}" personeli başarıyla silindi.`, "info");
}

function resetStaffPassword(staffId) {
  const staff = STAFF_LIST[staffId];
  if (!staff) return;
  if (!confirm(`"${staff.name}" personelinin şifresini "123456" olarak sıfırlamak istediğinize emin misiniz?`)) return;

  localStorage.setItem("yb_staff_pwd_" + staffId, "123456");
  showToast(`"${staff.name}" şifresi "123456" olarak sıfırlandı.`, "success");
}

function adminDeleteContractor(userId, companyName) {
  if (!confirm(`"${companyName}" firmasını ve ilişkili tüm başvuru dosyalarını sistemden kalıcı olarak silmek istediğinize emin misiniz?`)) return;

  const user = contractorUsers.find(u => u.id === userId);
  contractorUsers = contractorUsers.filter(u => u.id !== userId);

  if (user && user.email) {
    applicationsList = applicationsList.filter(a => a.submittedByEmail !== user.email);
  }

  saveDataToStorage();
  renderAdminManagementView();
  renderApplicationsPool();
  renderRegisteredContractorsList();
  showToast(`"${companyName}" firması ve ilişkili başvuruları silindi.`, "info");
}

function adminDeleteApplication(appId, appNo) {
  const app = applicationsList.find(a => a.id === appId || a.appNo === appNo);
  const targetNo = appNo || (app ? app.appNo : appId);
  const targetId = appId || (app ? app.id : "");

  if (!confirm(`"${targetNo}" nolu başvuru dosyasını sistemden ve havuzdan kalıcı olarak silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz.`)) {
    return;
  }

  // 1. Silinenler kara listesine kaydet
  markAppAsDeleted(targetId, targetNo);

  // 2. Bellek listesinden sil
  applicationsList = applicationsList.filter(a => a.id !== targetId && a.appNo !== targetNo);

  // 3. localStorage yb_applications_list doğrudan temizle
  try {
    const rawApps = localStorage.getItem("yb_applications_list");
    if (rawApps) {
      const parsedApps = JSON.parse(rawApps);
      const filtered = parsedApps.filter(a => a.id !== targetId && a.appNo !== targetNo);
      safeSetLocalStorage("yb_applications_list", sanitizeForStorage(filtered));
      lastCheckedAppsHash = localStorage.getItem("yb_applications_list") || "";
    }
  } catch (e) {}

  // 4. localStorage yb_last_submitted_app temizle
  try {
    const rawLast = localStorage.getItem("yb_last_submitted_app");
    if (rawLast) {
      const lastApp = JSON.parse(rawLast);
      if (lastApp && (lastApp.id === targetId || lastApp.appNo === targetNo)) {
        localStorage.removeItem("yb_last_submitted_app");
      }
    }
  } catch (e) {}

  // 5. Aktif düzenlenen başvuru ID'sini temizle
  try {
    if (localStorage.getItem("yb_active_editing_app_id") === targetId) {
      localStorage.removeItem("yb_active_editing_app_id");
    }
  } catch (e) {}

  // 6. Detay masası açıksa ve bu dosya görüntüleniyorsa kapat
  if (selectedAppId === targetId || (app && selectedAppId === app.id)) {
    closeDetailView();
  }

  // 7. Depolama ve arayüz güncelle
  saveDataToStorage();
  renderApplicationsPool();
  renderAdminQuickApplicationsList();
  renderRegisteredContractorsList();

  // 8. Diğer pencerelere bildir
  try {
    window.dispatchEvent(new Event("storage"));
  } catch (e) {}

  showToast(`"${targetNo}" başvuru dosyası kalıcı olarak silindi.`, "info");
}

function deleteCurrentApplication() {
  if (!selectedAppId) {
    showToast("Silinecek dosya seçilmedi.", "warning");
    return;
  }
  const app = applicationsList.find(a => a.id === selectedAppId);
  if (app) {
    adminDeleteApplication(app.id, app.appNo);
  }
}

// =========================================================================
// RESMİ DOKÜMAN VE EVRAK CANLI GÖRÜNTÜLEYİCİ (YETKİLİ İNCELEME)
// =========================================================================
function openOfficialDocViewer(docType) {
  if (!activeMergerContext || !activeMergerContext.owner) {
    showToast("Lütfen bir bağımsız bölüm seçiniz.", "warning");
    return;
  }
  const { owner, app, index } = activeMergerContext;

  // 1. Öncelik: Müteahhit evrakları tek tek yüklediyse doğrudan o evrakı aç
  let matchedKey = null;
  if (docType.includes("Eski Tapu")) matchedKey = "oldDeed";
  else if (docType.includes("Yeni Tapu")) matchedKey = "newDeed";
  else if (docType.includes("Kimlik")) matchedKey = "idCard";
  else if (docType.includes("Emlak")) matchedKey = "taxDecl";
  else if (docType.includes("Dilekçe")) matchedKey = "petition";

  if (matchedKey && owner.individualDocs && owner.individualDocs[matchedKey]) {
    viewIndividualDoc(app.id, index, matchedKey);
    return;
  }

  activePreviewDocType = docType;

  const modal = document.getElementById("document-preview-modal");
  const titleEl = document.getElementById("doc-preview-modal-title");
  const subEl = document.getElementById("doc-preview-modal-sub");
  const bodyEl = document.getElementById("doc-preview-modal-body");

  if (!modal || !titleEl || !bodyEl) return;

  titleEl.innerText = `${owner.oldUnitNo} Nolu B.B. - ${docType} İnceleme`;
  if (subEl) {
    subEl.innerText = `Hak Sahibi: ${owner.firstName} ${owner.lastName} (T.C: ${owner.tc}) &bull; Dosya: ${app.appNo}`;
  }

  // 2. Durum: Müteahhit birleştirilmiş toplu dosya yüklemiş mi?
  let realFileUrl = null;
  const docKey = owner.attachedDoc ? owner.attachedDoc.docKey : null;
  if (docKey && window.YB_DOC_STORE && window.YB_DOC_STORE[docKey]) {
    realFileUrl = window.YB_DOC_STORE[docKey];
  } else if (owner.attachedDoc && owner.attachedDoc.dataUrl) {
    realFileUrl = owner.attachedDoc.dataUrl;
  }

  if (realFileUrl && realFileUrl !== VALID_MINIMAL_PDF) {
    const isPdf = (owner.attachedDoc?.name && owner.attachedDoc.name.toLowerCase().endsWith(".pdf")) || realFileUrl.startsWith("data:application/pdf");
    bodyEl.innerHTML = `
      <div style="text-align:center; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:10px 14px;">
        <span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:700;">
          ✓ Müteahhidin Yüklediği Orijinal Birleştirilmiş Belge (${escapeHtml(owner.attachedDoc?.name || `${owner.oldUnitNo}.B.B.pdf`)})
        </span>
        <button type="button" class="btn-action-sm btn-primary-sm" onclick="downloadAttachedDoc('staff', '${app.id}', ${index})" style="background:#15803d; color:#fff; font-weight:700;">
          📥 Dosyayı İndir
        </button>
      </div>
      ${isPdf ? `<iframe src="${realFileUrl}" style="width:100%; height:500px; border:1px solid #cbd5e1; border-radius:8px; background:#fff;"></iframe>` : `<div style="text-align:center; padding:10px;"><img src="${realFileUrl}" style="max-width:100%; max-height:500px; border:1px solid #cbd5e1; border-radius:8px;"></div>`}
    `;
  } else {
    // 3. Durum: Henüz dosya yüklenmediyse resmi formatta derlenmiş kayıt belgesi sunulur
    bodyEl.innerHTML = buildSimulatedOfficialDocumentHtml(docType, owner, app);
  }

  modal.style.display = "flex";
}

function closeDocumentPreviewModal() {
  const modal = document.getElementById("document-preview-modal");
  if (modal) modal.style.display = "none";
}

function flagCurrentDocRevision() {
  if (!activeMergerContext || !activeMergerContext.owner) return;
  const { owner } = activeMergerContext;
  const docName = activePreviewDocType || "Evrak";

  closeDocumentPreviewModal();
  closeMergerModal();
  openRevisionChatModal();

  const inputEl = document.getElementById("chat-modal-input-text");
  if (inputEl) {
    inputEl.value = `${owner.oldUnitNo} nolu Bağımsız Bölüm (${owner.firstName} ${owner.lastName}) için sunulan "${docName}" belgesinde eksik/uyumsuzluk görüldü. Lütfen resmi şartnameye uygun taranmış belgesini yükleyiniz.`;
    inputEl.focus();
  }
}

function approveCurrentDoc() {
  const docName = activePreviewDocType || "Evrak";
  closeDocumentPreviewModal();
  showToast(`✓ "${docName}" belgesi incelendi ve uygun olarak onaylandı.`, "success");
}

function buildSimulatedOfficialDocumentHtml(docType, owner, app) {
  const dateStr = new Date().toLocaleDateString("tr-TR");

  return `
    <div style="background:#ffffff; border:2px solid #0f172a; padding:30px; border-radius:8px; max-width:680px; margin:0 auto; font-family:'Plus Jakarta Sans', Arial, sans-serif; color:#0f172a; box-shadow:0 4px 14px rgba(0,0,0,0.06);">
      <!-- Üst Antet -->
      <div style="text-align:center; border-bottom:2px solid #0f172a; padding-bottom:12px; margin-bottom:18px;">
        <div style="font-size:26px;">🏛️</div>
        <h3 style="font-size:14.5px; font-weight:900; margin:4px 0 0; text-transform:uppercase; letter-spacing:0.5px;">
          T.C. GÜNGÖREN BELEDİYE BAŞKANLIĞI
        </h3>
        <h4 style="font-size:13px; font-weight:800; margin:2px 0 0; color:#1e40af; text-transform:uppercase;">
          KENTSEL DÖNÜŞÜM MÜDÜRLÜĞÜ &bull; RESMİ BELGE İNCELEME FÖYÜ
        </h4>
        <div style="font-size:11px; color:#64748b; margin-top:2px;">
          Evrak Türü: <strong>${escapeHtml(docType)}</strong> &bull; Tarih: ${dateStr}
        </div>
      </div>

      <!-- Bilgi Tablosu -->
      <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:18px;">
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px; font-weight:700; width:35%; background:#f8fafc;">Başvuru Dosya No:</td>
          <td style="padding:6px; font-family:monospace; font-weight:700; color:#1e40af;">${escapeHtml(app.appNo)}</td>
        </tr>
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px; font-weight:700; background:#f8fafc;">Yapı Kimlik No (YKN):</td>
          <td style="padding:6px; font-family:monospace;">${escapeHtml(app.cadastre.ykn || '-')}</td>
        </tr>
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px; font-weight:700; background:#f8fafc;">Ada / Parsel Bilgisi:</td>
          <td style="padding:6px; font-weight:700;">${escapeHtml(app.cadastre.newAdaParsel || app.cadastre.oldAdaParsel || '-')} (Eski ${escapeHtml(app.cadastre.oldAdaParsel || '-')})</td>
        </tr>
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px; font-weight:700; background:#f8fafc;">Açık Adres:</td>
          <td style="padding:6px;">${escapeHtml(app.cadastre.address || '-')}</td>
        </tr>
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px; font-weight:700; background:#f8fafc;">Hak Sahibi Malik:</td>
          <td style="padding:6px; font-weight:800; font-size:13px; color:#0f172a;">${escapeHtml(owner.firstName)} ${escapeHtml(owner.lastName)}</td>
        </tr>
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px; font-weight:700; background:#f8fafc;">T.C. Kimlik No:</td>
          <td style="padding:6px; font-family:monospace; font-weight:700;">${escapeHtml(owner.tc || '-')}</td>
        </tr>
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px; font-weight:700; background:#f8fafc;">Bağımsız Bölüm &amp; Kat:</td>
          <td style="padding:6px;">${escapeHtml(owner.oldUnitNo)} nolu Bağımsız Bölüm (${escapeHtml(owner.floor)} - ${escapeHtml(owner.type)})</td>
        </tr>
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px; font-weight:700; background:#f8fafc;">Hisse Oranı:</td>
          <td style="padding:6px; font-weight:700; color:#1e40af;">${owner.shareNum || 1} / ${owner.shareDenom || 1}</td>
        </tr>
        <tr>
          <td style="padding:6px; font-weight:700; background:#f8fafc;">Vekalet / Temsil Durumu:</td>
          <td style="padding:6px;">
            ${owner.hasProxy ? `
              <span style="color:#059669; font-weight:700;">✓ Noter Vekaletnamesi Mevcut (TCKN: ${owner.proxyTc || '-'}, Vekil: ${owner.proxyName || '-'})</span>
            ` : `
              <span style="color:#d97706; font-weight:700;">⚠️ Noter Vekaleti Yok (Salı veya Perşembe günleri bizzat belediyeye gelip imza atacak)</span>
            `}
          </td>
        </tr>
      </table>

      <!-- Onay & Denetim Şerhi -->
      <div style="background:#f1f5f9; border-left:4px solid #1e40af; padding:12px; font-size:11.5px; line-height:1.55; margin-bottom:16px;">
        <strong>📌 İnceleme Şerhi:</strong> Bu belge, Yarısı Bizden Kampanyası kapsamında 6306 sayılı Kanun ve 22.02.2024 tarihli Cumhurbaşkanı Kararı uyarınca sisteme iletilen resmi kayıtlarla tam eşleşmektedir.
      </div>

      <!-- Mühür ve İnceleyen Personel İmzası -->
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:20px; padding-top:14px; border-top:1px dashed #cbd5e1;">
        <div style="text-align:center; border:2px dashed #94a3b8; border-radius:50%; width:90px; height:90px; display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:9.5px; color:#475569;">
          <span>🏛️ GÜNGÖREN</span>
          <span>BELEDİYESİ</span>
          <span style="font-weight:700;">RESMİ ONAY</span>
        </div>
        <div style="text-align:center; min-width:180px;">
          <div style="font-size:11px; color:#64748b;">İnceleyen Yetkili Personel</div>
          <div style="font-weight:800; font-size:12.5px; color:#0f172a; margin-top:4px;">${currentStaff ? currentStaff.name : 'Yetkili Personel'}</div>
          <div style="font-size:11px; color:#1e40af;">${currentStaff ? currentStaff.role : 'Kentsel Dönüşüm Müdürlüğü'}</div>
          <div style="margin-top:10px; font-style:italic; font-size:11px; color:#94a3b8;">[Elektronik Paraf &amp; Onay]</div>
        </div>
      </div>
    </div>
  `;
}

// =========================================================================
// BAŞVURU HAVUZU CANLI ARAMA, FİLTRELEME & GÖRÜNÜM YÖNETİMİ
// =========================================================================
let staffSearchQuery = "";
let staffStatusFilter = "all";
let staffDeskFilter = "all";
let staffPoolViewMode = "cards"; // "cards" veya "table"

function setPoolViewMode(mode) {
  staffPoolViewMode = mode;
  const cardsContainer = document.getElementById("pool-list-container");
  const tableContainer = document.getElementById("pool-table-view-container");
  const btnCards = document.getElementById("btn-view-cards");
  const btnTable = document.getElementById("btn-view-table");

  if (mode === "cards") {
    if (cardsContainer) cardsContainer.style.display = "grid";
    if (tableContainer) tableContainer.style.display = "none";
    if (btnCards) {
      btnCards.style.background = "#0f3460";
      btnCards.style.color = "#fff";
      btnCards.style.fontWeight = "700";
    }
    if (btnTable) {
      btnTable.style.background = "#fff";
      btnTable.style.color = "#475569";
      btnTable.style.fontWeight = "600";
    }
  } else {
    if (cardsContainer) cardsContainer.style.display = "none";
    if (tableContainer) tableContainer.style.display = "block";
    if (btnCards) {
      btnCards.style.background = "#fff";
      btnCards.style.color = "#475569";
      btnCards.style.fontWeight = "600";
    }
    if (btnTable) {
      btnTable.style.background = "#0f3460";
      btnTable.style.color = "#fff";
      btnTable.style.fontWeight = "700";
    }
  }
  renderApplicationsPool();
}

function handleStaffSearchFilter(val) {
  if (typeof val === "string") {
    staffSearchQuery = val;
  } else {
    const input = document.getElementById("staff-search-input");
    if (input) staffSearchQuery = input.value;
  }

  const statusSelect = document.getElementById("staff-status-filter");
  if (statusSelect) staffStatusFilter = statusSelect.value;

  const deskSelect = document.getElementById("staff-desk-filter");
  if (deskSelect) staffDeskFilter = deskSelect.value;

  // Hızlı butonların aktiflik durumunu senkronize et
  document.querySelectorAll(".qf-btn").forEach(btn => {
    if (btn.getAttribute("data-status") === staffStatusFilter) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  const clearBtn = document.getElementById("staff-search-clear-btn");
  if (clearBtn) {
    clearBtn.style.display = staffSearchQuery.trim().length > 0 ? "block" : "none";
  }

  renderApplicationsPool();
}

function clearStaffSearch() {
  staffSearchQuery = "";
  staffStatusFilter = "all";
  staffDeskFilter = "all";

  const input = document.getElementById("staff-search-input");
  if (input) input.value = "";

  const statusSelect = document.getElementById("staff-status-filter");
  if (statusSelect) statusSelect.value = "all";

  const deskSelect = document.getElementById("staff-desk-filter");
  if (deskSelect) deskSelect.value = "all";

  const clearBtn = document.getElementById("staff-search-clear-btn");
  if (clearBtn) clearBtn.style.display = "none";

  document.querySelectorAll(".qf-btn").forEach(btn => {
    if (btn.getAttribute("data-status") === "all") {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  renderApplicationsPool();
}

function applyQuickStatusFilter(status) {
  staffStatusFilter = status;
  const statusSelect = document.getElementById("staff-status-filter");
  if (statusSelect) statusSelect.value = status;

  document.querySelectorAll(".qf-btn").forEach(btn => {
    if (btn.getAttribute("data-status") === status) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  renderApplicationsPool();
}

// --- BAŞVURU HAVUZUNU RENDER ET (ARAMA & FİLTRE DESTEKLİ) ---
function renderApplicationsPool() {
  const cardsContainer = document.getElementById("pool-list-container");
  const tableContainer = document.getElementById("pool-table-view-container");
  const tableTbody = document.getElementById("pool-table-tbody");
  if (!cardsContainer && !tableTbody) return;

  const countBadge = document.getElementById("subtab-pool-count");
  const poolBadge = document.getElementById("pool-badge-text");

  // Belediyeye gönderilmemiş yarım kalmış taslakları havuzdan hariç tut
  const nonDraftApps = applicationsList.filter(a => !a.isDraft && a.status !== "Taslak");

  const pendingCount = nonDraftApps.filter(a => a.status !== "onaylandi").length;
  if (countBadge) countBadge.innerText = String(nonDraftApps.length);
  if (poolBadge) poolBadge.innerText = `${pendingCount} Dosya İşlem Bekliyor`;

  // Hızlı sayaçları hesapla
  const countAll = nonDraftApps.length;
  const countHavuzda = nonDraftApps.filter(a => !a.claimedBy && a.status !== "onaylandi" && a.status !== "revizyon" && a.status !== "revize_edildi").length;
  const countRevize = nonDraftApps.filter(a => a.status === "revize_edildi").length;
  const countInceleniyor = nonDraftApps.filter(a => a.status === "inceleniyor" || (a.claimedBy && a.status !== "onaylandi" && a.status !== "revize_edildi" && a.status !== "revizyon")).length;
  const countRevizyon = nonDraftApps.filter(a => a.status === "revizyon").length;
  const countOnaylandi = nonDraftApps.filter(a => a.status === "onaylandi").length;

  const elAll = document.getElementById("qf-count-all");
  const elHavuzda = document.getElementById("qf-count-havuzda");
  const elRevize = document.getElementById("qf-count-revize");
  const elInceleniyor = document.getElementById("qf-count-inceleniyor");
  const elRevizyon = document.getElementById("qf-count-revizyon");
  const elOnaylandi = document.getElementById("qf-count-onaylandi");

  if (elAll) elAll.innerText = String(countAll);
  if (elHavuzda) elHavuzda.innerText = String(countHavuzda);
  if (elRevize) elRevize.innerText = String(countRevize);
  if (elInceleniyor) elInceleniyor.innerText = String(countInceleniyor);
  if (elRevizyon) elRevizyon.innerText = String(countRevizyon);
  if (elOnaylandi) elOnaylandi.innerText = String(countOnaylandi);

  // Filtreleme Algoritması
  const q = staffSearchQuery.trim().toLowerCase();

  const filteredApps = nonDraftApps.filter(app => {
    // 1. Durum Filtresi
    if (staffStatusFilter !== "all") {
      if (staffStatusFilter === "havuzda") {
        if (app.claimedBy || app.status === "onaylandi" || app.status === "revizyon" || app.status === "revize_edildi") return false;
      } else if (staffStatusFilter === "inceleniyor") {
        if (app.status !== "inceleniyor" && (!app.claimedBy || app.status === "onaylandi" || app.status === "revize_edildi")) return false;
      } else if (app.status !== staffStatusFilter) {
        return false;
      }
    }

    // 2. Masa / Personel Filtresi
    if (staffDeskFilter === "my_desk") {
      if (!app.claimedBy || !currentStaff || app.claimedBy.id !== currentStaff.id) return false;
    } else if (staffDeskFilter === "unclaimed") {
      if (app.claimedBy) return false;
    }

    // 3. Canlı Arama Metni (Ada / Parsel, Dosya No, Firma, Malik, Mahalle, TC)
    if (q) {
      const appNo = String(app.appNo || "").toLowerCase();
      const oldAdaParsel = String(app.cadastre?.oldAdaParsel || "").toLowerCase();
      const newAdaParsel = String(app.cadastre?.newAdaParsel || "").toLowerCase();
      const ada = String(app.cadastre?.ada || "").toLowerCase();
      const parsel = String(app.cadastre?.parsel || "").toLowerCase();
      const neighborhood = String(app.cadastre?.neighborhood || "").toLowerCase();
      const address = String(app.cadastre?.address || "").toLowerCase();
      const compName = String(app.company?.name || "").toLowerCase();
      const repName = String(app.company?.repName || "").toLowerCase();
      const repTc = String(app.company?.repTc || "").toLowerCase();
      const repEmail = String(app.company?.repEmail || "").toLowerCase();
      const subEmail = String(app.submittedByEmail || "").toLowerCase();
      const deskName = String(app.claimedBy?.name || "").toLowerCase();

      const mainMatch = appNo.includes(q) ||
        oldAdaParsel.includes(q) ||
        newAdaParsel.includes(q) ||
        ada.includes(q) ||
        parsel.includes(q) ||
        neighborhood.includes(q) ||
        address.includes(q) ||
        compName.includes(q) ||
        repName.includes(q) ||
        repTc.includes(q) ||
        repEmail.includes(q) ||
        subEmail.includes(q) ||
        deskName.includes(q);

      if (mainMatch) return true;

      // Hak sahipleri kontrolü (ad, soyad, tc, bağımsız bölüm no)
      if (app.owners && Array.isArray(app.owners)) {
        const ownerHit = app.owners.some(o => {
          const fn = `${o.firstName || ''} ${o.lastName || ''}`.toLowerCase();
          const tc = String(o.tc || "").toLowerCase();
          const unit = String(o.oldUnitNo || "").toLowerCase();
          return fn.includes(q) || tc.includes(q) || unit.includes(q);
        });
        if (ownerHit) return true;
      }

      return false;
    }

    return true;
  });

  // Arama Bilgisi Metnini Güncelle
  const infoEl = document.getElementById("staff-search-results-info");
  if (infoEl) {
    if (q) {
      infoEl.innerHTML = `🔍 <strong>"${escapeHtml(q)}"</strong> için <span style="color:#2563eb;">${filteredApps.length}</span> dosya bulundu (Toplam: ${nonDraftApps.length})`;
    } else if (staffStatusFilter !== "all" || staffDeskFilter !== "all") {
      infoEl.innerHTML = `Filtrelenen: <strong>${filteredApps.length}</strong> / ${nonDraftApps.length} dosya`;
    } else {
      infoEl.innerText = `Toplam ${nonDraftApps.length} dosya listeleniyor`;
    }
  }

  // --- KART GÖRÜNÜMÜ RENDER ---
  if (cardsContainer) {
    cardsContainer.innerHTML = "";

    if (filteredApps.length === 0) {
      cardsContainer.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #64748b; background:#f8fafc; border-radius:12px; border:1.5px dashed #cbd5e1;">
          <span style="font-size: 38px; display: block; margin-bottom: 8px;">🔍</span>
          <strong style="font-size:15px; color:#1e293b; display:block; margin-bottom:4px;">Aradığınız Kriterlere Uygun Dosya Bulunamadı</strong>
          <p style="font-size:13px; color:#64748b; margin:0 0 14px 0;">
            ${q ? `"${escapeHtml(q)}" aramasına ait dosya havuzda mevcut değil.` : 'Seçili filtrelere uygun başvuru bulunmamaktadır.'}
          </p>
          <button type="button" class="btn-action-sm btn-outline-secondary" onclick="clearStaffSearch()" style="padding:6px 16px; font-weight:700;">
            🔄 Filtreleri ve Aramayı Temizle
          </button>
        </div>
      `;
    } else {
      filteredApps.forEach(app => {
        const card = document.createElement("div");
        card.className = "app-card";
        if (selectedAppId === app.id) card.style.borderColor = "#2563eb";

        let statusPill = "";
        let deskLocationText = "";
        let deskBadgeStyle = "";

        if (app.status === "onaylandi") {
          statusPill = `<span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800; border:1px solid #86efac;">✔ Onaylandı</span>`;
          deskLocationText = "🏛️ Onaylandı & ARAAD'a Gönderildi";
          deskBadgeStyle = "background:#dcfce7; color:#15803d; border:1px solid #86efac;";
        } else if (app.status === "revize_edildi") {
          statusPill = `<span class="badge-status-pill" style="background:#fffbeb; color:#92400e; font-weight:800; border:1.5px solid #f59e0b; box-shadow:0 0 8px rgba(245,158,11,0.25);">🔄 REVİZE EDİLDİ</span>`;
          deskLocationText = "🔄 Müteahhit Revize Etti & Tekrar Gönderdi";
          deskBadgeStyle = "background:#fffbeb; color:#92400e; border:1px solid #f59e0b;";
        } else if (app.status === "revizyon") {
          statusPill = `<span class="badge-status-pill" style="background:#fee2e2; color:#b91c1c; font-weight:800; border:1px solid #fca5a5;">⚠️ Revizyon Talebi Var</span>`;
          deskLocationText = "⚠️ Müteahhidin Revize Etmesi Bekleniyor";
          deskBadgeStyle = "background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;";
        } else if (app.claimedBy) {
          statusPill = `<span class="badge-status-pill" style="background:#dbeafe; color:#1e40af; font-weight:800;">İnceleniyor (${escapeHtml(app.claimedBy.name.split(" ")[0])})</span>`;
          deskLocationText = `💼 İnceleyen: ${escapeHtml(app.claimedBy.name)}`;
          deskBadgeStyle = "background:#dbeafe; color:#1e40af; border:1px solid #bfdbfe;";
        } else {
          statusPill = `<span class="badge-status-pill" style="background:#eff6ff; color:#1e40af; font-weight:800;">⏳ Havuzda Bekliyor</span>`;
          deskLocationText = "📥 Başvuru Havuzunda (Henüz Atanmadı)";
          deskBadgeStyle = "background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe;";
        }

        const ownerCount = (app.owners || []).length;
        const attachedDocsCount = (app.owners || []).filter(u => u.attachedDoc).length;
        const isClaimedByMe = app.claimedBy && currentStaff && app.claimedBy.id === currentStaff.id;

        let structBadge = "";
        if (app.cadastre?.isTevhid || app.cadastre?.structureType === "tevhid" || app.cadastre?.structureType === "both") {
          structBadge += `<span class="badge-status-pill" style="background:#eff6ff; color:#1d4ed8; font-size:11px; margin-left:4px;">🔄 Tevhid</span>`;
        }
        if (app.cadastre?.isBlocks || app.cadastre?.structureType === "blocks" || app.cadastre?.structureType === "both") {
          const blocksText = (app.cadastre.blocksList && app.cadastre.blocksList.length) ? app.cadastre.blocksList.join(",") : "Bloklu";
          structBadge += `<span class="badge-status-pill" style="background:#f0fdf4; color:#15803d; font-size:11px; margin-left:4px;">🏢 ${escapeHtml(blocksText)}</span>`;
        }

        card.innerHTML = `
          <div class="ac-top">
            <div>
              <span class="ac-app-no">${escapeHtml(app.appNo)}</span>${structBadge}
              <div class="ac-address">${escapeHtml(app.cadastre?.neighborhood || '')} &bull; <strong>${escapeHtml(parseAdaParsel(app.cadastre?.oldAdaParsel).displayText)}</strong></div>
            </div>
            ${statusPill}
          </div>

          <!-- Dosya Konumu / Masa Göstergesi (Kullanıcı Nerede Olduğunu Doğrudan Görsün) -->
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:7px 10px; margin-top:8px; display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap;">
            <div style="font-size:12px; font-weight:700; color:#334155; display:flex; align-items:center; gap:6px;">
              <span>📍 Dosya Yeri:</span>
              <span style="font-size:11.5px; padding:2px 8px; border-radius:6px; ${deskBadgeStyle}; font-weight:700;">
                ${deskLocationText}
              </span>
            </div>
          </div>

          <div class="ac-company-row" style="margin-top:8px;">
            <span>🏢 <strong>${escapeHtml(app.company?.name || 'Müteahhit Firma')}</strong></span>
            <span>Yetkili: ${escapeHtml(app.company?.repName || '-')} &bull; ✉️ ${escapeHtml(app.submittedByEmail || app.company?.repEmail || '-')}</span>
          </div>

          <div class="ac-meta-grid">
            <div class="ac-meta-item">
              <span class="ac-meta-label">Ada / Parsel:</span>
              <span class="ac-meta-val font-mono" style="font-weight:800; color:#0f3460;">${escapeHtml(parseAdaParsel(app.cadastre?.oldAdaParsel).displayText)}</span>
            </div>
            <div class="ac-meta-item">
              <span class="ac-meta-label">Hak Sahibi Sayısı:</span>
              <span class="ac-meta-val">${ownerCount} Kişi / BB</span>
            </div>
            <div class="ac-meta-item">
              <span class="ac-meta-label">Evrak Durumu:</span>
              <span class="ac-meta-val" style="color:${attachedDocsCount > 0 ? '#15803d' : '#b45309'}; font-weight:700;">
                📁 ${attachedDocsCount} / ${ownerCount} Yüklendi
              </span>
            </div>
            <div class="ac-meta-item">
              <span class="ac-meta-label">Gönderim Tarihi:</span>
              <span class="ac-meta-val">${escapeHtml(app.submissionDate || '-')}</span>
            </div>
          </div>

          ${(() => {
            const asilOwners = (app.owners || []).filter(u => !u.hasProxy);
            if (asilOwners.length > 0) {
              return `
                <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:7px 10px; font-size:11.5px; color:#92400e; margin-top:10px; display:flex; align-items:center; gap:6px;">
                  <span style="font-size:15px;">📅</span>
                  <span><strong>${asilOwners.length} Malik Salı/Perşembe Asil Randevulu:</strong> ${asilOwners.map(u => `${escapeHtml(u.oldUnitNo)}.BB: ${formatDateTr(u.appointmentDate)} ${escapeHtml(u.appointmentDay || '')}`).join(', ')}</span>
                </div>
              `;
            } else {
              return `
                <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:6px 10px; font-size:11.5px; color:#166534; margin-top:10px;">
                  <span>✓ Tüm Malikler Noter Vekaletlidir</span>
                </div>
              `;
            }
          })()}

          <div class="ac-actions" style="display:flex; gap:8px; margin-top:12px;">
            ${!app.claimedBy ? `
              <button class="btn-action-sm btn-primary-sm" onclick="claimApplication('${app.id}')" style="flex:1;">
                📥 Dosyayı Üzerime Al ve Aç
              </button>
            ` : isClaimedByMe ? `
              <button class="btn-action-sm btn-primary-sm" onclick="openApplicationDetail('${app.id}')" style="flex:1; background: #1e40af;">
                📂 İncelemeye Devam Et
              </button>
            ` : `
              <button class="btn-action-sm btn-outline-info" onclick="openApplicationDetail('${app.id}')" style="flex:1;">
                👁️ Dosyayı İncele (${escapeHtml(app.claimedBy.name)})
              </button>
            `}
            <button type="button" class="btn-action-sm" onclick="event.stopPropagation(); adminDeleteApplication('${app.id}', '${escapeHtml(app.appNo)}')"
              style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-weight:700; padding:6px 12px; border-radius:6px; cursor:pointer;"
              title="Bu başvuru dosyasını sistemden kalıcı olarak sil">
              🗑️ Sil
            </button>
          </div>
        `;

        cardsContainer.appendChild(card);
      });
    }
  }

  // --- TABLO GÖRÜNÜMÜ RENDER ---
  if (tableTbody) {
    tableTbody.innerHTML = "";

    if (filteredApps.length === 0) {
      tableTbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding:30px; color:#64748b;">
            Aradığınız kriterlere uygun dosya bulunamadı.
          </td>
        </tr>
      `;
    } else {
      filteredApps.forEach(app => {
        const tr = document.createElement("tr");

        let statusBadge = "";
        let deskText = "";
        if (app.status === "onaylandi") {
          statusBadge = '<span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800;">✔ Onaylandı</span>';
          deskText = '<span style="color:#15803d; font-weight:700;">🏛️ ARAAD\'da</span>';
        } else if (app.status === "revize_edildi") {
          statusBadge = '<span class="badge-status-pill" style="background:#fffbeb; color:#92400e; font-weight:800; border:1px solid #f59e0b;">🔄 Revize Edildi</span>';
          deskText = '<span style="color:#92400e; font-weight:700;">🔄 Yeniden Gönderildi</span>';
        } else if (app.status === "revizyon") {
          statusBadge = '<span class="badge-status-pill" style="background:#fee2e2; color:#b91c1c; font-weight:800;">⚠️ Revizyonda</span>';
          deskText = '<span style="color:#b91c1c; font-weight:600;">Müteahhitte</span>';
        } else if (app.claimedBy) {
          statusBadge = `<span class="badge-status-pill" style="background:#dbeafe; color:#1e40af; font-weight:700;">İnceleniyor</span>`;
          deskText = `<strong>💼 ${escapeHtml(app.claimedBy.name)}</strong>`;
        } else {
          statusBadge = '<span class="badge-status-pill" style="background:#eff6ff; color:#1e40af; font-weight:600;">⏳ Havuzda</span>';
          deskText = '<span style="color:#64748b;">📥 Ortak Havuz</span>';
        }

        const ownerCount = (app.owners || []).length;
        const attachedDocsCount = (app.owners || []).filter(u => u.attachedDoc).length;
        const docsBadge = attachedDocsCount === ownerCount && ownerCount > 0
          ? `<span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-size:11px;">✅ ${attachedDocsCount}/${ownerCount} Tamam</span>`
          : `<span class="badge-status-pill" style="background:#fee2e2; color:#b91c1c; font-size:11px;">⚠️ ${attachedDocsCount}/${ownerCount} Yüklendi</span>`;

        tr.innerHTML = `
          <td class="font-mono" style="font-weight:700; color:#0f172a;">${escapeHtml(app.appNo)}</td>
          <td>
            <strong>${escapeHtml(parseAdaParsel(app.cadastre?.oldAdaParsel).displayText)}</strong>
            <small style="display:block; color:#64748b;">${escapeHtml(app.cadastre?.neighborhood || '')}</small>
          </td>
          <td>
            <div style="font-weight:600; color:#0f172a;">${escapeHtml(app.company?.name || '-')}</div>
            <div style="font-size:11px; color:#64748b;">${escapeHtml(app.company?.repName || '')}</div>
          </td>
          <td class="text-center font-mono"><strong>${ownerCount}</strong> BB</td>
          <td class="text-center">${docsBadge}</td>
          <td class="text-center">${statusBadge}</td>
          <td>${deskText}</td>
          <td class="text-center">
            <div style="display:inline-flex; gap:6px;">
              <button type="button" class="btn-action-sm btn-primary-sm" onclick="openApplicationDetail('${app.id}')" style="padding:4px 10px; font-size:11.5px; font-weight:700;">
                📂 Aç
              </button>
              <button type="button" class="btn-action-sm" onclick="adminDeleteApplication('${app.id}', '${escapeHtml(app.appNo)}')"
                style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-size:11.5px; padding:4px 8px; font-weight:700;" title="Sil">
                🗑️
              </button>
            </div>
          </td>
        `;

        tableTbody.appendChild(tr);
      });
    }
  }
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
  renderApplicationsPool();

  showToast(`"${app.appNo}" nolu dosya üzerinize alındı. İnceleme masası açılıyor...`, "success");
  openApplicationDetail(appId);
}

// --- DOSYA DETAY VE İNCELEME MASASINI AÇ ---
function openApplicationDetail(appId) {
  selectedAppId = appId;
  const app = applicationsList.find(a => a.id === appId);
  if (!app) return;

  const poolCard = document.getElementById("staff-pool-overview-card");
  if (poolCard) poolCard.style.display = "none";

  const detailSec = document.getElementById("selected-application-detail");
  detailSec.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });

  document.getElementById("detail-building-title").innerText = `${app.cadastre.neighborhood} - ${parseAdaParsel(app.cadastre.oldAdaParsel).displayText} (Dosya No: ${app.appNo})`;
  document.getElementById("detail-company-sub").innerHTML = `Müteahhit: <strong>${escapeHtml(app.company.name)}</strong> &bull; Başvuran: <strong class="font-mono" style="color:#0369a1;">${escapeHtml(app.submittedByEmail || app.company.repEmail)}</strong> &bull; Açık Adres: ${escapeHtml(app.cadastre.address)}`;

  const statusPill = document.getElementById("detail-status-pill");
  if (statusPill) {
    if (app.status === "onaylandi") {
      statusPill.innerText = "✔ Onaylandı & ARAAD'a Gönderildi";
      statusPill.style.background = "#dcfce7";
      statusPill.style.color = "#15803d";
      statusPill.style.border = "1px solid #86efac";
    } else if (app.status === "revize_edildi") {
      statusPill.innerText = "🔄 Revize Edildi (Müteahhit Eksikleri Tamamlayıp Yeniden Gönderdi)";
      statusPill.style.background = "#fffbeb";
      statusPill.style.color = "#92400e";
      statusPill.style.border = "1.5px solid #f59e0b";
    } else if (app.status === "revizyon") {
      statusPill.innerText = "⚠️ Revizyon Talebi Var (Müteahhidin Düzenlemesi Bekleniyor)";
      statusPill.style.background = "#fee2e2";
      statusPill.style.color = "#b91c1c";
      statusPill.style.border = "1px solid #fca5a5";
    } else {
      statusPill.innerText = app.claimedBy ? `İnceleniyor (${app.claimedBy.name})` : "Havuzda Bekliyor";
      statusPill.style.background = "#dbeafe";
      statusPill.style.color = "#1e40af";
      statusPill.style.border = "1px solid #bfdbfe";
    }
  }

  // Revize Edilen / Onaylanan Dosya Bildirim Panosu
  const revBanner = document.getElementById("detail-revision-alert-banner");
  if (revBanner) {
    if (app.status === "revize_edildi") {
      revBanner.style.display = "block";
      revBanner.innerHTML = `
        <div style="background:#fffbeb; border:2px solid #f59e0b; border-radius:12px; padding:14px 20px; box-shadow:0 4px 12px rgba(245,158,11,0.12); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size:28px;">🔄</span>
            <div>
              <strong style="color:#92400e; font-size:14.5px;">MÜTEAHHİT EKSİKLERİ DÜZENLEDİ &amp; YENİDEN BELEDİYEYE GÖNDERDİ</strong>
              <p style="margin:2px 0 0; font-size:12.5px; color:#b45309;">
                Müteahhit firma talep edilen revizyonları tamamladı. Güncelleme: <strong>${escapeHtml(app.submissionDate)}</strong> &bull; Dosyadaki malik bilgileri ve taranmış belgeler yenilenmiştir.
              </p>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn-action-sm" onclick="openRevisionChatModal()" style="background:#d97706; color:#fff; font-weight:800; border:none; padding:8px 14px; border-radius:6px; cursor:pointer;">
              💬 Mesaj Geçmişini Gör
            </button>
            <button type="button" class="btn-action-sm btn-outline-success" onclick="markApplicationStatus('onaylandi')" style="font-weight:800; background:#dcfce7; color:#15803d; border-color:#86efac; padding:8px 14px; border-radius:6px; cursor:pointer;">
              ✔ Uygunsa Onayla &amp; ARAAD'a Gönder
            </button>
          </div>
        </div>
      `;
    } else if (app.status === "onaylandi") {
      revBanner.style.display = "block";
      revBanner.innerHTML = `
        <div style="background:#f0fdf4; border:2px solid #16a34a; border-radius:12px; padding:14px 20px; box-shadow:0 4px 12px rgba(22,163,74,0.12); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size:28px;">✅</span>
            <div>
              <strong style="color:#15803d; font-size:14.5px;">BU BAŞVURU DOSYASI ONAYLANDI &amp; ARAAD SİSTEMİNE AKTARILDI</strong>
              <p style="margin:2px 0 0; font-size:12.5px; color:#166534;">
                Dosya resmi olarak incelenmiş ve onaylanmıştır. Onay Tarihi: <strong>${escapeHtml(app.approvedAt || 'Yeni')}</strong> &bull; Onaylayan: <strong>${escapeHtml(app.approvedBy || (currentStaff ? currentStaff.name : 'Yetkili'))}</strong>
              </p>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn-action-sm btn-outline-warning" onclick="markApplicationStatus('inceleniyor')" style="font-weight:700; background:#fff; color:#b45309; border-color:#fcd34d;">
              ↩ Onayı Geri Al (Yeniden İncele)
            </button>
          </div>
        </div>
      `;
    } else {
      revBanner.style.display = "none";
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

  let extraBreakdown = "";
  if ((app.cadastre.structureType === "tevhid" || app.cadastre.isTevhid) && app.cadastre.parcelsMap) {
    const list = Object.entries(app.cadastre.parcelsMap).map(([k, v]) => `${k}: ${v} m²`).join(" • ");
    extraBreakdown = `<div style="font-size:11px; color:#1e40af; margin-top:4px;">🔄 Birleşen Parseller: <strong>${list}</strong> (Toplam: ${oldM2} m²)</div>`;
  } else if ((app.cadastre.structureType === "blocks" || app.cadastre.isBlocks) && app.cadastre.blocksMap) {
    const list = Object.entries(app.cadastre.blocksMap).map(([k, v]) => `${k}: ${v} m²`).join(" • ");
    extraBreakdown = `<div style="font-size:11px; color:#166534; margin-top:4px;">🏢 Projedeki Bloklar: <strong>${list}</strong> (Toplam: ${oldM2} m²)</div>`;
  }

  const det15 = document.getElementById("det-15-status");
  if (oldM2 > 0 && netM2 <= maxAllowed) {
    det15.innerHTML = `<span style="color:#059669; font-weight:700;">✅ 1.5 Kat Uyumlu (${ratio}x / Net: ${netM2} m² / Azami: ${maxAllowed.toFixed(1)} m²)</span>${extraBreakdown}`;
  } else if (oldM2 > 0) {
    det15.innerHTML = `<span style="color:#dc2626; font-weight:700;">🚨 1.5 Katı Aşıyor! (${ratio}x - Max Sınır: ${maxAllowed.toFixed(1)} m²)</span>${extraBreakdown}`;
  } else {
    det15.innerText = "Hesaplanamadı";
  }

  // Müteahhidin Yüklediği Birleştirilmiş Evraklar Durum Panosu
  const docsStatusBox = document.getElementById("detail-contractor-docs-status-box");
  if (docsStatusBox) {
    const mergedDoc = app.mergedUnitsDoc || (app.buildingDocs && app.buildingDocs.mergedUnitsDoc);
    const attachedCount = (app.owners || []).filter(u => u.attachedDoc).length;
    const totalCount = (app.owners || []).length;

    if (mergedDoc) {
      docsStatusBox.innerHTML = `
        <div style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:10px; padding:13px 18px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:24px;">📁</span>
            <div>
              <strong style="color:#15803d; font-size:13.5px;">Müteahhit Birleştirilmiş Daire Evrakları Dosyası Yükledi: ${escapeHtml(mergedDoc.name || 'Birlestirilmis_Daireler.pdf')}</strong>
              <p style="margin:2px 0 0; font-size:12px; color:#166534;">Tüm bağımsız bölümlerin resmi evrakları müteahhit tarafından tek birleştirilmiş PDF olarak sunulmuştur.</p>
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn-action-sm btn-outline-primary" onclick="viewStaffBuildingDoc('${app.id}', 'mergedUnitsDoc')" style="font-weight:700;">
              👁️ Önizle
            </button>
            <button type="button" class="btn-action-sm btn-outline-success" onclick="downloadStaffBuildingDoc('${app.id}', 'mergedUnitsDoc')" style="font-weight:700;">
              📥 İndir
            </button>
            <button type="button" class="btn-action-sm btn-outline-success" onclick="openAllBuildingDocsModal()" style="font-weight:700; background:#dcfce7; color:#15803d; border-color:#86efac;">
              📂 Tüm Evrak Listesi
            </button>
          </div>
        </div>
      `;
    } else if (attachedCount === totalCount && totalCount > 0) {
      docsStatusBox.innerHTML = `
        <div style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:10px; padding:13px 18px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:24px;">📁</span>
            <div>
              <strong style="color:#15803d; font-size:13.5px;">Müteahhit Tüm Evrakları Daire Başına Yükledi (${attachedCount} / ${totalCount} Bağımsız Bölüm Eksiksiz)</strong>
              <p style="margin:2px 0 0; font-size:12px; color:#166534;">Tüm dairelerin resmi PDF dosyaları hazırdır. Aşağıdaki tablodan tek tek veya toplu olarak inceleyebilirsiniz.</p>
            </div>
          </div>
          <button type="button" class="btn-action-sm btn-outline-success" onclick="openAllBuildingDocsModal()" style="font-weight:700; background:#dcfce7; color:#15803d; border-color:#86efac;">
            📂 Tüm Evrakları Görüntüle &amp; İndir
          </button>
        </div>
      `;
    } else {
      const missingCount = totalCount - attachedCount;
      docsStatusBox.innerHTML = `
        <div style="background:#fff1f2; border:1.5px solid #fecdd3; border-radius:10px; padding:13px 18px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:24px;">⚠️</span>
            <div>
              <strong style="color:#be123c; font-size:13.5px;">Evrak Durumu: ${attachedCount} / ${totalCount} Yüklendi (${missingCount} Dairede Evrak Eksik)</strong>
              <p style="margin:2px 0 0; font-size:12px; color:#9f1239;">Dosyadaki bazı bağımsız bölümler için müteahhit tarafından evrak yükleme işlemi henüz tamamlanmamış.</p>
            </div>
          </div>
          <button type="button" class="btn-action-sm btn-outline-warning" onclick="openRevisionChatModal()" style="font-weight:700; background:#fff; color:#be123c; border-color:#f43f5e;">
            💬 Müteahhide Eksik Evrak Bildir
          </button>
        </div>
      `;
    }
  }

  // Bina Geneli Toplu Sözleşmeler ve Toplu Vekaletnameler Panosu
  renderStaffBuildingDocsBox(app);

  // Salı / Perşembe Belediye İmza Masası Randevuları Takvim Panosu
  const scheduleBox = document.getElementById("detail-appointment-schedule-box");
  if (scheduleBox) {
    const asilList = (app.owners || []).filter(u => !u.hasProxy);
    if (asilList.length > 0) {
      scheduleBox.style.display = "block";
      scheduleBox.innerHTML = `
        <div style="background:#fffbeb; border:1.5px solid #fde68a; border-radius:10px; padding:14px 18px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:22px;">📅</span>
              <div>
                <strong style="color:#92400e; font-size:13.5px;">Salı / Perşembe Belediye İmza Masası Randevuları (${asilList.length} Malik Asil Olarak Gelecek):</strong>
                <p style="margin:2px 0 0; font-size:12px; color:#b45309;">Noter vekaleti bulunmayan malikler belediyeye bizzat gelerek imza atacaktır. İmzaya gelecekleri günler aşağıdadır:</p>
              </div>
            </div>
            <span class="badge-status-pill" style="background:#fef3c7; color:#92400e; font-weight:800; border:1px solid #fcd34d;">
              📌 Salı & Perşembe Kontrolü
            </span>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
            ${asilList.map(u => `
              <div style="background:#fff; border:1px solid #fde68a; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div style="font-weight:700; color:#0f172a; font-size:13px;">${escapeHtml(u.oldUnitNo)}. BB • ${escapeHtml(u.firstName)} ${escapeHtml(u.lastName)}</div>
                  <div style="font-size:11.5px; color:#64748b;">TC: <span class="font-mono">${escapeHtml(u.tc)}</span> &bull; Tel: ${escapeHtml(u.phone)}</div>
                </div>
                <div style="text-align:right;">
                  <span class="badge-status-pill" style="background:#ecfdf5; color:#065f46; font-size:12px; font-weight:800; border:1px solid #a7f3d0; display:inline-block;">
                    🗓️ ${u.appointmentDate ? formatDateTr(u.appointmentDate) : 'Tarih Yok'} ${escapeHtml(u.appointmentDay || '')}
                  </span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      scheduleBox.style.display = "block";
      scheduleBox.innerHTML = `
        <div style="background:#f0fdf4; border:1.5px solid #bbf7d0; border-radius:10px; padding:12px 18px; display:flex; align-items:center; gap:10px;">
          <span style="font-size:20px;">✅</span>
          <div style="font-size:13px; color:#166534;">
            <strong>Tüm Malikler Noter Vekaletlidir:</strong> Bu dosyadaki tüm bağımsız bölüm malikleri müteahhide noter vekaleti vermiştir, belediye imza masasında asil randevusu gerektiren malik bulunmamaktadır.
          </div>
        </div>
      `;
    }
  }

  // Hak Sahipleri Tablosu Render
  const tbody = document.getElementById("detail-owners-table-body");
  tbody.innerHTML = "";

  (app.owners || []).forEach((u, idx) => {
    const tr = document.createElement("tr");
    const proxyStatusHtml = u.hasProxy ? `
      <span class="proxy-pill pill-proxy" title="Vekil: ${escapeHtml(u.proxyName || '')} (TC: ${escapeHtml(u.proxyTc || '')})">
        📜 Vekil: ${escapeHtml(u.proxyName || '')} <br><small class="font-mono">(${escapeHtml(u.proxyTc || '')})</small>
      </span>
    ` : `
      <span class="proxy-pill pill-personal" title="Vekalet verilmemiştir. Randevu: ${formatDateTr(u.appointmentDate)} ${u.appointmentDay || 'Salı/Perşembe'}">
        ✍️ Asil • Randevu: <strong>${u.appointmentDate ? formatDateTr(u.appointmentDate) + ' ' + (u.appointmentDay || '') : 'Salı/Perşembe'}</strong>
      </span>
    `;

    const unitPrefix = u.parcel ? `<span class="badge-status-pill" style="background:#eff6ff; color:#1e40af; font-size:10px; display:block; margin-bottom:2px; font-weight:800;">📍 ${escapeHtml(u.parcel)}</span>` : (u.block ? `<span class="badge-status-pill" style="background:#f1f5f9; color:#0f172a; font-size:10px; display:block; margin-bottom:2px; font-weight:800;">🏢 ${escapeHtml(u.block)}</span>` : '');
    tr.innerHTML = `
      <td style="font-weight:700; text-align:center;">${unitPrefix}${escapeHtml(u.oldUnitNo)}</td>
      <td>${escapeHtml(u.floor)} / ${escapeHtml(u.type)}</td>
      <td class="font-mono">${escapeHtml(u.tc)}</td>
      <td class="font-mono">${escapeHtml(u.birthDate)}</td>
      <td><strong>${escapeHtml(u.firstName)} ${escapeHtml(u.lastName)}</strong></td>
      <td>${escapeHtml(u.phone)}</td>
      <td style="font-weight:700; color:#1e40af;">${u.shareNum} / ${u.shareDenom}</td>
      <td class="text-center">${proxyStatusHtml}</td>
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
          <div class="doc-ready-wrap" style="background:#f0fdf4; border:1px solid #86efac; border-radius:6px; padding:5px 8px;">
            <span class="doc-badge-success" style="font-size:11px; font-weight:700;">✅ ${escapeHtml(u.attachedDoc.name || `${u.oldUnitNo}.B.B.pdf`)}</span>
            <div style="font-size:10px; color:#166534; font-weight:600; margin:1px 0;">
              ${(u.individualDocs && (u.individualDocs.petition || u.individualDocs.oldDeed || u.individualDocs.newDeed || u.individualDocs.idCard || u.individualDocs.taxDecl)) ? '⚡ 5 Evrak (Tek Tek &amp; Oto Birleşti)' : '📁 Birleştirilmiş Toplu PDF'}
            </div>
            <div class="doc-btn-group" style="display:flex; gap:4px; margin-top:4px; justify-content:center;">
              <button class="btn-xs-doc" style="background:#0284c7; color:#fff;" onclick="viewOwnerAttachedDocDirectly('${app.id}', ${idx})" title="Müteahhidin yüklediği evrakı görüntüle">👁️ Görüntüle</button>
              <button class="btn-xs-doc" style="background:#15803d; color:#fff;" onclick="downloadAttachedDoc('staff', '${app.id}', ${idx})" title="Evrakı indir">📥 İndir</button>
              <button class="btn-xs-doc" onclick="openUnitDocModal('staff', '${app.id}', ${idx})" title="Detaylı incele">🔍 İncele</button>
            </div>
          </div>
        ` : ((app.mergedUnitsDoc || (app.buildingDocs && app.buildingDocs.mergedUnitsDoc)) ? `
          <div class="doc-ready-wrap" style="background:#f0fdf4; border:1px solid #86efac; border-radius:6px; padding:5px 8px;">
            <span class="doc-badge-success" style="font-size:11px; font-weight:700;">✅ Birleşik Dosyada</span>
            <div style="font-size:10px; color:#166534; font-weight:600; margin:1px 0;">Toplu Daire PDF'i Mevcut</div>
            <div class="doc-btn-group" style="display:flex; gap:4px; margin-top:4px; justify-content:center;">
              <button class="btn-xs-doc" style="background:#0284c7; color:#fff;" onclick="viewStaffBuildingDoc('${app.id}', 'mergedUnitsDoc')" title="Müteahhidin yüklediği birleştirilmiş dosyayı görüntüle">👁️ Görüntüle</button>
              <button class="btn-xs-doc" style="background:#15803d; color:#fff;" onclick="downloadStaffBuildingDoc('${app.id}', 'mergedUnitsDoc')" title="Birleştirilmiş dosyayı indir">📥 İndir</button>
            </div>
          </div>
        ` : `
          <div style="display:flex; gap:4px; justify-content:center; flex-direction:column; align-items:center;">
            <span style="color:#b91c1c; font-size:11px; font-weight:700;">❌ Müteahhit Yüklemedi</span>
            <button class="btn-copy-chip" style="background:#fff1f2; color:#be123c; border-color:#fecdd3; font-weight:700;" onclick="requestDocInChat('${escapeHtml(u.oldUnitNo)}. BB Resmi Evrakları')" title="Bu daire için müteahhitten evrak iste">
              💬 Eksik Evrak İste
            </button>
          </div>
        `)}
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Alt onay butonlarını dosya durumuna göre dinamik güncelle
  const footerContainer = document.getElementById("detail-footer-actions-container");
  if (footerContainer) {
    if (app.status === "onaylandi") {
      footerContainer.innerHTML = `
        <div style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:10px; padding:14px 20px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; width:100%;">
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size:26px;">✅</span>
            <div>
              <strong style="color:#15803d; font-size:14px; display:block;">Bu Başvuru Dosyası Onaylandı &amp; ARAAD'a Gönderildi</strong>
              <span style="font-size:12px; color:#166534;">Onay Tarihi: <strong>${escapeHtml(app.approvedAt || 'Yeni')}</strong> &bull; Yetkili: <strong>${escapeHtml(app.approvedBy || (currentStaff ? currentStaff.name : 'Yetkili'))}</strong></span>
            </div>
          </div>
          <button type="button" class="btn-action-sm btn-outline-warning" onclick="markApplicationStatus('inceleniyor')" style="font-weight:700; background:#fff; color:#b45309; border-color:#fcd34d;">
            ↩ Onayı Geri Al (Yeniden İncele)
          </button>
        </div>
      `;
    } else {
      footerContainer.innerHTML = `
        <button class="yb-btn yb-btn-outline" onclick="markApplicationStatus('revizyon')">
          ⚠️ Müteahhitten Eksik Evrak / Revizyon İste
        </button>
        <button class="yb-btn yb-btn-primary" onclick="markApplicationStatus('onaylandi')">
          ✔ Dosyayı Onayla ve ARAAD'a Gönderildi İşaretle
        </button>
      `;
    }
  }
}

// =========================================================================
// BİNA GENELİ TOPLU EVRAKLAR (SÖZLEŞMELER VE VEKALETNAMELER - YETKİLİ)
// =========================================================================
function renderStaffBuildingDocsBox(app) {
  const box = document.getElementById("detail-building-contracts-proxies-box");
  if (!box) return;

  const bDocs = app.buildingDocs || {};
  const contractsDoc = bDocs.contracts || null;
  const proxiesDoc = bDocs.proxies || null;
  const mergedDoc = bDocs.mergedUnitsDoc || app.mergedUnitsDoc || null;

  const getDocStatusBadge = (doc) => {
    if (doc) {
      const sizeStr = doc.size ? (doc.size > 1024 * 1024 ? (doc.size / (1024 * 1024)).toFixed(2) + " MB" : (doc.size / 1024).toFixed(1) + " KB") : "";
      return `<span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800; border:1px solid #86efac;">✓ Yüklendi ${sizeStr ? `(${sizeStr})` : ''}</span>`;
    }
    return `<span class="badge-status-pill" style="background:#fee2e2; color:#b91c1c; font-weight:800; border:1px solid #fca5a5;">⚠️ Yüklenmedi (Eksik)</span>`;
  };

  box.innerHTML = `
    <div style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:12px; padding:16px 20px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; border-bottom:1px solid #f1f5f9; padding-bottom:10px; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:24px;">📑</span>
          <div>
            <h4 style="margin:0; font-size:14.5px; font-weight:800; color:#0f172a;">Bina Geneli Toplu Evraklar (Sözleşmeler ve Noter Vekaletnameleri)</h4>
            <p style="margin:2px 0 0 0; font-size:12px; color:#64748b;">Müteahhit firma ile hak sahipleri arasındaki resmi yapım sözleşmesi ve noter onaylı toplu vekaletnameler.</p>
          </div>
        </div>
        <span class="badge-status-pill" style="background:#eff6ff; color:#1e40af; font-weight:700; border:1px solid #bfdbfe;">
          Resmi Dosya Ekleri
        </span>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:14px;">
        <!-- KART 1: TOPLU SÖZLEŞMELER -->
        <div style="background:${contractsDoc ? '#f0fdf4' : '#fff1f2'}; border:1.5px solid ${contractsDoc ? '#86efac' : '#fecdd3'}; border-radius:10px; padding:14px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:22px;">📄</span>
              <strong style="font-size:13.5px; color:#0f172a;">Toplu Yapım / İnşaat Sözleşmeleri</strong>
            </div>
            ${getDocStatusBadge(contractsDoc)}
          </div>

          ${contractsDoc ? `
            <div style="margin-bottom:10px; font-size:12px; color:#166534;">
              <div style="font-weight:700; word-break:break-all;">📎 ${escapeHtml(contractsDoc.name || 'Sozlesme.pdf')}</div>
              <small style="color:#15803d; display:block; margin-top:2px;">Yüklenme: ${contractsDoc.uploadedAt || 'Belirtilmedi'}</small>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn-xs-doc" style="background:#0284c7; color:#fff; padding:6px 12px; font-size:12px;" onclick="viewStaffBuildingDoc('${app.id}', 'contracts')">
                👁️ Sözleşmeyi İncele
              </button>
              <button type="button" class="btn-xs-doc" style="background:#15803d; color:#fff; padding:6px 12px; font-size:12px;" onclick="downloadStaffBuildingDoc('${app.id}', 'contracts')">
                📥 İndir
              </button>
            </div>
          ` : `
            <p style="font-size:12px; color:#9f1239; margin:0 0 10px 0;">Müteahhit tarafından toplu yapım / inşaat sözleşmesi henüz sisteme yüklenmemiştir.</p>
            <button type="button" class="btn-xs-doc" style="background:#be123c; color:#fff; padding:6px 12px; font-size:12px;" onclick="requestDocInChat('Toplu Yapım / İnşaat Sözleşmesi')">
              💬 Müteahhitten Sözleşmeyi İste
            </button>
          `}
        </div>

        <!-- KART 2: TOPLU VEKALETNAMELER -->
        <div style="background:${proxiesDoc ? '#f0fdf4' : '#fff1f2'}; border:1.5px solid ${proxiesDoc ? '#86efac' : '#fecdd3'}; border-radius:10px; padding:14px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:22px;">📜</span>
              <strong style="font-size:13.5px; color:#0f172a;">Toplu Noter Onaylı Vekaletnameler</strong>
            </div>
            ${getDocStatusBadge(proxiesDoc)}
          </div>

          ${proxiesDoc ? `
            <div style="margin-bottom:10px; font-size:12px; color:#166534;">
              <div style="font-weight:700; word-break:break-all;">📎 ${escapeHtml(proxiesDoc.name || 'Vekaletnameler.pdf')}</div>
              <small style="color:#15803d; display:block; margin-top:2px;">Yüklenme: ${proxiesDoc.uploadedAt || 'Belirtilmedi'}</small>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn-xs-doc" style="background:#0284c7; color:#fff; padding:6px 12px; font-size:12px;" onclick="viewStaffBuildingDoc('${app.id}', 'proxies')">
                👁️ Vekaletnameleri İncele
              </button>
              <button type="button" class="btn-xs-doc" style="background:#15803d; color:#fff; padding:6px 12px; font-size:12px;" onclick="downloadStaffBuildingDoc('${app.id}', 'proxies')">
                📥 İndir
              </button>
            </div>
          ` : `
            <p style="font-size:12px; color:#9f1239; margin:0 0 10px 0;">Müteahhit tarafından noter onaylı toplu vekaletnameler henüz sisteme yüklenmemiştir.</p>
            <button type="button" class="btn-xs-doc" style="background:#be123c; color:#fff; padding:6px 12px; font-size:12px;" onclick="requestDocInChat('Toplu Noter Onaylı Vekaletnameler')">
              💬 Müteahhitten Vekaletnameleri İste
            </button>
          `}
        </div>

        ${mergedDoc ? `
          <!-- KART 3: BİRLEŞTİRİLMİŞ DAİRE EVRAKLARI -->
          <div style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:10px; padding:14px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:22px;">📁</span>
                <strong style="font-size:13.5px; color:#0f172a;">Birleştirilmiş Daire Evrakları</strong>
              </div>
              ${getDocStatusBadge(mergedDoc)}
            </div>
            <div style="margin-bottom:10px; font-size:12px; color:#166534;">
              <div style="font-weight:700; word-break:break-all;">📎 ${escapeHtml(mergedDoc.name || 'Birlestirilmis_Daireler.pdf')}</div>
              <small style="color:#15803d; display:block; margin-top:2px;">Yüklenme: ${mergedDoc.uploadedAt || 'Belirtilmedi'}</small>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn-xs-doc" style="background:#0284c7; color:#fff; padding:6px 12px; font-size:12px;" onclick="viewStaffBuildingDoc('${app.id}', 'mergedUnitsDoc')">
                👁️ Önizle
              </button>
              <button type="button" class="btn-xs-doc" style="background:#15803d; color:#fff; padding:6px 12px; font-size:12px;" onclick="downloadStaffBuildingDoc('${app.id}', 'mergedUnitsDoc')">
                📥 İndir
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

async function viewStaffBuildingDoc(appId, type) {
  const app = applicationsList.find(a => a.id === appId);
  if (!app) return;
  const doc = (app.buildingDocs && app.buildingDocs[type]) || (type === 'mergedUnitsDoc' ? app.mergedUnitsDoc : null);
  if (!doc) {
    showToast("Görüntülenecek belge bulunamadı.", "warning");
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
      } catch(e) {}
    }
  }
  if (!viewUrl) viewUrl = doc.dataUrl;

  const sizeStr = doc.size ? (doc.size > 1024 * 1024 ? (doc.size / (1024 * 1024)).toFixed(2) + " MB" : (doc.size / 1024).toFixed(1) + " KB") : "Bilinmiyor";
  if (subEl) {
    subEl.innerText = `Dosya No: ${app.appNo} • Müteahhit: ${app.company.name} • Boyut: ${sizeStr} • Yükleme: ${doc.uploadedAt || 'Belirtilmedi'}`;
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
        <button type="button" class="yb-btn yb-btn-primary" onclick="downloadStaffBuildingDoc('${app.id}', '${type}')">📥 Dosyayı İndir</button>
      </div>
    `;
  }

  if (dlBtn) {
    dlBtn.onclick = () => downloadStaffBuildingDoc(app.id, type);
  }

  modal.style.display = "flex";
}

async function downloadStaffBuildingDoc(appId, type) {
  const app = applicationsList.find(a => a.id === appId);
  if (!app) return;
  const doc = (app.buildingDocs && app.buildingDocs[type]) || (type === 'mergedUnitsDoc' ? app.mergedUnitsDoc : null);
  if (!doc) {
    showToast("İndirilecek belge bulunamadı.", "warning");
    return;
  }
  let dataUrl = doc.dataUrl;
  if ((!dataUrl || dataUrl === VALID_MINIMAL_PDF) && doc.docKey) {
    dataUrl = window.YB_DOC_STORE[doc.docKey] || sessionStorage.getItem(doc.docKey);
    if (!dataUrl) {
      try {
        const fromDb = await getDocFromDB(doc.docKey);
        if (fromDb) dataUrl = fromDb;
      } catch(e) {}
    }
  }
  if (!dataUrl) dataUrl = doc.dataUrl || VALID_MINIMAL_PDF;

  const defaultNames = {
    contracts: `${app.appNo}_Toplu_Yapim_Sozlesmesi.pdf`,
    proxies: `${app.appNo}_Toplu_Vekaletnameler.pdf`,
    mergedUnitsDoc: `${app.appNo}_Birlestirilmis_Daire_Evraklari.pdf`
  };

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = doc.name || defaultNames[type] || 'Evrak.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast(`📥 "${doc.name}" indiriliyor...`, "info");
}

function requestDocInChat(docName) {
  openRevisionChatModal();
  const inputEl = document.getElementById("chat-modal-input-text");
  if (inputEl) {
    inputEl.value = `Bina geneline ait "${docName}" dosyası eksiktir / sistemde bulunmamaktadır. Lütfen resmi onaylı geçerli evrakı 5. Adımdan sisteme yükleyerek dosyanızı revize ediniz.`;
    inputEl.focus();
  }
}

function closeDetailView() {
  const detailSec = document.getElementById("selected-application-detail");
  if (detailSec) detailSec.style.display = "none";
  const poolCard = document.getElementById("staff-pool-overview-card");
  if (poolCard) poolCard.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
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
  app.lastUpdated = Date.now();

  if (newStatus === "onaylandi") {
    app.approvedAt = new Date().toLocaleDateString("tr-TR") + " " + new Date().toLocaleTimeString("tr-TR", { hour: '2-digit', minute: '2-digit' });
    app.approvedBy = currentStaff ? currentStaff.name : "Kentsel Dönüşüm Yetkilisi";
    app.isRevised = false;
  }

  // 1. Doğrudan localStorage listesini güncelle
  try {
    safeSetLocalStorage("yb_applications_list", sanitizeForStorage(applicationsList));
    lastCheckedAppsHash = localStorage.getItem("yb_applications_list") || "";
  } catch (e) {}

  // 2. yb_last_submitted_app kopyasını da güncelle
  try {
    const rawLast = localStorage.getItem("yb_last_submitted_app");
    if (rawLast) {
      const lastApp = JSON.parse(rawLast);
      if (lastApp && (lastApp.id === app.id || lastApp.appNo === app.appNo)) {
        lastApp.status = newStatus;
        lastApp.lastUpdated = Date.now();
        lastApp.isRevised = false;
        if (newStatus === "onaylandi") {
          lastApp.approvedAt = app.approvedAt;
          lastApp.approvedBy = app.approvedBy;
        }
        safeSetLocalStorage("yb_last_submitted_app", sanitizeForStorage(lastApp));
        lastCheckedSubmittedHash = localStorage.getItem("yb_last_submitted_app") || "";
      }
    }
  } catch (e) {}

  saveDataToStorage();
  renderApplicationsPool();
  openApplicationDetail(selectedAppId);

  // Müteahhit ve diğer açık pencerelere derhal haber ver
  try {
    window.dispatchEvent(new Event("storage"));
  } catch (e) {}

  if (newStatus === "onaylandi") {
    showToast(`"${app.appNo}" başarıyla ONAYLANDI ve ARAAD'a Gönderildi olarak kaydedildi!`, "success");
  } else {
    showToast(`"${app.appNo}" dosya durumu güncellendi: ${newStatus}`, "info");
  }
}

// --- KAYITLI MÜTEAHHİTLER LİSTESİ ---
function renderRegisteredContractorsList() {
  const tbody = document.getElementById("registered-contractors-tbody");
  const badge = document.getElementById("contractors-stats-badge");
  const countBadge = document.getElementById("subtab-contractors-count");
  if (!tbody) return;

  if (contractorsListIsEmpty()) {
    seedDefaultContractor();
  }

  if (countBadge) countBadge.innerText = contractorUsers.length;
  if (badge) badge.innerText = `${contractorUsers.length} Firma Kayıtlı`;

  tbody.innerHTML = "";

  contractorUsers.forEach(user => {
    const userApps = applicationsList.filter(a =>
      (a.submittedByEmail && a.submittedByEmail.toLowerCase() === user.email.toLowerCase()) ||
      (a.company && a.company.repEmail && a.company.repEmail.toLowerCase() === user.email.toLowerCase())
    );
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><strong>${escapeHtml(user.companyName)}</strong></td>
      <td>${escapeHtml(user.repName)}</td>
      <td class="font-mono">${escapeHtml(user.email)}</td>
      <td class="font-mono">${escapeHtml(user.phone)}</td>
      <td>${escapeHtml(user.registeredAt || '20.10.2024')}</td>
      <td class="text-center">
        <button type="button" class="btn-action-sm" onclick="openContractorApplicationsModal('${escapeHtml(user.email)}')" style="background:#eff6ff; color:#1e40af; border:1.5px solid #bfdbfe; font-weight:700; cursor:pointer;" title="Tıklayarak bu müteahhide ait tüm başvuru dosyalarını ve geçmişini inceleyin">
          📂 ${userApps.length} Başvuru Dosyası
        </button>
      </td>
      <td class="text-center">
        <span class="badge-status-pill" style="background:#dcfce7; color:#15803d;">Aktif Hesap</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// --- MÜTEAHHİT BAŞVURU GEÇMİŞİ MODALI ---
function openContractorApplicationsModal(email) {
  const modal = document.getElementById("contractor-applications-modal");
  if (!modal) return;

  const user = contractorUsers.find(u => u.email.toLowerCase() === email.toLowerCase()) || {
    companyName: "Kayıtlı Firma",
    repName: "-",
    email: email,
    phone: "-"
  };

  const userApps = applicationsList.filter(a =>
    (a.submittedByEmail && a.submittedByEmail.toLowerCase() === email.toLowerCase()) ||
    (a.company && a.company.repEmail && a.company.repEmail.toLowerCase() === email.toLowerCase())
  );

  document.getElementById("cam-company-name").innerText = user.companyName;
  document.getElementById("cam-apps-badge").innerText = `${userApps.length} Dosya Gönderildi`;
  document.getElementById("cam-company-meta").innerHTML = `Yetkili: <strong>${escapeHtml(user.repName)}</strong> &bull; E-Posta: <span class="font-mono" style="color:#0369a1;">${escapeHtml(user.email)}</span> &bull; Tel: <span class="font-mono">${escapeHtml(user.phone || '-')}</span>`;

  const tbody = document.getElementById("cam-applications-list");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (userApps.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:24px; color:#94a3b8; font-size:13px;">
          Bu firma tarafından henüz gönderilmiş bir başvuru dosyası bulunmuyor.
        </td>
      </tr>
    `;
  } else {
    userApps.forEach(app => {
      const tr = document.createElement("tr");

      let statusHtml = "";
      if (app.status === "onaylandi") {
        statusHtml = '<span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800;">✔ Onaylandı (ARAAD\'a Gönderildi)</span>';
      } else if (app.status === "revize_edildi") {
        statusHtml = '<span class="badge-status-pill" style="background:#fffbeb; color:#92400e; font-weight:800; border:1px solid #f59e0b;">🔄 Revize Edildi (İnceleniyor)</span>';
      } else if (app.status === "revizyon") {
        statusHtml = '<span class="badge-status-pill" style="background:#fee2e2; color:#b91c1c; font-weight:800;">⚠️ Revizyon İstendi</span>';
      } else if (app.status === "inceleniyor") {
        statusHtml = `<span class="badge-status-pill" style="background:#fef3c7; color:#92400e; font-weight:800;">🔍 ${escapeHtml(app.claimedBy ? app.claimedBy.name : 'İnceleniyor')}</span>`;
      } else {
        statusHtml = '<span class="badge-status-pill" style="background:#dbeafe; color:#1e40af; font-weight:800;">📥 Havuzda Bekliyor</span>';
      }

      const totalDocs = (app.owners || []).length;
      const attachedDocs = (app.owners || []).filter(u => u.attachedDoc).length;
      const docsBadge = attachedDocs === totalDocs && totalDocs > 0
        ? `<span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-size:11px;">✅ ${attachedDocs}/${totalDocs} Eksiksiz</span>`
        : `<span class="badge-status-pill" style="background:#fee2e2; color:#b91c1c; font-size:11px;">⚠️ ${attachedDocs}/${totalDocs} Yüklendi</span>`;

      tr.innerHTML = `
        <td class="font-mono" style="font-weight:700; color:#0f172a;">${escapeHtml(app.appNo)}</td>
        <td>${escapeHtml(app.submissionDate || '-')}</td>
        <td>
          <strong>${escapeHtml(app.cadastre ? parseAdaParsel(app.cadastre.oldAdaParsel).displayText : '')}</strong>
          <small style="display:block; color:#64748b;">${escapeHtml(app.cadastre ? app.cadastre.neighborhood : '')}</small>
        </td>
        <td class="text-center font-mono"><strong>${totalDocs}</strong> Daire</td>
        <td class="text-center">${statusHtml}</td>
        <td class="text-center">${docsBadge}</td>
        <td class="text-center">
          <div style="display:inline-flex; gap:6px;">
            <button type="button" class="btn-action-sm btn-primary-sm" onclick="closeContractorAppsModal(); switchStaffSubTab('pool'); openApplicationDetail('${app.id}');" style="padding:4px 10px; font-size:12px; font-weight:700;">
              📂 İncele
            </button>
            <button type="button" class="btn-action-sm" onclick="adminDeleteApplication('${app.id}', '${escapeHtml(app.appNo)}'); openContractorApplicationsModal('${escapeHtml(user.email)}');"
              style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:4px 8px; font-size:12px; font-weight:700;" title="Sil">
              🗑️
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  modal.style.display = "flex";
}

function closeContractorAppsModal() {
  const modal = document.getElementById("contractor-applications-modal");
  if (modal) modal.style.display = "none";
}

function contractorsListIsEmpty() {
  return !contractorUsers || contractorUsers.length === 0;
}

function seedDefaultContractor() {
  contractorUsers = [
    {
      id: "user_demo",
      companyName: "Güngören Prestij Yapı ve İnşaat Ltd. Şti.",
      repName: "Mustafa Güven",
      email: "ornek@insaat.com",
      password: "123456",
      phone: "5354442211",
      registeredAt: "20.10.2024"
    }
  ];
  saveDataToStorage();
}

// =========================================================================
// RESMİ EXCEL İNDİRME (.CSV / .XLS) - TARİHE DÖNÜŞME HATASI KESİNLİKLE YOK
// =========================================================================
function exportOfficialExcel() {
  if (!selectedAppId) return;
  const app = applicationsList.find(a => a.id === selectedAppId);
  if (!app) return;

  let content = "\uFEFF"; // UTF-8 BOM

  // 1. BLOK: ŞİRKET BİLGİLERİ
  content += "Sirket Unvani;Vergi Numarasi;Yeni Ada;Yeni Parsel;Yeni Projede Siginak M2;Yeni Projede Otopark M2\n";
  content += `"${app.company.name}";="${app.company.taxNo}";"${app.cadastre.newAdaParsel}";"${app.cadastre.oldAdaParsel}";"${app.cadastre.shelterM2 || 0}";"${app.cadastre.parkingM2 || 0}"\n\n`;

  // 2. BLOK: ŞİRKET BANKA VE YETKİLİ DETAYLARI
  content += "Emlak Katilim Bankasi IBAN;Sirket Yetkili TC;Sirket Yetkilisi Ad/Soyad;Yetkili Dogum Tarihi;Yetkili E-Posta;Yetkili Cep Telefonu;Sirket Tebligat Adresi\n";
  content += `="${app.company.iban}";="${app.company.repTc}";"${app.company.repName}";"${app.company.repBirth || ''}";"${app.company.repEmail || ''}";="${app.company.repPhone}";"${app.company.address}"\n\n`;

  // 3. BLOK: HAK SAHİPLERİ TABLOSU
  content += "TC;TELEFON;AD;SOYAD;DOGUM TARIHI;MALIK ADRESI;NITELIGI;KAT;BAGIMSIZ BOLUM;HISSE\n";

  (app.owners || []).forEach(u => {
    content += `="${u.tc}";="${u.phone}";"${u.firstName}";"${u.lastName}";"${u.birthDate}";"${u.ownerAddress}";"${u.type}";"${u.floor}";"${u.oldUnitNo}";="${u.shareNum}/${u.shareDenom}"\n`;
  });

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Gungoren_Yarisi_Bizden_${app.appNo}_Hak_Sahipligi_Listesi.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  showToast("Resmi Hak Sahipliği Excel tablosu (Hisseler korumalı) indirildi!", "success");
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

  (app.owners || []).forEach(u => {
    text += `${u.oldUnitNo} | ${u.floor} | ${u.type} | ${u.tc} | ${u.birthDate} | ${u.firstName} ${u.lastName} | ${u.phone} | ${u.shareNum}/${u.shareDenom}\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast("Tüm binanın ARAAD özet tablosu panoya kopyalandı!", "success");
  });
}

// --- REVİZYON & MESAJLAŞMA MODALI ---
function openRevisionChatModal() {
  if (!selectedAppId) return;
  const app = applicationsList.find(a => a.id === selectedAppId);
  if (!app) return;

  activeChatAppId = selectedAppId;

  document.getElementById("chat-modal-app-no").innerText = app.appNo;
  document.getElementById("chat-modal-company-name").innerText = app.company.name;
  document.getElementById("chat-modal-email").innerText = app.submittedByEmail || app.company.repEmail;

  renderChatMessages(app);
  document.getElementById("revision-chat-modal").style.display = "flex";
}

function closeRevisionChatModal() {
  document.getElementById("revision-chat-modal").style.display = "none";
}

function renderChatMessages(app) {
  const container = document.getElementById("chat-modal-messages-container");
  container.innerHTML = "";

  if (!app.messages || app.messages.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: #94a3b8; font-size: 13px; padding: 24px 0;">
        Henüz mesaj veya revizyon notu bulunmamaktadır.
      </div>
    `;
    return;
  }

  app.messages.forEach(msg => {
    const isStaff = msg.senderRole === "staff";
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${isStaff ? 'chat-bubble-staff' : 'chat-bubble-contractor'}`;

    bubble.innerHTML = `
      <div class="cb-header">
        <strong>${escapeHtml(msg.sender)}</strong>
        <span>${escapeHtml(msg.time)}</span>
      </div>
      <div class="cb-text">${escapeHtml(msg.text)}</div>
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
    showToast("Lütfen iletmek istediğiniz mesajı yazınız.", "warning");
    return;
  }

  if (!app.messages) app.messages = [];

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} - ${now.toLocaleDateString('tr-TR')}`;

  app.messages.push({
    sender: currentStaff.name,
    senderRole: "staff",
    text: text,
    time: timeStr
  });

  app.status = "revizyon";
  safeSetLocalStorage("yb_last_submitted_app", sanitizeForStorage(app));
  saveDataToStorage();
  renderChatMessages(app);
  renderApplicationsPool();
  openApplicationDetail(activeChatAppId);

  input.value = "";
  showToast("Revizyon mesajınız müteahhit portalına iletildi ve dosya işaretlendi!", "success");
}

// --- EVRAK İNCELEME & KONTROL MASASI (YETKİLİ DOSYA YÜKLEMEZ, İNCELER) ---
function openUnitDocModal(source, appId, optIdx) {
  const app = applicationsList.find(a => a.id === appId);
  if (!app || !app.owners[optIdx]) return;
  const owner = app.owners[optIdx];

  activeMergerContext = { source: "staff", app, owner, index: optIdx, appId };

  const unitBadge = document.getElementById("merger-modal-unit-badge");
  const subText = document.getElementById("merger-modal-sub");
  const ownerNameEl = document.getElementById("rev-owner-name");
  const ownerTcEl = document.getElementById("rev-owner-tc-phone");
  const ownerUnitShareEl = document.getElementById("rev-owner-unit-share");
  const ownerProxyEl = document.getElementById("rev-owner-proxy-status");
  const emlakNoteEl = document.getElementById("rev-emlak-note");

  if (unitBadge) unitBadge.innerText = `${owner.oldUnitNo}.B.B.pdf`;
  if (subText) subText.innerText = `Bağımsız Bölüm No: ${owner.oldUnitNo} &bull; ${owner.firstName || ''} ${owner.lastName || 'Malik'} Evrakları`;
  if (ownerNameEl) ownerNameEl.innerText = `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || "Malik Adı Soyadı";
  if (ownerTcEl) ownerTcEl.innerText = `T.C: ${owner.tc || '-'} &bull; Tel: 0${owner.phone || '-'}`;
  if (ownerUnitShareEl) ownerUnitShareEl.innerText = `${owner.floor || '-'} / ${owner.type || '-'} (Hisse: ${owner.shareNum || 1}/${owner.shareDenom || 1})`;

  if (ownerProxyEl) {
    if (owner.hasProxy) {
      ownerProxyEl.innerHTML = `<span style="color:#059669; font-weight:700;">✓ Noter Vekaletli (TCKN: ${owner.proxyTc || '-'}, VK: ${owner.proxyName || '-'})</span>`;
    } else {
      ownerProxyEl.innerHTML = `<span style="color:#d97706; font-weight:700;">⚠️ Noter Vekaleti Yok (Salı/Perşembe Belediye İmzası Gerekir)</span>`;
    }
  }

  if (emlakNoteEl) {
    const isDeedArsa = (owner.type || "").toLowerCase().includes("arsa") || (app.cadastre.oldAdaParsel || "").toLowerCase().includes("arsa");
    if (isDeedArsa) {
      emlakNoteEl.innerText = "Eski tapu arsa tapusu olduğu için Emlak Beyanı zorunludur.";
      emlakNoteEl.style.color = "#b91c1c";
    } else {
      emlakNoteEl.innerText = "Eski tapu kat irtifaklı/mülkiyetli olduğundan Emlak Beyanından muaftır.";
      emlakNoteEl.style.color = "#059669";
    }
  }

  // Dinamik olarak müteahhidin tek tek mi yoksa birleşik mi yüklediğini listele
  renderStaffUnitDocChecklist(app, owner, optIdx);

  const modal = document.getElementById("pdf-merger-modal");
  if (modal) modal.style.display = "flex";
}

function closeMergerModal() {
  const modal = document.getElementById("pdf-merger-modal");
  if (modal) modal.style.display = "none";
}

// MÜTEAHHİDİN YÜKLEDİĞİ EVRAKLARI (TEK TEK VEYA BİRLEŞİK) LİSTELEME
function renderStaffUnitDocChecklist(app, owner, optIdx) {
  const container = document.getElementById("rev-documents-checklist");
  const bottomBox = document.getElementById("rev-merged-summary-box");
  if (!container) return;

  const isIndividual = !!(owner.individualDocs && (owner.individualDocs.petition || owner.individualDocs.oldDeed || owner.individualDocs.newDeed || owner.individualDocs.idCard || owner.individualDocs.taxDecl));
  const isSingle = !!(owner.attachedDoc && (!owner.individualDocs || owner.uploadType === "single"));

  let html = "";

  if (isIndividual) {
    const docs = owner.individualDocs;
    html += `
      <div style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:10px; padding:12px 16px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:24px;">⚡</span>
          <div>
            <strong style="color:#15803d; font-size:13.5px;">Müteahhit 5 Evrakı Tek Tek Yükledi</strong>
            <span style="font-size:12px; color:#166534; display:block;">Evraklar sistem tarafından otomatik sıralanarak <strong>${escapeHtml(owner.attachedDoc?.name || `${owner.oldUnitNo}.B.B.pdf`)}</strong> oluşturuldu. Her belgeyi aşağıdan ayrı ayrı veya birleşik halini inceleyebilirsiniz.</span>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn-action-sm" style="background:#0284c7; color:#fff; font-weight:700;" onclick="viewOwnerAttachedDocDirectly('${app.id}', ${optIdx})">👁️ Birleştirilmiş PDF'i Gör</button>
          <button type="button" class="btn-action-sm" style="background:#15803d; color:#fff; font-weight:700;" onclick="downloadAttachedDoc('staff', '${app.id}', ${optIdx})">📥 Birleşik PDF'i İndir</button>
        </div>
      </div>
    `;

    // 1. DİLEKÇE
    const pet = docs.petition;
    html += `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="background:#0284c7; color:#fff; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">1</span>
          <div>
            <strong style="font-size:13px; color:#0f172a;">İmzalı EK-1 Malik Dilekçesi</strong>
            <span style="font-size:11px; color:#15803d; font-weight:600; display:block;">
              ${pet ? `✓ ${escapeHtml(pet.name)} (${(pet.size ? (pet.size/1024).toFixed(1) + ' KB' : 'PDF')})` : 'Sistem Resmi EK-1 Şablonu'}
            </span>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          ${pet ? `
            <button type="button" class="btn-action-sm btn-outline-primary" onclick="viewIndividualDoc('${app.id}', ${optIdx}, 'petition')">👁️ İncele</button>
            <button type="button" class="btn-action-sm btn-outline-success" onclick="downloadIndividualDoc('${app.id}', ${optIdx}, 'petition')">📥 İndir</button>
          ` : ''}
          <button type="button" class="btn-action-sm btn-outline-secondary" onclick="printSingleAppEK1('${app.id}', ${optIdx})">📄 Resmi EK-1</button>
        </div>
      </div>
    `;

    // 2. ESKİ TAPU
    const oldDeed = docs.oldDeed;
    html += `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="background:#0284c7; color:#fff; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">2</span>
          <div>
            <strong style="font-size:13px; color:#0f172a;">Eski Binaya Ait Tapu</strong>
            <span style="font-size:11px; color:${oldDeed ? '#15803d; font-weight:600;' : '#b91c1c;'}; display:block;">
              ${oldDeed ? `✓ ${escapeHtml(oldDeed.name)} (${(oldDeed.size ? (oldDeed.size/1024).toFixed(1) + ' KB' : '')})` : '⚠️ Yüklenmedi'}
            </span>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          ${oldDeed ? `
            <button type="button" class="btn-action-sm btn-outline-primary" onclick="viewIndividualDoc('${app.id}', ${optIdx}, 'oldDeed')">👁️ İncele</button>
            <button type="button" class="btn-action-sm btn-outline-success" onclick="downloadIndividualDoc('${app.id}', ${optIdx}, 'oldDeed')">📥 İndir</button>
          ` : `
            <button type="button" class="btn-action-sm btn-outline-info" onclick="openOfficialDocViewer('Eski Tapu')">👁️ Şablon İncele</button>
          `}
        </div>
      </div>
    `;

    // 3. YENİ TAPU
    const newDeed = docs.newDeed;
    html += `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="background:#0284c7; color:#fff; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">3</span>
          <div>
            <strong style="font-size:13px; color:#0f172a;">Yeni Binanın Kat İrtifaklı Tapusu</strong>
            <span style="font-size:11px; color:${newDeed ? '#15803d; font-weight:600;' : '#b91c1c;'}; display:block;">
              ${newDeed ? `✓ ${escapeHtml(newDeed.name)} (${(newDeed.size ? (newDeed.size/1024).toFixed(1) + ' KB' : '')})` : '⚠️ Yüklenmedi'}
            </span>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          ${newDeed ? `
            <button type="button" class="btn-action-sm btn-outline-primary" onclick="viewIndividualDoc('${app.id}', ${optIdx}, 'newDeed')">👁️ İncele</button>
            <button type="button" class="btn-action-sm btn-outline-success" onclick="downloadIndividualDoc('${app.id}', ${optIdx}, 'newDeed')">📥 İndir</button>
          ` : `
            <button type="button" class="btn-action-sm btn-outline-info" onclick="openOfficialDocViewer('Yeni Tapu')">👁️ Şablon İncele</button>
          `}
        </div>
      </div>
    `;

    // 4. KİMLİK
    const idCard = docs.idCard;
    html += `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="background:#0284c7; color:#fff; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">4</span>
          <div>
            <strong style="font-size:13px; color:#0f172a;">Malik T.C. Kimlik Fotokopisi</strong>
            <span style="font-size:11px; color:${idCard ? '#15803d; font-weight:600;' : '#b91c1c;'}; display:block;">
              ${idCard ? `✓ ${escapeHtml(idCard.name)} (${(idCard.size ? (idCard.size/1024).toFixed(1) + ' KB' : '')})` : '⚠️ Yüklenmedi'}
            </span>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          ${idCard ? `
            <button type="button" class="btn-action-sm btn-outline-primary" onclick="viewIndividualDoc('${app.id}', ${optIdx}, 'idCard')">👁️ İncele</button>
            <button type="button" class="btn-action-sm btn-outline-success" onclick="downloadIndividualDoc('${app.id}', ${optIdx}, 'idCard')">📥 İndir</button>
          ` : `
            <button type="button" class="btn-action-sm btn-outline-info" onclick="openOfficialDocViewer('Kimlik Fotokopisi')">👁️ Şablon İncele</button>
          `}
        </div>
      </div>
    `;

    // 5. EMLAK BEYANI
    const taxDecl = docs.taxDecl;
    const isArsa = (owner.type || "").toLowerCase().includes("arsa") || (app.cadastre?.oldAdaParsel || "").toLowerCase().includes("arsa");
    html += `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="background:#0284c7; color:#fff; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">5</span>
          <div>
            <strong style="font-size:13px; color:#0f172a;">Emlak Beyanı</strong>
            <span style="font-size:11px; color:${taxDecl ? '#15803d; font-weight:600;' : (isArsa ? '#b91c1c;' : '#64748b;')}; display:block;">
              ${taxDecl ? `✓ ${escapeHtml(taxDecl.name)} (${(taxDecl.size ? (taxDecl.size/1024).toFixed(1) + ' KB' : '')})` : (isArsa ? '⚠️ Zorunlu (Arsa Tapulu) - Henüz Yüklenmedi' : 'ℹ️ Eski tapu kat irtifaklı olduğundan muaftır')}
            </span>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          ${taxDecl ? `
            <button type="button" class="btn-action-sm btn-outline-primary" onclick="viewIndividualDoc('${app.id}', ${optIdx}, 'taxDecl')">👁️ İncele</button>
            <button type="button" class="btn-action-sm btn-outline-success" onclick="downloadIndividualDoc('${app.id}', ${optIdx}, 'taxDecl')">📥 İndir</button>
          ` : `
            <button type="button" class="btn-action-sm btn-outline-secondary" onclick="openOfficialDocViewer('Emlak Beyanı')">👁️ İncele</button>
          `}
        </div>
      </div>
    `;
  } else if (isSingle) {
    html += `
      <div style="background:#eff6ff; border:1.5px solid #93c5fd; border-radius:10px; padding:14px 18px; margin-bottom:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:26px;">📁</span>
            <div>
              <div style="font-weight:800; color:#1e40af; font-size:14px;">Müteahhit Birleştirilmiş Toplu PDF Olarak Yükledi</div>
              <div style="font-size:12px; color:#1e3a8a; margin-top:2px;">
                Dosya Adı: <strong>${escapeHtml(owner.attachedDoc.name || `${owner.oldUnitNo}.B.B.pdf`)}</strong> &bull; Boyut: <strong>${(owner.attachedDoc.size ? (owner.attachedDoc.size/1024).toFixed(1) + ' KB' : 'Belirtilmedi')}</strong> &bull; Yüklenme: ${owner.attachedDoc.uploadedAt || '-'}
              </div>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn-action-sm btn-primary-sm" style="background:#0284c7; color:#fff; font-weight:700;" onclick="viewOwnerAttachedDocDirectly('${app.id}', ${optIdx})">👁️ Toplu PDF'i İncele</button>
            <button type="button" class="btn-action-sm" style="background:#15803d; color:#fff; font-weight:700;" onclick="downloadAttachedDoc('staff', '${app.id}', ${optIdx})">📥 Dosyayı İndir</button>
          </div>
        </div>
        <p style="font-size:11.5px; color:#475569; margin:8px 0 0; border-top:1px dashed #bfdbfe; padding-top:6px;">
          ℹ️ Müteahhit firma 5 resmi evrakı (Dilekçe, Eski Tapu, Yeni Tapu, Kimlik, Emlak Beyanı) tek bir birleşik dosya olarak yüklemiştir. Tüm belgeler dosya içerisinde sırasıyla yer almaktadır.
        </p>
      </div>

      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="background:#0284c7; color:#fff; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">1</span>
            <div>
              <strong style="font-size:13px; color:#0f172a;">İmzalı EK-1 Malik Dilekçesi</strong>
              <span style="font-size:11px; color:#1e40af; display:block;">✓ Toplu PDF içerisinde yer almaktadır</span>
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn-action-sm btn-outline-primary" onclick="viewOwnerAttachedDocDirectly('${app.id}', ${optIdx})">👁️ Dosyada İncele</button>
            <button type="button" class="btn-action-sm btn-outline-secondary" onclick="printSingleAppEK1('${app.id}', ${optIdx})">📄 Sistem EK-1 Aç</button>
          </div>
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="background:#0284c7; color:#fff; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">2</span>
            <div>
              <strong style="font-size:13px; color:#0f172a;">Eski Binaya Ait Tapu</strong>
              <span style="font-size:11px; color:#1e40af; display:block;">✓ Toplu PDF içerisinde yer almaktadır</span>
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn-action-sm btn-outline-primary" onclick="viewOwnerAttachedDocDirectly('${app.id}', ${optIdx})">👁️ Dosyada İncele</button>
          </div>
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="background:#0284c7; color:#fff; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">3</span>
            <div>
              <strong style="font-size:13px; color:#0f172a;">Yeni Binanın Kat İrtifaklı Tapusu</strong>
              <span style="font-size:11px; color:#1e40af; display:block;">✓ Toplu PDF içerisinde yer almaktadır</span>
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn-action-sm btn-outline-primary" onclick="viewOwnerAttachedDocDirectly('${app.id}', ${optIdx})">👁️ Dosyada İncele</button>
          </div>
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="background:#0284c7; color:#fff; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">4</span>
            <div>
              <strong style="font-size:13px; color:#0f172a;">Malik T.C. Kimlik Fotokopisi</strong>
              <span style="font-size:11px; color:#1e40af; display:block;">✓ Toplu PDF içerisinde yer almaktadır</span>
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn-action-sm btn-outline-primary" onclick="viewOwnerAttachedDocDirectly('${app.id}', ${optIdx})">👁️ Dosyada İncele</button>
          </div>
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="background:#0284c7; color:#fff; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">5</span>
            <div>
              <strong style="font-size:13px; color:#0f172a;">Emlak Beyanı</strong>
              <span style="font-size:11px; color:#1e40af; display:block;">✓ Toplu PDF içerisinde (veya kat irtifakından muaf)</span>
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn-action-sm btn-outline-primary" onclick="viewOwnerAttachedDocDirectly('${app.id}', ${optIdx})">👁️ Dosyada İncele</button>
          </div>
        </div>
      </div>
    `;
  } else {
    html += `
      <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:14px; color:#b91c1c; font-weight:700; margin-bottom:12px; display:flex; align-items:center; gap:10px;">
        <span style="font-size:22px;">⚠️</span>
        <div>
          <div>Müteahhit bu bağımsız bölüm için henüz evrak yüklemedi.</div>
          <div style="font-size:11.5px; font-weight:500; color:#991b1b; margin-top:2px;">Eksiklik bildirmek için aşağıdaki revizyon butonunu kullanabilirsiniz.</div>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="background:#cbd5e1; color:#475569; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">1</span>
            <div>
              <strong style="font-size:13px; color:#0f172a;">İmzalı EK-1 Malik Dilekçesi</strong>
              <span style="font-size:11px; color:#b91c1c; display:block;">❌ Yüklenmedi</span>
            </div>
          </div>
          <button type="button" class="btn-action-sm btn-outline-secondary" onclick="printSingleAppEK1('${app.id}', ${optIdx})">📄 Sistem EK-1 Aç</button>
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="background:#cbd5e1; color:#475569; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">2</span>
            <div>
              <strong style="font-size:13px; color:#0f172a;">Eski Binaya Ait Tapu</strong>
              <span style="font-size:11px; color:#b91c1c; display:block;">❌ Yüklenmedi</span>
            </div>
          </div>
          <button type="button" class="btn-action-sm btn-outline-secondary" onclick="openOfficialDocViewer('Eski Tapu')">👁️ Şablon Föy</button>
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="background:#cbd5e1; color:#475569; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">3</span>
            <div>
              <strong style="font-size:13px; color:#0f172a;">Yeni Binanın Kat İrtifaklı Tapusu</strong>
              <span style="font-size:11px; color:#b91c1c; display:block;">❌ Yüklenmedi</span>
            </div>
          </div>
          <button type="button" class="btn-action-sm btn-outline-secondary" onclick="openOfficialDocViewer('Yeni Tapu')">👁️ Şablon Föy</button>
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="background:#cbd5e1; color:#475569; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">4</span>
            <div>
              <strong style="font-size:13px; color:#0f172a;">Malik T.C. Kimlik Fotokopisi</strong>
              <span style="font-size:11px; color:#b91c1c; display:block;">❌ Yüklenmedi</span>
            </div>
          </div>
          <button type="button" class="btn-action-sm btn-outline-secondary" onclick="openOfficialDocViewer('Kimlik Fotokopisi')">👁️ Şablon Föy</button>
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="background:#cbd5e1; color:#475569; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">5</span>
            <div>
              <strong style="font-size:13px; color:#0f172a;">Emlak Beyanı</strong>
              <span style="font-size:11px; color:#b91c1c; display:block;">❌ Yüklenmedi</span>
            </div>
          </div>
          <button type="button" class="btn-action-sm btn-outline-secondary" onclick="openOfficialDocViewer('Emlak Beyanı')">👁️ Şablon Föy</button>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  // Alt birleşik dosya kutusunu güncelle
  if (bottomBox) {
    if (owner.attachedDoc) {
      bottomBox.style.display = "flex";
      bottomBox.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:24px;">📦</span>
          <div>
            <strong style="font-size:13px; color:#1e40af;">${isIndividual ? 'Otomatik Birleştirilmiş Resmi Belge' : 'Müteahhit Birleştirilmiş Belgesi'} (${escapeHtml(owner.attachedDoc.name || `${owner.oldUnitNo}.B.B.pdf`)}):</strong>
            <p style="font-size:11.5px; color:#1e3a8a; margin:0;">
              ${isIndividual ? 'Yüklenen 5 evrak resmi kılavuza göre tek PDF haline birleştirildi.' : 'Müteahhidin yüklediği tek dosya halinde tüm evraklar.'} Boyut: ${(owner.attachedDoc.size ? (owner.attachedDoc.size/1024).toFixed(1) + ' KB' : 'Belirtilmedi')}
            </p>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn-action-sm" style="background:#0284c7; color:#fff; font-weight:700; padding:8px 14px;" onclick="viewOwnerAttachedDocDirectly('${app.id}', ${optIdx})">
            👁️ Birleşik Belgeyi İncele
          </button>
          <button type="button" class="btn-action-sm" style="background:#1e40af; color:#fff; font-weight:700; padding:8px 14px;" onclick="downloadAttachedDoc('staff', '${app.id}', ${optIdx})">
            📥 Dosyayı İndir
          </button>
        </div>
      `;
    } else {
      bottomBox.style.display = "none";
    }
  }
}

// TEKİL EVRAK GÖRÜNTÜLEYİCİ (MÜTEAHHİDİN YÜKLEDİĞİ TAPU, KİMLİK, DİLEKÇE VS.)
async function viewIndividualDoc(appId, optIdx, docKey) {
  const app = applicationsList.find(a => a.id === appId);
  if (!app || !app.owners[optIdx]) return;
  const owner = app.owners[optIdx];
  const docObj = owner.individualDocs ? owner.individualDocs[docKey] : null;
  if (!docObj) {
    showToast("Belge bulunamadı.", "warning");
    return;
  }

  activeMergerContext = { source: "staff", app, owner, index: optIdx, appId };
  const docTypeName = docObj.type || docKey;
  activePreviewDocType = `${owner.oldUnitNo}.B.B. - ${docTypeName}`;

  let viewUrl = docObj.dataUrl;
  if ((!viewUrl || viewUrl === VALID_MINIMAL_PDF) && docObj.docKey) {
    if (window.YB_DOC_STORE && window.YB_DOC_STORE[docObj.docKey]) {
      viewUrl = window.YB_DOC_STORE[docObj.docKey];
    } else {
      try {
        const fromDb = await getDocFromDB(docObj.docKey);
        if (fromDb) viewUrl = fromDb;
      } catch(e) {}
    }
  }

  const modal = document.getElementById("document-preview-modal");
  const titleEl = document.getElementById("doc-preview-modal-title");
  const subEl = document.getElementById("doc-preview-modal-sub");
  const bodyEl = document.getElementById("doc-preview-modal-body");

  if (!modal || !titleEl || !bodyEl) return;

  titleEl.innerText = `${owner.oldUnitNo} Nolu B.B. - ${docTypeName} (${docObj.name})`;
  if (subEl) {
    subEl.innerText = `Hak Sahibi: ${owner.firstName} ${owner.lastName} (T.C: ${owner.tc}) • Dosya Boyutu: ${(docObj.size ? (docObj.size/1024).toFixed(1) + ' KB' : 'Bilinmiyor')}`;
  }

  const isPdf = (docObj.name && docObj.name.toLowerCase().endsWith(".pdf")) || (viewUrl && viewUrl.startsWith("data:application/pdf"));

  if (viewUrl && viewUrl !== VALID_MINIMAL_PDF) {
    if (isPdf) {
      bodyEl.innerHTML = `
        <div style="text-align:center; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:10px 14px;">
          <span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:700;">
            ✓ Yüklenmiş Orijinal Belge (${escapeHtml(docObj.name)})
          </span>
          <button type="button" class="btn-action-sm btn-primary-sm" onclick="downloadIndividualDoc('${app.id}', ${optIdx}, '${docKey}')" style="background:#15803d; color:#fff; font-weight:700;">
            📥 Belgeyi İndir
          </button>
        </div>
        <iframe src="${viewUrl}" style="width:100%; height:550px; border:1px solid #cbd5e1; border-radius:8px; background:#fff;"></iframe>
      `;
    } else {
      bodyEl.innerHTML = `
        <div style="text-align:center; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:10px 14px;">
          <span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:700;">
            ✓ Yüklenmiş Görsel Belge (${escapeHtml(docObj.name)})
          </span>
          <button type="button" class="btn-action-sm btn-primary-sm" onclick="downloadIndividualDoc('${app.id}', ${optIdx}, '${docKey}')" style="background:#15803d; color:#fff; font-weight:700;">
            📥 Belgeyi İndir
          </button>
        </div>
        <div style="text-align:center; padding:10px;">
          <img src="${viewUrl}" style="max-width:100%; max-height:550px; border:1px solid #cbd5e1; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
        </div>
      `;
    }
  } else {
    bodyEl.innerHTML = `
      <div style="padding:28px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; text-align:center;">
        <div style="font-size:38px; margin-bottom:10px;">📄</div>
        <h4 style="margin:0 0 8px 0; color:#1e293b;">${escapeHtml(docObj.name || docTypeName)}</h4>
        <p style="font-size:13px; color:#64748b; margin:0 0 16px 0;">Dosya boyutu: ${(docObj.size ? (docObj.size / 1024).toFixed(1) + ' KB' : 'Bilinmiyor')} &bull; Sistemde kayıtlıdır.</p>
        <button type="button" class="btn-action-sm" onclick="downloadIndividualDoc('${app.id}', ${optIdx}, '${docKey}')" style="background:#15803d; color:#fff; font-weight:700; padding:8px 18px; border-radius:6px; cursor:pointer;">
          📥 Belgeyi İndir
        </button>
      </div>
    `;
  }

  modal.style.display = "flex";
}

// TEKİL EVRAK İNDİRİCİ
async function downloadIndividualDoc(appId, optIdx, docKey) {
  const app = applicationsList.find(a => a.id === appId);
  if (!app || !app.owners[optIdx]) return;
  const owner = app.owners[optIdx];
  const docObj = owner.individualDocs ? owner.individualDocs[docKey] : null;
  if (!docObj) {
    showToast("İndirilecek evrak bulunamadı.", "warning");
    return;
  }

  const fileName = docObj.name || `${owner.oldUnitNo}_${docKey}.pdf`;
  let fileUrl = docObj.dataUrl;
  if ((!fileUrl || fileUrl === VALID_MINIMAL_PDF) && docObj.docKey) {
    if (window.YB_DOC_STORE && window.YB_DOC_STORE[docObj.docKey]) {
      fileUrl = window.YB_DOC_STORE[docObj.docKey];
    } else {
      try {
        const fromDb = await getDocFromDB(docObj.docKey);
        if (fromDb) fileUrl = fromDb;
      } catch(e) {}
    }
  }

  if (fileUrl && fileUrl !== VALID_MINIMAL_PDF) {
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`✅ "${fileName}" belgesi indirildi.`, "success");
  } else {
    showToast("Belge indirilemedi.", "danger");
  }
}

function viewSimulatedDoc(docName) {
  if (!activeMergerContext || !activeMergerContext.owner) return;
  const { owner, app } = activeMergerContext;
  showToast(`"${owner.firstName} ${owner.lastName}" adına kayıtlı "${docName}" başarıyla açıldı ve incelendi.`, "info");
}

function downloadSingleBbPdf() {
  if (!activeMergerContext || !activeMergerContext.owner) return;
  const { owner, app } = activeMergerContext;

  // Gerçek dosya veya resmi özet PDF'i indir
  if (owner.attachedDoc && owner.attachedDoc.dataUrl) {
    const a = document.createElement("a");
    a.href = owner.attachedDoc.dataUrl;
    a.download = owner.attachedDoc.name || `${owner.oldUnitNo}.B.B.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`${owner.oldUnitNo}.B.B.pdf dosyası indirildi.`, "success");
  } else {
    // Müteahhidin yüklediği evrakları içeren resmi metin/dosya indirimi
    const content = `GÜNGÖREN BELEDİYESİ - YARISI BİZDEN DOSYA KONTROL
Dosya No: ${app.appNo}
Yapı Kimlik No: ${app.cadastre.ykn} | Ada/Parsel: ${app.cadastre.oldAdaParsel}
Bağımsız Bölüm: ${owner.oldUnitNo} (${owner.floor} - ${owner.type})
Hak Sahibi: ${owner.firstName} ${owner.lastName} (T.C: ${owner.tc} - Tel: 0${owner.phone})
Hisse Oranı: ${owner.shareNum}/${owner.shareDenom}
Vekalet Durumu: ${owner.hasProxy ? `Vekaletli (Vekil: ${owner.proxyName} - TCKN: ${owner.proxyTc})` : 'Salı/Perşembe Belediye İmzası'}

Bu bağımsız bölüme ait taranmış evraklar resmi sırada birleştirilmiştir.`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Gungoren_Yarisi_Bizden_${app.appNo}_${owner.oldUnitNo}.B.B.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`"${owner.oldUnitNo}.B.B.pdf" bağımsız bölüm evrak paketi indirildi.`, "success");
  }
}

function flagOwnerRevisionFromModal() {
  if (!activeMergerContext || !activeMergerContext.owner) return;
  const { owner, app } = activeMergerContext;
  closeMergerModal();
  openRevisionChatModal();

  const inputEl = document.getElementById("chat-modal-input-text");
  if (inputEl) {
    inputEl.value = `${owner.oldUnitNo} nolu Bağımsız Bölüm (${owner.firstName} ${owner.lastName}) evraklarında eksik/uyumsuzluk tespit edildi. Lütfen güncel ıslak imzalı evrakları sisteme yükleyiniz.`;
    inputEl.focus();
  }
}

function approveOwnerDocsFromModal() {
  if (!activeMergerContext || !activeMergerContext.owner) return;
  const { owner } = activeMergerContext;
  owner.docsApproved = true;
  saveDataToStorage();
  closeMergerModal();
  showToast(`✓ ${owner.oldUnitNo} nolu Bağımsız Bölüm evrakları uygun olarak işaretlendi.`, "success");
}

// --- YETKİLİ ESKİ BİNA KAT KESİTİ MODALI ---
function openStaffSchematicModal() {
  if (!selectedAppId) {
    showToast("Lütfen önce bir dosya seçiniz.", "warning");
    return;
  }
  const app = applicationsList.find(a => a.id === selectedAppId);
  if (!app) return;

  const target = document.getElementById("staff-schematic-svg-target");
  const modal = document.getElementById("staff-schematic-modal");
  const subEl = document.getElementById("staff-schematic-sub");

  if (subEl) {
    subEl.innerText = `Dosya: ${app.appNo} &bull; ${app.company.name} &bull; Ada/Parsel: ${app.cadastre.oldAdaParsel}`;
  }

  // Müteahhidin girdiği hak sahiplerinden şematik SVG üret
  if (target) {
    target.innerHTML = buildStaffSchematicSvg(app);
  }

  if (modal) modal.style.display = "flex";
}

function closeStaffSchematicModal() {
  const modal = document.getElementById("staff-schematic-modal");
  if (modal) modal.style.display = "none";
}

function buildStaffSchematicSvg(app) {
  const owners = app.owners || [];

  // Hak sahiplerini katlarına göre dinamik grupla (SADECE OLANLAR EKLENSİN)
  const basements = [];
  const grounds = [];
  const normalFloorMap = {}; // Kat No -> Birim listesi
  const otherUnits = [];

  owners.forEach((o, idx) => {
    const rawFloor = String(o.floor || "").toLowerCase().trim();
    const unitNo = o.oldUnitNo || String(idx + 1);
    const type = o.type || "Konut";
    const name = `${o.firstName || ''} ${o.lastName || ''}`.trim() || '............................';
    const isShop = type.toLowerCase().includes("dükkan") || type.toLowerCase().includes("ticari");
    const label = isShop ? `DÜKKAN NO (${unitNo})` : `KONUT NO: ${unitNo}`;
    const item = { unitNo, label, name, isShop, floorRaw: o.floor || "" };

    if (rawFloor.includes("bodrum") || rawFloor === "-1" || rawFloor === "-2") {
      basements.push(item);
    } else if (rawFloor.includes("zemin") || rawFloor === "0" || rawFloor.includes("giriş") || rawFloor.includes("bahçe")) {
      grounds.push(item);
    } else {
      const match = rawFloor.match(/\d+/);
      if (match) {
        const fNum = parseInt(match[0], 10);
        if (!normalFloorMap[fNum]) normalFloorMap[fNum] = [];
        normalFloorMap[fNum].push(item);
      } else {
        otherUnits.push(item);
      }
    }
  });

  // Eğer hiçbir malik girilmemişse varsayılan 1 zemin kat göster
  if (basements.length === 0 && grounds.length === 0 && Object.keys(normalFloorMap).length === 0 && otherUnits.length === 0) {
    grounds.push({ unitNo: "1", label: "BAĞIMSIZ BÖLÜM (1)", name: "............................", isShop: false });
  }

  // Normal kat numaralarını büyükten küçüğe sırala (en üst kat en üstte çizilir)
  const floorNumbers = Object.keys(normalFloorMap).map(Number).sort((a, b) => b - a);

  // Toplam çizilecek kat sayısı (sadece olan katlar!)
  let totalFloorCount = floorNumbers.length + (grounds.length > 0 ? 1 : 0) + (basements.length > 0 ? 1 : 0) + (otherUnits.length > 0 ? 1 : 0);
  totalFloorCount = Math.max(1, totalFloorCount);

  const floorHeight = 62;
  const frontWidth = 420;
  const leftPerspectiveWidth = 145;
  const startX = 180;
  const roofHeight = 110;
  const startY = 50 + roofHeight;
  const svgTotalHeight = startY + (totalFloorCount * floorHeight) + 90;
  const svgTotalWidth = 660;
  const skewY = -38;

  let svg = `
    <svg viewBox="0 0 ${svgTotalWidth} ${svgTotalHeight}" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; font-family:'Inter', Arial, sans-serif;">
      <!-- ÇATI -->
      <polygon points="${startX},${startY} ${startX - leftPerspectiveWidth},${startY + skewY} ${startX - leftPerspectiveWidth + 80},${startY + skewY - roofHeight + 15} ${startX + (frontWidth/2)},${startY - roofHeight + 15}"
               fill="#f8fafc" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round"/>
      <polygon points="${startX},${startY} ${startX + (frontWidth/2)},${startY - roofHeight + 15} ${startX + frontWidth},${startY}"
               fill="#eff6ff" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round"/>
      <line x1="${startX + (frontWidth/2)}" y1="${startY - roofHeight + 15}" x2="${startX + (frontWidth/2)}" y2="${startY}" stroke="#93c5fd" stroke-width="1.5" stroke-dasharray="3,3"/>
  `;

  let currentY = startY;

  // 1. DİĞER (ÖRN: ÇATI / DUBLEKS) BİRİMLER VARSA
  if (otherUnits.length > 0) {
    const floorLabel = "ÇATI / DUBLEKS";
    svg += `
      <polygon points="${startX},${currentY} ${startX - leftPerspectiveWidth},${currentY + skewY} ${startX - leftPerspectiveWidth},${currentY + skewY + floorHeight} ${startX},${currentY + floorHeight}"
               fill="#f8fafc" stroke="#2563eb" stroke-width="2"/>
      <text x="${startX - (leftPerspectiveWidth / 2) - 8}" y="${currentY + (floorHeight / 2) + (skewY / 2) + 4}"
            fill="#1e3a8a" font-size="11" font-weight="800" text-anchor="middle"
            transform="rotate(-15, ${startX - (leftPerspectiveWidth / 2)}, ${currentY + (floorHeight / 2) + (skewY / 2)})">
        ${floorLabel}
      </text>
    `;

    const colWidth = frontWidth / otherUnits.length;
    otherUnits.forEach((unit, c) => {
      const cellX = startX + (c * colWidth);
      svg += `
        <rect x="${cellX}" y="${currentY}" width="${colWidth}" height="${floorHeight}"
              fill="#ffffff" stroke="#2563eb" stroke-width="2"/>
        <text x="${cellX + (colWidth / 2)}" y="${currentY + 22}"
              fill="#0f172a" font-size="10.5" font-weight="600" text-anchor="middle">
          ${escapeHtml(unit.name)}
        </text>
        <text x="${cellX + (colWidth / 2)}" y="${currentY + 44}"
              fill="#1e40af" font-size="11" font-weight="800" text-anchor="middle">
          ${escapeHtml(unit.label)}
        </text>
      `;
    });
    currentY += floorHeight;
  }

  // 2. NORMAL KATLAR (SADECE DOSYADA GERÇEKTEN OLAN NORMAL KATLAR ÇİZİLİR)
  floorNumbers.forEach(fNum => {
    const floorUnits = normalFloorMap[fNum] || [];
    if (floorUnits.length === 0) return;

    const floorLabel = `${fNum} NO'LU KAT`;
    svg += `
      <polygon points="${startX},${currentY} ${startX - leftPerspectiveWidth},${currentY + skewY} ${startX - leftPerspectiveWidth},${currentY + skewY + floorHeight} ${startX},${currentY + floorHeight}"
               fill="#ffffff" stroke="#2563eb" stroke-width="2"/>
      <text x="${startX - (leftPerspectiveWidth / 2) - 8}" y="${currentY + (floorHeight / 2) + (skewY / 2) + 4}"
            fill="#1e3a8a" font-size="11.5" font-weight="800" text-anchor="middle"
            transform="rotate(-15, ${startX - (leftPerspectiveWidth / 2)}, ${currentY + (floorHeight / 2) + (skewY / 2)})">
        ${floorLabel}
      </text>
    `;

    const colWidth = frontWidth / floorUnits.length;
    floorUnits.forEach((unit, c) => {
      const cellX = startX + (c * colWidth);
      svg += `
        <rect x="${cellX}" y="${currentY}" width="${colWidth}" height="${floorHeight}"
              fill="#ffffff" stroke="#2563eb" stroke-width="2"/>
        <text x="${cellX + (colWidth / 2)}" y="${currentY + 22}"
              fill="#0f172a" font-size="10.5" font-weight="600" text-anchor="middle">
          ${escapeHtml(unit.name)}
        </text>
        <text x="${cellX + (colWidth / 2)}" y="${currentY + 44}"
              fill="#1e40af" font-size="11" font-weight="800" text-anchor="middle">
          ${escapeHtml(unit.label)}
        </text>
      `;
    });
    currentY += floorHeight;
  });

  // 3. ZEMİN KAT (SADECE DOSYADA ZEMİN BİRİMİ VARSA ÇİZİLİR)
  if (grounds.length > 0) {
    const floorLabel = "ZEMİN KAT";
    svg += `
      <polygon points="${startX},${currentY} ${startX - leftPerspectiveWidth},${currentY + skewY} ${startX - leftPerspectiveWidth},${currentY + skewY + floorHeight} ${startX},${currentY + floorHeight}"
               fill="#f8fafc" stroke="#2563eb" stroke-width="2"/>
      <text x="${startX - (leftPerspectiveWidth / 2) - 8}" y="${currentY + (floorHeight / 2) + (skewY / 2) + 4}"
            fill="#b45309" font-size="12" font-weight="800" text-anchor="middle"
            transform="rotate(-15, ${startX - (leftPerspectiveWidth / 2)}, ${currentY + (floorHeight / 2) + (skewY / 2)})">
        ${floorLabel}
      </text>
    `;

    const gColWidth = frontWidth / grounds.length;
    grounds.forEach((unit, c) => {
      const cellX = startX + (c * gColWidth);
      svg += `
        <rect x="${cellX}" y="${currentY}" width="${gColWidth}" height="${floorHeight}"
              fill="#fefce8" stroke="#2563eb" stroke-width="2"/>
        <text x="${cellX + (gColWidth / 2)}" y="${currentY + 22}"
              fill="#0f172a" font-size="10" font-weight="600" text-anchor="middle">
          ${escapeHtml(unit.name)}
        </text>
        <text x="${cellX + (gColWidth / 2)}" y="${currentY + 44}"
              fill="#854d0e" font-size="11" font-weight="800" text-anchor="middle">
          ${escapeHtml(unit.label)}
        </text>
      `;
    });
    currentY += floorHeight;
  }

  // 4. BODRUM KAT (SADECE DOSYADA BODRUM BİRİMİ VARSA ÇİZİLİR)
  if (basements.length > 0) {
    const floorLabel = "BODRUM KAT";
    svg += `
      <polygon points="${startX},${currentY} ${startX - leftPerspectiveWidth},${currentY + skewY} ${startX - leftPerspectiveWidth},${currentY + skewY + floorHeight} ${startX},${currentY + floorHeight}"
               fill="#f1f5f9" stroke="#2563eb" stroke-width="2"/>
      <text x="${startX - (leftPerspectiveWidth / 2) - 8}" y="${currentY + (floorHeight / 2) + (skewY / 2) + 4}"
            fill="#334155" font-size="11.5" font-weight="800" text-anchor="middle"
            transform="rotate(-15, ${startX - (leftPerspectiveWidth / 2)}, ${currentY + (floorHeight / 2) + (skewY / 2)})">
        ${floorLabel}
      </text>
    `;

    const bColWidth = frontWidth / basements.length;
    basements.forEach((unit, c) => {
      const cellX = startX + (c * bColWidth);
      svg += `
        <rect x="${cellX}" y="${currentY}" width="${bColWidth}" height="${floorHeight}"
              fill="#f1f5f9" stroke="#2563eb" stroke-width="2"/>
        <text x="${cellX + (bColWidth / 2)}" y="${currentY + 22}"
              fill="#0f172a" font-size="10.5" font-weight="600" text-anchor="middle">
          ${escapeHtml(unit.name)}
        </text>
        <text x="${cellX + (bColWidth / 2)}" y="${currentY + 44}"
              fill="#0f172a" font-size="11.5" font-weight="800" text-anchor="middle">
          ${escapeHtml(unit.label)}
        </text>
      `;
    });
    currentY += floorHeight;
  }

  // EN ALT RESMİ ADA PARSEL BİLGİSİ
  svg += `
      <line x1="${startX - leftPerspectiveWidth - 10}" y1="${currentY + 25}" x2="${startX + frontWidth + 20}" y2="${currentY + 25}"
            stroke="#1e3a8a" stroke-width="2"/>
      <text x="${startX + (frontWidth / 2) - 20}" y="${currentY + 48}"
            fill="#0f172a" font-size="13" font-weight="800" text-anchor="middle">
        ${escapeHtml(app.cadastre?.newAdaParsel || app.cadastre?.oldAdaParsel || '……')} Ada / Parsel (Eski ${escapeHtml(app.cadastre?.oldAdaParsel || '……')} Ada / Parsel)
      </text>
    </svg>
  `;

  return svg;
}

async function downloadAttachedDoc(source, appId, optIdx) {
  const app = applicationsList.find(a => a.id === appId);
  if (!app || !app.owners[optIdx]) return;
  const owner = app.owners[optIdx];

  const docName = (owner.attachedDoc && owner.attachedDoc.name) ? owner.attachedDoc.name : `${owner.oldUnitNo}.B.B.pdf`;
  const docKey = owner.attachedDoc ? owner.attachedDoc.docKey : null;

  let dlUrl = (docKey && window.YB_DOC_STORE && window.YB_DOC_STORE[docKey]) ? window.YB_DOC_STORE[docKey] : (owner.attachedDoc ? owner.attachedDoc.dataUrl : null);
  if ((!dlUrl || dlUrl === VALID_MINIMAL_PDF) && docKey) {
    try {
      const fromDb = await getDocFromDB(docKey);
      if (fromDb) dlUrl = fromDb;
    } catch(e) {}
  }

  if (dlUrl && dlUrl !== VALID_MINIMAL_PDF && !dlUrl.includes("...")) {
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = docName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`✅ "${docName}" dosyası başarıyla indirildi.`, "success");
    return;
  }

  // Veri URL'i yoksa resmi özet dosyası indir
  const content = `T.C. GÜNGÖREN BELEDİYE BAŞKANLIĞI
Kentsel Dönüşüm Müdürlüğü &bull; Yarısı Bizden Dosya İnceleme Masası

BAĞIMSIZ BÖLÜM RESMİ EVRAK DOSYASI: ${docName}
Dosya No: ${app.appNo}
Müteahhit: ${app.company.name}
Ada / Parsel: ${parseAdaParsel(app.cadastre.oldAdaParsel).displayText}
Adres: ${app.cadastre.address}
Bağımsız Bölüm: ${owner.oldUnitNo} nolu BB (${owner.floor} - ${owner.type})
Hak Sahibi: ${owner.firstName} ${owner.lastName} (T.C: ${owner.tc})
Vekalet / İmza: ${owner.hasProxy ? `Noter Vekilli (${owner.proxyName})` : `Asil İmza (Randevu: ${owner.appointmentDate || 'Salı/Perşembe'})`}

Dosya İçeriği (Resmi Kılavuz Sırası):
1. İmzalı EK-1 Malik Dilekçesi
2. Eski Binaya Ait Tapu
3. Yeni Binanın Kat İrtifaklı Tapusu
4. Malik Nüfus Cüzdanı Fotokopisi
5. Emlak Beyanı

Tarih: ${new Date().toLocaleDateString("tr-TR")}
Güngören Belediyesi Kentsel Dönüşüm Masası Onaylı Belgedir.`;

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${owner.oldUnitNo}_BB_Resmi_Evraklari.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast(`✅ "${owner.oldUnitNo}.B.B." resmi evrak föyü indirildi.`, "success");
}

// Doğrudan Evrak Görüntüleme & Önizleme
async function viewOwnerAttachedDocDirectly(appId, optIdx) {
  const app = applicationsList.find(a => a.id === appId);
  if (!app || !app.owners[optIdx]) return;
  const owner = app.owners[optIdx];
  activeMergerContext = { source: "staff", app, owner, index: optIdx, appId };
  activePreviewDocType = `${owner.oldUnitNo}.B.B. Evrak Dosyası`;

  const modal = document.getElementById("document-preview-modal");
  const titleEl = document.getElementById("doc-preview-modal-title");
  const subEl = document.getElementById("doc-preview-modal-sub");
  const bodyEl = document.getElementById("doc-preview-modal-body");

  if (!modal || !titleEl || !bodyEl) return;

  titleEl.innerText = `${owner.oldUnitNo} Nolu B.B. - Evrak Dosyası (${owner.attachedDoc ? owner.attachedDoc.name : 'Standart Evrak Föyü'})`;
  if (subEl) {
    subEl.innerText = `Hak Sahibi: ${owner.firstName} ${owner.lastName} (T.C: ${owner.tc}) • Dosya: ${app.appNo} • Ada/Parsel: ${parseAdaParsel(app.cadastre.oldAdaParsel).displayText}`;
  }

  const docKey = owner.attachedDoc ? owner.attachedDoc.docKey : null;
  let realFileUrl = (docKey && window.YB_DOC_STORE && window.YB_DOC_STORE[docKey]) ? window.YB_DOC_STORE[docKey] : (owner.attachedDoc ? owner.attachedDoc.dataUrl : null);
  if ((!realFileUrl || realFileUrl === VALID_MINIMAL_PDF) && docKey) {
    try {
      const fromDb = await getDocFromDB(docKey);
      if (fromDb) realFileUrl = fromDb;
    } catch(e) {}
  }

  if (realFileUrl && realFileUrl !== VALID_MINIMAL_PDF && !realFileUrl.includes("...")) {
    bodyEl.innerHTML = `
      <div style="text-align:center; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:10px 14px;">
        <span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:700;">
          ✓ Müteahhidin Yüklediği Orijinal Birleştirilmiş Belge (${escapeHtml(owner.attachedDoc?.name || `${owner.oldUnitNo}.B.B.pdf`)})
        </span>
        <button type="button" class="btn-action-sm btn-primary-sm" onclick="downloadAttachedDoc('staff', '${app.id}', ${optIdx})" style="background:#15803d; color:#fff; font-weight:700;">
          📥 Dosyayı İndir
        </button>
      </div>
      <iframe src="${realFileUrl}" style="width:100%; height:550px; border:1px solid #cbd5e1; border-radius:8px; background:#fff;"></iframe>
    `;
  } else {
    bodyEl.innerHTML = `
      <div style="margin-bottom:12px; background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
        <span style="color:#b45309; font-size:12.5px; font-weight:600;">
          ℹ️ Bu bağımsız bölüm için henüz taranmış dosya yüklenmemiştir. Resmi sistem bilgileri aşağıda derlenmiştir:
        </span>
        <button type="button" class="btn-action-sm btn-outline-info" onclick="downloadSingleBbPdf()">
          📥 Resmi Föyü İndir
        </button>
      </div>
      ${buildSimulatedOfficialDocumentHtml("Tüm Resmi Evraklar", owner, app)}
    `;
  }

  modal.style.display = "flex";
}

// Binaya Ait Tüm Evrakları Görme ve İndirme Modalı
function openAllBuildingDocsModal() {
  if (!selectedAppId) {
    showToast("Lütfen bir dosya seçiniz.", "warning");
    return;
  }
  const app = applicationsList.find(a => a.id === selectedAppId);
  if (!app) return;

  const modal = document.getElementById("all-docs-modal");
  const countBadge = document.getElementById("all-docs-count-badge");
  const subtitle = document.getElementById("all-docs-subtitle");
  const tbody = document.getElementById("all-docs-table-body");

  if (!modal || !tbody) return;

  const totalOwners = (app.owners || []).length;
  const attachedCount = (app.owners || []).filter(u => u.attachedDoc).length;

  if (countBadge) {
    countBadge.innerText = `${attachedCount} / ${totalOwners} Evrak Hazır`;
    countBadge.style.background = attachedCount === totalOwners ? "#dcfce7" : "#fffbeb";
    countBadge.style.color = attachedCount === totalOwners ? "#15803d" : "#b45309";
  }

  if (subtitle) {
    subtitle.innerHTML = `Dosya: <strong class="font-mono">${app.appNo}</strong> &bull; Müteahhit: <strong>${escapeHtml(app.company.name)}</strong> &bull; Ada/Parsel: <strong>${escapeHtml(parseAdaParsel(app.cadastre.oldAdaParsel).displayText)}</strong>`;
  }

  tbody.innerHTML = "";

  // Bina Geneli Toplu Sözleşmeler ve Vekaletnameler Varsa En Başa Ekle
  if (app.buildingDocs && typeof app.buildingDocs === "object") {
    if (app.buildingDocs.contracts) {
      const cDoc = app.buildingDocs.contracts;
      const tr = document.createElement("tr");
      tr.style.background = "#f0fdf4";
      tr.innerHTML = `
        <td style="font-weight:700; text-align:center;"><span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800;">BİNA</span></td>
        <td><strong>Bina Geneli</strong></td>
        <td><strong>Toplu Yapım / İnşaat Sözleşmesi</strong></td>
        <td class="font-mono">-</td>
        <td><span style="color:#059669; font-weight:700; font-size:11.5px;">✓ Resmi Sözleşme</span></td>
        <td><span class="doc-badge-success" style="font-size:11.5px;">✅ ${escapeHtml(cDoc.name || 'Sozlesme.pdf')}</span></td>
        <td class="text-center">
          <div style="display:flex; gap:6px; justify-content:center;">
            <button type="button" class="btn-xs-doc" style="background:#0284c7; color:#fff;" onclick="closeAllBuildingDocsModal(); viewStaffBuildingDoc('${app.id}', 'contracts');">👁️ Görüntüle</button>
            <button type="button" class="btn-xs-doc" style="background:#15803d; color:#fff;" onclick="downloadStaffBuildingDoc('${app.id}', 'contracts')">📥 İndir</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    }
    if (app.buildingDocs.proxies) {
      const pDoc = app.buildingDocs.proxies;
      const tr = document.createElement("tr");
      tr.style.background = "#f0fdf4";
      tr.innerHTML = `
        <td style="font-weight:700; text-align:center;"><span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800;">BİNA</span></td>
        <td><strong>Bina Geneli</strong></td>
        <td><strong>Toplu Noter Onaylı Vekaletnameler</strong></td>
        <td class="font-mono">-</td>
        <td><span style="color:#059669; font-weight:700; font-size:11.5px;">✓ Noter Vekaletleri</span></td>
        <td><span class="doc-badge-success" style="font-size:11.5px;">✅ ${escapeHtml(pDoc.name || 'Vekaletnameler.pdf')}</span></td>
        <td class="text-center">
          <div style="display:flex; gap:6px; justify-content:center;">
            <button type="button" class="btn-xs-doc" style="background:#0284c7; color:#fff;" onclick="closeAllBuildingDocsModal(); viewStaffBuildingDoc('${app.id}', 'proxies');">👁️ Görüntüle</button>
            <button type="button" class="btn-xs-doc" style="background:#15803d; color:#fff;" onclick="downloadStaffBuildingDoc('${app.id}', 'proxies')">📥 İndir</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    }
    const mDoc = app.buildingDocs.mergedUnitsDoc || app.mergedUnitsDoc;
    if (mDoc) {
      const trM = document.createElement("tr");
      trM.style.background = "#f0fdf4";
      trM.innerHTML = `
        <td style="font-weight:700; text-align:center;"><span class="badge-status-pill" style="background:#dcfce7; color:#15803d; font-weight:800;">TOPLU</span></td>
        <td><strong>Tüm Daireler</strong></td>
        <td><strong>Birleştirilmiş Daire Evrakları</strong></td>
        <td class="font-mono">-</td>
        <td><span style="color:#059669; font-weight:700; font-size:11.5px;">✓ Birleşik PDF</span></td>
        <td><span class="doc-badge-success" style="font-size:11.5px;">✅ ${escapeHtml(mDoc.name || 'Birlestirilmis_Daireler.pdf')}</span></td>
        <td class="text-center">
          <div style="display:flex; gap:6px; justify-content:center;">
            <button type="button" class="btn-xs-doc" style="background:#0284c7; color:#fff;" onclick="closeAllBuildingDocsModal(); viewStaffBuildingDoc('${app.id}', 'mergedUnitsDoc');">👁️ Görüntüle</button>
            <button type="button" class="btn-xs-doc" style="background:#15803d; color:#fff;" onclick="downloadStaffBuildingDoc('${app.id}', 'mergedUnitsDoc')">📥 İndir</button>
          </div>
        </td>
      `;
      tbody.appendChild(trM);
    }
  }

  const mDocGlobal = (app.buildingDocs && app.buildingDocs.mergedUnitsDoc) || app.mergedUnitsDoc;

  (app.owners || []).forEach((u, idx) => {
    const tr = document.createElement("tr");
    const hasDoc = !!u.attachedDoc;
    const isCoveredByMerged = !hasDoc && !!mDocGlobal;

    tr.innerHTML = `
      <td style="font-weight:700; text-align:center;">${escapeHtml(u.oldUnitNo)}</td>
      <td>${escapeHtml(u.floor)} / ${escapeHtml(u.type)}</td>
      <td><strong>${escapeHtml(u.firstName)} ${escapeHtml(u.lastName)}</strong></td>
      <td class="font-mono">${escapeHtml(u.tc)}</td>
      <td>
        ${u.hasProxy ? `
          <span style="color:#059669; font-weight:700; font-size:11.5px;">✓ Vekaletli (${escapeHtml((u.proxyName || '').split(' ')[0])})</span>
        ` : `
          <span style="color:#b45309; font-weight:700; font-size:11.5px;">✍️ Asil (${u.appointmentDate ? formatDateTr(u.appointmentDate) + ' ' + (u.appointmentDay || '') : 'Salı/Perşembe'})</span>
        `}
      </td>
      <td>
        ${hasDoc ? `
          <span class="doc-badge-success" style="font-size:11.5px;">✅ ${escapeHtml(u.attachedDoc.name || `${u.oldUnitNo}.B.B.pdf`)}</span>
        ` : (isCoveredByMerged ? `
          <span class="badge-status-pill" style="background:#ecfdf5; color:#065f46; font-size:11px; font-weight:700;">✅ Birleşik Dosyada Mevcut</span>
        ` : `
          <span style="color:#dc2626; font-size:11.5px; font-weight:700;">❌ Müteahhit Dosya Yüklemedi</span>
        `)}
      </td>
      <td class="text-center">
        <div style="display:flex; gap:6px; justify-content:center;">
          ${hasDoc ? `
            <button type="button" class="btn-xs-doc" style="background:#0284c7; color:#fff;" onclick="closeAllBuildingDocsModal(); viewOwnerAttachedDocDirectly('${app.id}', ${idx});">
              👁️ Görüntüle
            </button>
            <button type="button" class="btn-xs-doc" style="background:#15803d; color:#fff;" onclick="downloadAttachedDoc('staff', '${app.id}', ${idx})">
              📥 İndir
            </button>
          ` : (isCoveredByMerged ? `
            <button type="button" class="btn-xs-doc" style="background:#0284c7; color:#fff;" onclick="closeAllBuildingDocsModal(); viewStaffBuildingDoc('${app.id}', 'mergedUnitsDoc');">
              👁️ Birleşik Dosyayı Gör
            </button>
            <button type="button" class="btn-xs-doc" style="background:#15803d; color:#fff;" onclick="downloadStaffBuildingDoc('${app.id}', 'mergedUnitsDoc')">
              📥 İndir
            </button>
          ` : `
            <button type="button" class="btn-xs-doc" style="background:#fff1f2; color:#be123c; border:1px solid #fecdd3;" onclick="closeAllBuildingDocsModal(); requestDocInChat('${escapeHtml(u.oldUnitNo)}. BB Evrakları');" title="Müteahhitten evrak iste">
              💬 Evrak İste
            </button>
          `)}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  modal.style.display = "flex";
}

function closeAllBuildingDocsModal() {
  const modal = document.getElementById("all-docs-modal");
  if (modal) modal.style.display = "none";
}

function downloadAllBuildingDocs() {
  if (!selectedAppId) return;
  const app = applicationsList.find(a => a.id === selectedAppId);
  if (!app) return;

  const docs = (app.owners || []).filter(u => u.attachedDoc && u.attachedDoc.dataUrl);
  if (docs.length === 0) {
    showToast("Bu dosyada henüz indirilmeye hazır birleştirilmiş evrak bulunmamaktadır.", "warning");
    return;
  }

  showToast(`📦 Toplam ${docs.length} adet bağımsız bölüm evrakı sırayla indiriliyor...`, "info");
  docs.forEach((u, i) => {
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = u.attachedDoc.dataUrl;
      a.download = u.attachedDoc.name || `${u.oldUnitNo}.B.B.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, i * 350);
  });

  if (app.buildingDocs && app.buildingDocs.contracts && app.buildingDocs.contracts.dataUrl) {
    const cDoc = app.buildingDocs.contracts;
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = cDoc.dataUrl;
      a.download = cDoc.name || `${app.appNo}_Toplu_Insaat_Sozlesmesi.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, (docs.length + 1) * 350);
  }
  if (app.buildingDocs && app.buildingDocs.proxies && app.buildingDocs.proxies.dataUrl) {
    const pDoc = app.buildingDocs.proxies;
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = pDoc.dataUrl;
      a.download = pDoc.name || `${app.appNo}_Toplu_Vekaletnameler.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, (docs.length + 2) * 350);
  }
}

// --- BAŞLANGIÇ VERİSİ TOHUMLAMA ---
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
        { id: "o1", oldUnitNo: "1", floor: "Bodrum", type: "Ticari (Dükkan)", tc: "29481029384", phone: "5321112233", firstName: "Ahmet", lastName: "Yılmaz", birthDate: "14.05.1970", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Dükkan:1", shareNum: 1, shareDenom: 1 },
        { id: "o2", oldUnitNo: "2", floor: "Bodrum", type: "Ticari (Dükkan)", tc: "38592019485", phone: "5332223344", firstName: "Mehmet", lastName: "Kaya", birthDate: "20.10.1974", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Dükkan:2", shareNum: 1, shareDenom: 1 },
        { id: "o3", oldUnitNo: "3", floor: "Zemin", type: "Konut (Daire)", tc: "47693028596", phone: "5353334455", firstName: "Ayşe", lastName: "Demir", birthDate: "05.03.1978", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Daire:3", shareNum: 1, shareDenom: 1 },
        { id: "o4_1", oldUnitNo: "4", floor: "Zemin", type: "Konut (Daire)", tc: "58704139607", phone: "5424445566", firstName: "Fatma", lastName: "Şahin", birthDate: "12.08.1965", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Daire:4", shareNum: 3, shareDenom: 12 },
        { id: "o4_2", oldUnitNo: "4", floor: "Zemin", type: "Konut (Daire)", tc: "69815240718", phone: "5435556677", firstName: "Hasan", lastName: "Şahin", birthDate: "19.01.1988", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Daire:4", shareNum: 1, shareDenom: 12 },
        { id: "o5", oldUnitNo: "5", floor: "1.Kat", type: "Konut (Daire)", tc: "24360795263", phone: "5051234567", firstName: "Mustafa", lastName: "Koç", birthDate: "11.12.1960", ownerAddress: "Haznedar Mah. Bağcılar Cad. No:42 Daire:5", shareNum: 1, shareDenom: 1 }
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

// --- RESMİ KILAVUZ & NOTER METNİ MODAL KONTROLLERİ ---
function openRequiredDocumentsGuideModal() {
  const modal = document.getElementById("guide-modal");
  if (modal) modal.style.display = "flex";
  switchGuideTab(0);
}

function closeRequiredDocumentsGuideModal() {
  const modal = document.getElementById("guide-modal");
  if (modal) modal.style.display = "none";
}

function switchGuideTab(index) {
  for (let i = 0; i < 5; i++) {
    const btn = document.getElementById(`gtab-btn-${i}`);
    const content = document.getElementById(`guide-tab-content-${i}`);
    if (btn) btn.classList.toggle("active", i === index);
    if (content) content.style.display = i === index ? "block" : "none";
  }
}

function copyOfficialNotaryText(btnElement) {
  const notaryText = document.getElementById("official-notary-text");
  if (!notaryText) return;
  const textToCopy = notaryText.innerText.trim();

  navigator.clipboard.writeText(textToCopy).then(() => {
    const origText = btnElement ? btnElement.innerHTML : "";
    if (btnElement) {
      btnElement.innerHTML = "✅ Kopyalandı!";
      btnElement.style.background = "#15803d";
      btnElement.style.color = "#ffffff";
      setTimeout(() => {
        btnElement.innerHTML = origText;
        btnElement.style.background = "";
        btnElement.style.color = "";
      }, 2000);
    }
    showToast("Resmi noter vekalet metni panoya kopyalandı!", "success");
  }).catch(() => {
    showToast("Panoya kopyalanamadı, lütfen metni seçerek kopyalayınız.", "warning");
  });
}

// --- RESMİ EXCEL İNDİRME (.CSV / .XLS) ---
function exportOfficialExcel() {
  let app = null;
  if (selectedAppId) {
    app = applicationsList.find(a => a.id === selectedAppId);
  }
  if (!app) {
    downloadOfficialExcelTemplate();
    return;
  }

  let content = "\uFEFF"; // UTF-8 BOM

  // 1. BLOK: ŞİRKET BİLGİLERİ
  content += "Sirket Unvani;Vergi Numarasi;Yeni Ada;Yeni Parsel;Yeni Projede Siginak M2;Yeni Projede Otopark M2\n";
  content += `"${app.company.name}";="${app.company.taxNo}";"${app.cadastre.newAdaParsel}";"${app.cadastre.oldAdaParsel}";"${app.cadastre.shelterM2 || 0}";"${app.cadastre.parkingM2 || 0}"\n\n`;

  // 2. BLOK: ŞİRKET BANKA VE YETKİLİ DETAYLARI
  content += "Emlak Katilim Bankasi IBAN;Sirket Yetkili TC;Sirket Yetkilisi Ad/Soyad;Yetkili Dogum Tarihi;Yetkili E-Posta;Yetkili Cep Telefonu;Sirket Tebligat Adresi\n";
  content += `="${app.company.iban}";="${app.company.repTc}";"${app.company.repName}";"${app.company.repBirth || ''}";"${app.company.repEmail || ''}";="${app.company.repPhone}";"${app.company.address}"\n\n`;

  // 3. BLOK: HAK SAHİPLERİ TABLOSU (KULLANICININ İSTEDİĞİ RESMİ SIRA)
  content += "TC;AD;SOYAD;TELEFON;MALIK ADRESI;DOGUM TARIHI;HISSE (PAY/PAYDA);NITELIGI (DUKKAN/KONUT);KAT;BAGIMSIZ BOLUM NO;VEKALET DURUMU;VEKIL TCKN;VEKIL AD SOYAD\n";

  app.owners.forEach(u => {
    const proxyStatus = u.hasProxy ? "Vekaleten" : "Asil (Sali-Persembe Belediye Imzasi)";
    const pTc = u.hasProxy ? `="${u.proxyTc || ''}"` : '""';
    const pName = u.hasProxy ? `"${u.proxyName || ''}"` : '""';
    content += `="${u.tc}";"${u.firstName}";"${u.lastName}";="${u.phone}";"${u.ownerAddress}";"${u.birthDate}";="${u.shareNum}/${u.shareDenom}";"${u.type}";"${u.floor}";"${u.oldUnitNo}";"${proxyStatus}";${pTc};${pName}\n`;
  });

  // 4. BLOK: RESMİ KILAVUZ SAYFA 4 AÇIKLAMALARI
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

  showToast("Resmi Hak Sahipliği Excel tablosu (Hisseler tarihe dönüşmez, korumalı) indirildi!", "success");
}

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

// --- RESMİ EK-1 MALİK DİLEKÇESİ (KENTSEL DÖNÜŞÜM BAŞKANLIĞI RESMİ ŞABLONU) ---
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

  if (app && app.cadastre) {
    if (app.cadastre.ykn) ykn = String(app.cadastre.ykn).trim();
    if (app.cadastre.neighborhood) neighborhood = String(app.cadastre.neighborhood).trim();
    if (app.cadastre.address) streetAddress = String(app.cadastre.address).trim();
    let rawAdaParsel = (app.cadastre.oldAdaParsel || app.cadastre.newAdaParsel || "").trim();

    const parsed = parseAdaParsel(rawAdaParsel);
    oldAda = parsed.ada;
    oldParsel = parsed.parsel;
  }

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
    address: fullStandardAddress
  };
}

function buildExactEK1Html(data = null) {
  const ykn = (data && data.ykn && String(data.ykn).trim() && data.ykn !== "undefined") ? data.ykn : "………………….";
  const parsedCad = parseAdaParsel(data && (data.adaParsel || data.oldAdaParsel || (data.ada && data.parsel ? `${data.ada}/${data.parsel}` : data.ada || data.parsel)));
  const ada = parsedCad.ada;
  const parsel = parsedCad.parsel || (data && data.parsel && data.parsel !== "……" ? data.parsel : "………..");
  // Kullanıcı Kuralı: Dilekçedeki adres kısmında mutlaka yıkılan binaya ait standart proje adresi olmalıdır
  // Örn: "Merkez Mah. Sokullu Paşa Cad. No:65 Güngören / İSTANBUL"
  const standardBuildingAddress = (data && data.address && String(data.address).trim() && data.address !== "undefined")
    ? data.address
    : "Merkez Mah. Sokullu Paşa Cad. No:65 Güngören / İSTANBUL";
  const malikAddress = (data && (data.ownerAddress || data.malikAddress) && String(data.ownerAddress || data.malikAddress).trim() && (data.ownerAddress || data.malikAddress) !== "undefined")
    ? (data.ownerAddress || data.malikAddress)
    : standardBuildingAddress;
  const unitNo = (data && data.unitNo && String(data.unitNo).trim() && data.unitNo !== "undefined") ? data.unitNo : "…..";
  const dateStr = (data && data.date) ? data.date : "……/…./20…";
  const nameStr = (data && data.fullName && data.fullName.trim()) ? data.fullName : "Adı Soyadı";
  const tcStr = (data && data.tc) ? data.tc : "T.C. Kimlik No: …………………";
  // Sol alttaki iletişim adresi ve metindeki adres malikin kendi adresidir:
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

let staffCurrentEK1OwnerIndex = 0;
let staffCurrentEK1AppId = null;

function printOfficialEK1Modal(useBlankTemplate = false, onlyFirst = false) {
  let app = null;
  if (selectedAppId) {
    app = applicationsList.find(a => a.id === selectedAppId);
  } else if (staffCurrentEK1AppId) {
    app = applicationsList.find(a => a.id === staffCurrentEK1AppId);
  }
  if (!app && !useBlankTemplate) {
    showToast("Lütfen önce bir dosya seçiniz.", "warning");
    return;
  }

  const container = document.getElementById("ek1-dynamic-body");
  if (!container) return;
  container.innerHTML = "";

  if (useBlankTemplate || !app) {
    container.innerHTML = buildExactEK1Html(null);
  } else {
    const cad = extractCadastreValues(app);
    const targetOwner = (app.owners && app.owners[staffCurrentEK1OwnerIndex]) ? app.owners[staffCurrentEK1OwnerIndex] : (app.owners ? app.owners[0] : {});
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

function printSingleAppEK1(appId, idx) {
  staffCurrentEK1AppId = appId;
  staffCurrentEK1OwnerIndex = idx;
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
    ownerAddress: ownerAddr,
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

function printActiveOwnerEK1() {
  if (!activeMergerContext || !activeMergerContext.owner) {
    openBlankEK1Modal();
    return;
  }
  const { app, owner } = activeMergerContext;
  const container = document.getElementById("ek1-dynamic-body");
  if (!container) return;
  container.innerHTML = "";

  const data = {
    municipality: "GÜNGÖREN BELEDİYE BAŞKANLIĞINA",
    ykn: app.cadastre.ykn || "……………",
    ada: app.cadastre.oldAdaParsel ? app.cadastre.oldAdaParsel.split("/")[0]?.trim() : "……",
    parsel: app.cadastre.oldAdaParsel ? app.cadastre.oldAdaParsel.split("/")[1]?.trim() : "……",
    address: app.cadastre.address || "",
    unitNo: owner.oldUnitNo,
    date: new Date().toLocaleDateString("tr-TR"),
    fullName: `${owner.firstName} ${owner.lastName}`.trim(),
    tc: `T.C. Kimlik No: ${owner.tc}`,
    ownerAddress: owner.ownerAddress || app.cadastre.address,
    phone: owner.phone,
    hasProxy: !!owner.hasProxy,
    proxyTc: owner.proxyTc || "",
    proxyName: owner.proxyName || ""
  };

  container.innerHTML = buildExactEK1Html(data);
  document.getElementById("print-ek1-modal").style.display = "flex";
}

// =========================================================================
// YETKİLİ TAKİP: KAYITLI MÜTEAHHİT FİRMALAR & SİSTEME GİRİŞ DURUMLARI
// =========================================================================
function renderRegisteredContractorsList() {
  const tbody = document.getElementById("registered-contractors-tbody");
  if (!tbody) return;

  const countBadge = document.getElementById("subtab-contractors-count");
  const statsBadge = document.getElementById("contractors-stats-badge");

  // Güncel veriyi LocalStorage'dan tazele
  try {
    const rawUsers = localStorage.getItem("yb_contractor_users");
    if (rawUsers) contractorUsers = JSON.parse(rawUsers);
  } catch (e) {
    console.warn("Müteahhit listesi tazeleme uyarısı:", e);
  }

  tbody.innerHTML = "";

  if (!contractorUsers || contractorUsers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 30px; color: #64748b;">
          Sisteme kayıtlı müteahhit firma bulunamadı.
        </td>
      </tr>
    `;
    if (countBadge) countBadge.innerText = "0";
    if (statsBadge) statsBadge.innerText = "0 Firma Kayıtlı";
    return;
  }

  let loggedInCount = 0;

  contractorUsers.forEach(u => {
    // Müteahhidin sisteme ilettiği dosyaları havuzdan bul
    const matchingApps = applicationsList.filter(app => {
      const emailMatch = app.submittedByEmail && u.email && app.submittedByEmail.toLowerCase() === u.email.toLowerCase();
      const nameMatch = app.company && app.company.name && u.companyName &&
        app.company.name.toLowerCase().includes(u.companyName.toLowerCase().slice(0, 8));
      return emailMatch || nameMatch;
    });

    const hasLoggedIn = !!u.lastLoginAt;
    if (hasLoggedIn) loggedInCount++;

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <div style="font-weight: 700; color: #0f172a; font-size: 13.5px;">${escapeHtml(u.companyName || 'Müteahhit Firma')}</div>
        <div style="font-size: 11px; color: #64748b;">Hesap ID: ${escapeHtml(u.id || '-')}</div>
      </td>
      <td>
        <div style="font-weight: 600; color: #334155;">👤 ${escapeHtml(u.repName || '-')}</div>
      </td>
      <td>
        <div style="font-size: 12.5px; color: #0284c7; font-family: monospace;">✉️ ${escapeHtml(u.email || '-')}</div>
      </td>
      <td>
        <a href="tel:${escapeHtml(u.phone || '')}" style="color: #0f172a; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
          📞 0${escapeHtml(u.phone || '-')}
        </a>
      </td>
      <td style="color: #475569; font-size: 12.5px;">
        📅 ${escapeHtml(u.registeredAt || '-')}
      </td>
      <td class="text-center">
        ${matchingApps.length > 0 ? `
          <button type="button" class="btn-action-sm btn-outline-info" style="font-size: 11.5px; padding: 4px 10px;"
            onclick="switchStaffSubTab('pool'); openApplicationDetail('${matchingApps[0].id}')">
            📁 ${matchingApps.length} Başvuru Dosyası
          </button>
        ` : `
          <span style="color: #94a3b8; font-size: 12px; font-style: italic;">Henüz Dosya Yüklemedi</span>
        `}
      </td>
      <td class="text-center">
        ${hasLoggedIn ? `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
            <span class="badge-status-pill" style="background: #dcfce7; color: #15803d; font-weight: 700; font-size: 11.5px; border: 1px solid #86efac;">
              🟢 Giriş Yaptı
            </span>
            <span style="font-size: 10.5px; color: #475569;" title="Son Giriş Zamanı">
              🕒 ${escapeHtml(u.lastLoginAt)}
            </span>
            ${u.loginCount ? `<span style="font-size: 10px; color: #0284c7;">(${u.loginCount} kez girdi)</span>` : ''}
          </div>
        ` : `
          <span class="badge-status-pill" style="background: #f1f5f9; color: #64748b; font-weight: 600; font-size: 11.5px; border: 1px solid #cbd5e1;">
            ⚪ Henüz Giriş Yapmadı
          </span>
        `}
      </td>
    `;

    tbody.appendChild(tr);
  });

  if (countBadge) countBadge.innerText = String(contractorUsers.length);
  if (statsBadge) {
    statsBadge.innerText = `${contractorUsers.length} Firma Kayıtlı (${loggedInCount} Aktif Giriş Yapan)`;
  }
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

  setTimeout(() => {
    window.print();
  }, 150);
}


