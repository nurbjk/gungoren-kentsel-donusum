/**
 * =========================================================================
 * GÜNGÖREN BELEDİYESİ "YARISI BİZDEN" PORTALI
 * GOOGLE FIREBASE REALTIME CLOUD SYNCHRONIZATION ENGINE
 * =========================================================================
 * 
 * Bu modül, cep telefonundan, evden veya okuldan yapılan tüm müteahhit
 * kayıtlarını, başvuru dosyalarını ve inceleme güncellemelerini Google'ın
 * küresel Firebase Realtime Database bulutuna anlık olarak senkronize eder.
 * 
 * Farklı cihazlar (Telefon <-> PC <-> Başka Bilgisayarlar) arasında:
 * - Yeni müteahhit kayıtları
 * - Yeni "Yarısı Bizden" başvuru dosyaları
 * - Evrak güncellemeleri, randevular ve personel atamaları
 * saniyeler içinde otomatik olarak çift yönlü akar.
 */

(function () {
  "use strict";

  const FIREBASE_BASE_URL = "https://gungoren-proje-takip-default-rtdb.firebaseio.com";
  let _lastCloudUpdateTs = 0;
  let _isSyncing = false;
  let _pollIntervalId = null;
  let _lastKnownAppCount = 0;

  // Sesli bildirim için Web Audio API sentezleyicisi (harici dosya indirmeden yumuşak çift 'ding' çalar)
  function playNotificationChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // 1. Ton (880 Hz - A5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // 2. Ton (1318.5 Hz - E6)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1318.5, now + 0.15);
      gain2.gain.setValueAtTime(0.2, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.6);
    } catch (e) {
      // Ses engellendiyse sessizce geç
    }
  }

  // UI Rozetini Güncelle (Bulut Canlı / Eşitleniyor / Çevrimdışı)
  function updateCloudBadge(state, detailText) {
    const badges = document.querySelectorAll(".cloud-sync-badge-target");
    badges.forEach(badge => {
      if (!badge) return;
      if (state === "online") {
        badge.innerHTML = `
          <span style="display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; padding:4px 12px; border-radius:20px; background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; box-shadow:0 1px 3px rgba(16,185,129,0.2);">
            <span style="width:8px; height:8px; border-radius:50%; background:#10b981; display:inline-block; box-shadow:0 0 0 2px rgba(16,185,129,0.3);"></span>
            <span>Bulut Canlı (Firebase)</span>
          </span>
        `;
        badge.title = detailText || "Google Firebase Realtime Database bağlı. Cihazlar arası anlık senkronizasyon aktif.";
      } else if (state === "syncing") {
        badge.innerHTML = `
          <span style="display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; padding:4px 12px; border-radius:20px; background:#fef3c7; color:#92400e; border:1px solid #fde68a;">
            <span style="width:8px; height:8px; border-radius:50%; background:#f59e0b; display:inline-block;"></span>
            <span>Senkronize Ediliyor...</span>
          </span>
        `;
      } else {
        badge.innerHTML = `
          <span style="display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; padding:4px 12px; border-radius:20px; background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;">
            <span style="width:8px; height:8px; border-radius:50%; background:#94a3b8; display:inline-block;"></span>
            <span>Yerel Mod (Offline)</span>
          </span>
        `;
      }
    });
  }

  // --- API İSTEKLERİ ---
  async function fbGet(path) {
    const res = await fetch(`${FIREBASE_BASE_URL}${path}.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`Firebase GET ${path} hatası: ${res.statusText}`);
    return await res.json();
  }

  async function fbPut(path, data) {
    const res = await fetch(`${FIREBASE_BASE_URL}${path}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Firebase PUT ${path} hatası: ${res.statusText}`);
    return await res.json();
  }

  async function fbPatch(path, data) {
    const res = await fetch(`${FIREBASE_BASE_URL}${path}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Firebase PATCH ${path} hatası: ${res.statusText}`);
    return await res.json();
  }

  async function fbDelete(path) {
    const res = await fetch(`${FIREBASE_BASE_URL}${path}.json`, {
      method: "DELETE"
    });
    if (!res.ok) throw new Error(`Firebase DELETE ${path} hatası: ${res.statusText}`);
    return await res.json();
  }

  // Buluta meta güncelleme sinyali gönder
  async function touchCloudMeta(action = "update", extra = {}) {
    try {
      const now = Date.now();
      _lastCloudUpdateTs = now;
      await fbPut("/meta", {
        lastUpdateTs: now,
        lastAction: action,
        client: navigator.userAgent.includes("Mobile") ? "mobile" : "desktop",
        ...extra
      });
    } catch (e) {
      console.warn("Bulut meta sinyali iletilemedi:", e);
    }
  }

  // =========================================================================
  // ÇİFT YÖNLÜ SENKRONİZASYON (PULL & MERGE)
  // =========================================================================

  /**
   * Buluttan tüm verileri çeker ve yerel hafızayla akıllıca birleştirir.
   */
  async function pullFromCloud(isInitial = false) {
    if (_isSyncing) return;
    _isSyncing = true;
    updateCloudBadge("syncing");

    try {
      // 1. Meta kontrolü
      const meta = await fbGet("/meta");
      const cloudTs = meta && meta.lastUpdateTs ? Number(meta.lastUpdateTs) : 0;

      // 2. Buluttan Başvurular ve Müteahhitleri Çek
      const [cloudAppsRaw, cloudUsersRaw, cloudDeletedRaw] = await Promise.all([
        fbGet("/applications"),
        fbGet("/contractorUsers"),
        fbGet("/deletedAppIds")
      ]);

      const cloudApps = cloudAppsRaw ? (Array.isArray(cloudAppsRaw) ? cloudAppsRaw.filter(Boolean) : Object.values(cloudAppsRaw)) : [];
      const cloudUsers = cloudUsersRaw ? (Array.isArray(cloudUsersRaw) ? cloudUsersRaw.filter(Boolean) : Object.values(cloudUsersRaw)) : [];
      const cloudDeleted = Array.isArray(cloudDeletedRaw) ? cloudDeletedRaw : (cloudDeletedRaw ? Object.values(cloudDeletedRaw) : []);

      // Bulut tamamen boşsa ve ilk çalıştırmaysa, yereldeki hazır şablon ve kullanıcıları buluta tohumla (Seed)!
      if (isInitial && cloudApps.length === 0 && (!meta || !meta.lastUpdateTs)) {
        console.log("☁️ Firebase boş tespit edildi, yerel veriler buluta aktarılıyor...");
        await pushAllToCloud();
        _isSyncing = false;
        updateCloudBadge("online", "İlk kurulum tamamlandı. Veriler bulutta!");
        return;
      }

      // --- 3. BAŞVURULARI BİRLEŞTİR ---
      let localApps = [];
      try {
        const raw = localStorage.getItem("yb_applications_list");
        if (raw) localApps = JSON.parse(raw);
      } catch (e) { }

      let hasNewAppForYetkili = false;
      let newlyAddedAppName = "";

      const appMap = new Map();
      // Önce yereli haritaya al
      localApps.forEach(a => {
        if (a && a.id) appMap.set(String(a.id), a);
      });

      // Buluttaki verileri birleştir
      cloudApps.forEach(cA => {
        if (!cA || !cA.id) return;
        const sId = String(cA.id);

        if (cloudDeleted.includes(sId) || (cA.appNo && cloudDeleted.includes(cA.appNo))) {
          appMap.delete(sId);
          return;
        }

        if (!appMap.has(sId)) {
          // Yepyeni bir dosya geldi (başka bir cihazdan eklenmiş!)
          appMap.set(sId, cA);
          hasNewAppForYetkili = true;
          newlyAddedAppName = cA.appNo || (cA.contractor ? cA.contractor.companyName : "Yeni Başvuru");
        } else {
          // Mevcut dosya: hangisinin lastUpdated'i daha yeniyse onu al
          const localObj = appMap.get(sId);
          const cTime = cA.lastUpdated || 0;
          const lTime = localObj.lastUpdated || 0;
          if (cTime >= lTime) {
            appMap.set(sId, cA);
          }
        }
      });

      const mergedApps = Array.from(appMap.values());

      // --- 4. MÜTEAHHİTLERİ BİRLEŞTİR ---
      let localUsers = [];
      try {
        const raw = localStorage.getItem("yb_contractor_users");
        if (raw) localUsers = JSON.parse(raw);
      } catch (e) { }

      const userMap = new Map();
      localUsers.forEach(u => {
        if (u && (u.id || u.email)) userMap.set(String(u.id || u.email), u);
      });
      cloudUsers.forEach(cU => {
        if (cU && (cU.id || cU.email)) {
          userMap.set(String(cU.id || cU.email), cU);
        }
      });
      const mergedUsers = Array.from(userMap.values());

      // --- 5. YEREL HAFIZAYI VE EKRANI GÜNCELLE ---
      localStorage.setItem("yb_applications_list", JSON.stringify(mergedApps));
      localStorage.setItem("yb_contractor_users", JSON.stringify(mergedUsers));
      if (cloudDeleted.length > 0) {
        localStorage.setItem("yb_deleted_app_ids", JSON.stringify(cloudDeleted));
      }
      localStorage.setItem("yb_last_update_ts", String(Date.now()));

      // Global değişkenleri tazele (eğer sayfa açıksa)
      if (typeof window.applicationsList !== "undefined") {
        window.applicationsList = mergedApps;
      }
      if (typeof window.contractorUsers !== "undefined") {
        window.contractorUsers = mergedUsers;
      }

      // Yetkili Masası için Yeni Başvuru Uyarısı (Ses + Toast)
      const currentAppCount = mergedApps.length;
      if (!isInitial && hasNewAppForYetkili && currentAppCount > _lastKnownAppCount) {
        playNotificationChime();
        if (typeof window.showToast === "function") {
          window.showToast(`🔔 Canlı Bildirim: Buluttan yeni başvuru düştü! (${newlyAddedAppName})`, "success");
        }
      }
      _lastKnownAppCount = currentAppCount;

      // Sayfa arayüzünü yeniden çiz
      if (typeof window.renderApplicationsTable === "function") {
        window.renderApplicationsTable();
      }
      if (typeof window.renderContractorUsersTable === "function") {
        window.renderContractorUsersTable();
      }
      if (typeof window.renderContractorOwnersTable === "function") {
        window.renderContractorOwnersTable();
      }

      _lastCloudUpdateTs = cloudTs || Date.now();
      updateCloudBadge("online", `Canlı senkronize edildi. Son kontrol: ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      console.warn("Buluttan çekme uyarısı:", err);
      updateCloudBadge("offline", "Bulut bağlantısı bekleniyor (Yerel depolama devrede)");
    } finally {
      _isSyncing = false;
    }
  }

  // =========================================================================
  // BULUTA GÖNDERME FONKSİYONLARI (PUSH)
  // =========================================================================

  /**
   * Tek bir başvuruyu buluta yazar.
   */
  async function pushApplication(app) {
    if (!app || !app.id) return;
    try {
      updateCloudBadge("syncing");
      const cleanApp = JSON.parse(JSON.stringify(app));
      // Belge binary'leri yerine hafif referans bırak
      await fbPut(`/applications/${app.id}`, cleanApp);
      await touchCloudMeta("app_saved", { appId: app.id });
      updateCloudBadge("online", `Başvuru buluta kaydedildi: ${app.appNo || app.id}`);
    } catch (err) {
      console.error("Başvuru buluta gönderilemedi:", err);
      updateCloudBadge("offline");
    }
  }

  /**
   * Tek bir müteahhit hesabını buluta yazar.
   */
  async function pushContractorUser(user) {
    if (!user) return;
    try {
      updateCloudBadge("syncing");
      const cleanUser = JSON.parse(JSON.stringify(user));
      const uKey = user.id || ("user_" + Math.random().toString(36).substring(2, 8));
      await fbPut(`/contractorUsers/${uKey}`, cleanUser);
      await touchCloudMeta("contractor_registered", { email: user.email });
      updateCloudBadge("online", `Müteahhit hesabı buluta kaydedildi: ${user.companyName}`);
    } catch (err) {
      console.error("Müteahhit buluta gönderilemedi:", err);
      updateCloudBadge("offline");
    }
  }

  /**
   * Tüm yerel verileri (başvurular + kullanıcılar) buluta yazar.
   */
  async function pushAllToCloud() {
    try {
      updateCloudBadge("syncing");
      let apps = [];
      let users = [];
      try {
        const rawApps = localStorage.getItem("yb_applications_list");
        if (rawApps) apps = JSON.parse(rawApps);
        const rawUsers = localStorage.getItem("yb_contractor_users");
        if (rawUsers) users = JSON.parse(rawUsers);
      } catch (e) { }

      const appObj = {};
      apps.forEach(a => { if (a && a.id) appObj[a.id] = a; });

      const userObj = {};
      users.forEach(u => {
        if (u) {
          const k = u.id || ("u_" + (u.email ? u.email.replace(/[.@]/g, '_') : Date.now()));
          userObj[k] = u;
        }
      });

      await Promise.all([
        fbPut("/applications", appObj),
        fbPut("/contractorUsers", userObj)
      ]);

      await touchCloudMeta("full_sync");
      updateCloudBadge("online", "Tüm sistem bulutla eşitlendi.");
    } catch (e) {
      console.error("Tüm verileri buluta aktarma hatası:", e);
      updateCloudBadge("offline");
    }
  }

  /**
   * Bir başvuru silindiğinde buluttan da kaldırır.
   */
  async function deleteApplicationFromCloud(appId) {
    if (!appId) return;
    try {
      updateCloudBadge("syncing");
      await fbDelete(`/applications/${appId}`);
      // Silinen ID'yi listeye ekle
      let rawDeleted = [];
      try {
        rawDeleted = await fbGet("/deletedAppIds") || [];
      } catch (e) { }
      if (!Array.isArray(rawDeleted)) rawDeleted = Object.values(rawDeleted);
      if (!rawDeleted.includes(appId)) rawDeleted.push(appId);
      await fbPut("/deletedAppIds", rawDeleted);
      await touchCloudMeta("app_deleted", { appId: appId });
      updateCloudBadge("online");
    } catch (e) {
      console.warn("Buluttan başvuru silme uyarısı:", e);
    }
  }

  /**
   * Birleşik PDF veya dokümanı bulut doküman deposuna yazar.
   */
  async function pushDocToCloud(docKey, dataUrl) {
    if (!docKey || !dataUrl || dataUrl.length < 500) return;
    try {
      await fbPut(`/documents/${docKey}`, { dataUrl: dataUrl, savedAt: Date.now() });
    } catch (e) {
      console.warn("Doküman buluta kaydedilemedi (Yerel depolama devrede):", e);
    }
  }

  /**
   * Başka cihazdan yüklenmiş bir dokümanı buluttan çeker.
   */
  async function fetchDocFromCloud(docKey) {
    if (!docKey) return null;
    try {
      const res = await fbGet(`/documents/${docKey}`);
      if (res && res.dataUrl) return res.dataUrl;
    } catch (e) { }
    return null;
  }

  // =========================================================================
  // CANLI DİNLEYİCİ (POLLING ENGINE)
  // =========================================================================
  function startRealtimeSync() {
    if (_pollIntervalId) clearInterval(_pollIntervalId);

    // İlk açılışta hemen bir kez çek
    pullFromCloud(true);

    // Her 3.5 saniyede bir bulut meta damgasını kontrol et
    _pollIntervalId = setInterval(async () => {
      try {
        const meta = await fbGet("/meta");
        const cloudTs = meta && meta.lastUpdateTs ? Number(meta.lastUpdateTs) : 0;
        if (cloudTs > _lastCloudUpdateTs) {
          console.log("⚡ Bulutta yeni bir değişiklik algılandı, güncelleniyor...");
          await pullFromCloud(false);
        }
      } catch (e) {
        // Ağ hatası durumunda sessizce geç
      }
    }, 3500);
  }

  // DOM Yüklendiğinde başlat
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startRealtimeSync);
  } else {
    startRealtimeSync();
  }

  // Sayfa görünür olduğunda (sekme değiştirip geri gelindiğinde) anında tazele
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      pullFromCloud(false);
    }
  });

  // Global Dışa Aktarım (Diğer scriptler kullanabilir)
  window.FirebaseSync = {
    FIREBASE_BASE_URL,
    pullFromCloud,
    pushApplication,
    pushContractorUser,
    pushAllToCloud,
    deleteApplicationFromCloud,
    pushDocToCloud,
    fetchDocFromCloud,
    updateCloudBadge,
    playNotificationChime
  };

})();

