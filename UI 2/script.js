// FAST - 页面切换与登录状态管理
(function () {
  // 会话存储键：用于在 sessionStorage 中保存 token 和用户信息
  var STORAGE_KEY = 'fast_auth';
  var navTabs = document.querySelectorAll('.nav-tab');
  var pages = document.querySelectorAll('.page');
  var loginBtn = document.getElementById('header-login-btn');
  var userMenuWrap = document.getElementById('user-menu-wrap');
  var userDropdown = document.getElementById('user-dropdown');
  var userDisplayName = document.getElementById('user-display-name');
  var loginForm = document.getElementById('login-form');
  var signupForm = document.getElementById('signup-form');
  var signupFeedback = document.getElementById('signup-feedback');
  var signupSendCodeBtn = document.getElementById('signup-send-code-btn');
  var signupCodeRequested = false;
  var signupCodeCooldownTimer = null;
  var signupCodeCooldownLeft = 0;
  var signupSendCodeBtnDefaultText = signupSendCodeBtn ? signupSendCodeBtn.textContent : 'SEND CODE';

  // 停止“发送验证码”按钮的倒计时，并恢复可点击状态
  function stopSignupCodeCooldown() {
    if (signupCodeCooldownTimer) {
      clearInterval(signupCodeCooldownTimer);
      signupCodeCooldownTimer = null;
    }
    signupCodeCooldownLeft = 0;
    if (signupSendCodeBtn) {
      signupSendCodeBtn.disabled = false;
      signupSendCodeBtn.textContent = signupSendCodeBtnDefaultText;
    }
  }

  // 启动验证码按钮倒计时：倒计时期间禁止重复发送
  function startSignupCodeCooldown(seconds) {
    stopSignupCodeCooldown();
    signupCodeCooldownLeft = Math.max(1, parseInt(seconds || 60, 10) || 60);
    if (!signupSendCodeBtn) return;
    signupSendCodeBtn.disabled = true;
    signupSendCodeBtn.textContent = `RESEND IN ${signupCodeCooldownLeft}s`;
    signupCodeCooldownTimer = setInterval(function () {
      signupCodeCooldownLeft -= 1;
      if (signupCodeCooldownLeft <= 0) {
        stopSignupCodeCooldown();
        return;
      }
      if (signupSendCodeBtn) signupSendCodeBtn.textContent = `RESEND IN ${signupCodeCooldownLeft}s`;
    }, 1000);
  }

  // 前端邮箱校验：基础邮箱格式 + 屏蔽测试域名
  function isValidEmail(email) {
    var value = String(email || '').trim().toLowerCase();
    var basic = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);
    if (!basic) return false;
    var blockedDomains = ['example.com', 'test.com', 'localhost', 'local'];
    var domain = value.split('@')[1] || '';
    return blockedDomains.indexOf(domain) === -1;
  }

  // 前端密码校验：至少 6 位，且包含大小写字母与数字
  function isValidPassword(password) {
    var value = String(password || '');
    return value.length >= 6 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
  }

  // 读取本地会话；若解析失败则返回 null（防止 JSON 异常影响页面）
  function getStoredAuth() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // 写入/清理会话，并广播全局事件通知其他模块刷新状态
  function setStoredAuth(auth) {
    if (auth) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    else sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('fast-auth-changed', { detail: auth || null }));
  }

  window.getFastAuth = getStoredAuth;
  // 统一封装带鉴权头的 fetch，减少重复拼 Authorization 的代码
  window.fastAuthFetch = function (url, options) {
    var auth = getStoredAuth();
    var opts = options || {};
    var headers = Object.assign({}, opts.headers || {});
    if (auth && auth.token) headers.Authorization = 'Bearer ' + auth.token;
    return fetch(url, Object.assign({}, opts, { headers: headers }));
  };

  // 根据登录状态刷新顶部 UI（登录按钮、用户菜单、admin 样式）
  function updateHeaderAuth() {
    var auth = getStoredAuth();
    var user = auth && auth.user;
    if (loginBtn) loginBtn.classList.toggle('hidden', !!user);
    if (userMenuWrap) userMenuWrap.classList.toggle('hidden', !user);
    if (userDisplayName && user && user.name) {
      userDisplayName.textContent = user.name + (user.role === 'admin' ? ' (Admin)' : '');
    }
    document.body.classList.toggle('is-admin', !!(user && user.role === 'admin'));
  }

  // 页面切换：只激活目标 page，并同步 hash
  function showPage(pageId) {
    pages.forEach(function (p) {
      p.classList.toggle('active', p.id === pageId);
    });
    navTabs.forEach(function (t) {
      var dataPage = t.getAttribute('data-page');
      t.classList.toggle('active', dataPage === pageId && dataPage !== 'login' && dataPage !== 'signup');
    });
    if (history.replaceState) history.replaceState(null, '', '#' + pageId);
    if (userDropdown && userMenuWrap) userMenuWrap.classList.remove('open');
  }

  // 将 URL hash 映射为可用页面；非法值回退到 dashboard
  function getPageFromHash() {
    var hash = (window.location.hash || '#dashboard').slice(1);
    var valid = ['dashboard', 'map-view', 'route-planner', 'weather', 'alerts', 'alert-detail', 'login', 'signup'];
    return valid.indexOf(hash) !== -1 ? hash : 'dashboard';
  }

  navTabs.forEach(function (tab) {
    tab.addEventListener('click', function (e) {
      e.preventDefault();
      showPage(tab.getAttribute('data-page'));
    });
  });

  window.addEventListener('hashchange', function () {
    showPage(getPageFromHash());
  });

  if (loginForm) {
    // 登录提交流程：调用后端登录接口，成功后写入会话并跳转 Dashboard
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var emailEl = loginForm.querySelector('input[type=email]');
      var passwordEl = loginForm.querySelector('input[type=password]');
      var email = (emailEl && emailEl.value || '').trim();
      var password = (passwordEl && passwordEl.value || '').trim();
      if (!email || !password) return alert('Please enter email and password');
      try {
        const resp = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Login failed');
        setStoredAuth({ token: data.token, user: data.user });
        updateHeaderAuth();
        showPage('dashboard');
      } catch (err) {
        alert('Login failed: ' + err.message);
      }
    });
  }

  if (signupForm) {
    // 请求验证码：前端先做字段校验，再请求后端发码并开启 60 秒倒计时
    async function requestSignupCode() {
      var nameInput = document.getElementById('signup-name');
      var emailInput = document.getElementById('signup-email');
      var passwordInput = document.getElementById('signup-password');
      var payload = {
        name: (nameInput && nameInput.value.trim()) || 'User',
        email: (emailInput && emailInput.value.trim()) || '',
        password: (passwordInput && passwordInput.value.trim()) || ''
      };
      if (signupFeedback) signupFeedback.textContent = '';
      if (!payload.name || !payload.email || !payload.password) {
        if (signupFeedback) signupFeedback.textContent = 'Please fill name, email and password first.';
        return false;
      }
      if (!isValidEmail(payload.email)) {
        if (signupFeedback) signupFeedback.textContent = 'Please enter a valid usable email address.';
        return false;
      }
      if (!isValidPassword(payload.password)) {
        if (signupFeedback) signupFeedback.textContent = 'Password must be at least 6 chars and include uppercase, lowercase and number.';
        return false;
      }
      try {
        if (signupSendCodeBtn) signupSendCodeBtn.disabled = true;
        const resp = await fetch('/api/auth/signup/request-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Send code failed');
        signupCodeRequested = true;
        if (signupFeedback) {
          signupFeedback.style.color = '#166534';
          var devHint = data.devCode ? (' Dev code: ' + data.devCode) : '';
          signupFeedback.textContent = 'Verification code sent to email.' + devHint;
        }
        startSignupCodeCooldown(60);
        return true;
      } catch (err) {
        if (signupFeedback) {
          signupFeedback.style.color = '#dc2626';
          signupFeedback.textContent = 'Send code failed: ' + err.message;
        }
        return false;
      } finally {
        if (signupSendCodeBtn && !signupCodeCooldownTimer) signupSendCodeBtn.disabled = false;
      }
    }

    if (signupSendCodeBtn) {
      signupSendCodeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        requestSignupCode();
      });
    }

    signupForm.addEventListener('submit', async function (e) {
      // 注册确认：若尚未发码会先触发发码；然后校验 6 位验证码并完成注册
      e.preventDefault();
      var nameInput = document.getElementById('signup-name');
      var emailInput = document.getElementById('signup-email');
      var passwordInput = document.getElementById('signup-password');
      var codeInput = document.getElementById('signup-code');
      var payload = {
        name: (nameInput && nameInput.value.trim()) || 'User',
        email: (emailInput && emailInput.value.trim()) || '',
        password: (passwordInput && passwordInput.value.trim()) || '',
        code: (codeInput && codeInput.value.trim()) || ''
      };
      if (signupFeedback) {
        signupFeedback.style.color = '#dc2626';
        signupFeedback.textContent = '';
      }
      if (!payload.email || !payload.password) {
        if (signupFeedback) signupFeedback.textContent = 'Please fill all required fields.';
        return;
      }
      if (!isValidEmail(payload.email)) {
        if (signupFeedback) signupFeedback.textContent = 'Please enter a valid usable email address.';
        return;
      }
      if (!isValidPassword(payload.password)) {
        if (signupFeedback) signupFeedback.textContent = 'Password must be at least 6 chars and include uppercase, lowercase and number.';
        return;
      }
      if (!signupCodeRequested) {
        const sent = await requestSignupCode();
        if (!sent) return;
      }
      if (!/^\d{6}$/.test(payload.code)) {
        if (signupFeedback) signupFeedback.textContent = 'Please enter the 6-digit verification code.';
        return;
      }
      try {
        const resp = await fetch('/api/auth/signup/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Sign up failed');
        setStoredAuth({ token: data.token, user: data.user });
        updateHeaderAuth();
        signupCodeRequested = false;
        showPage('dashboard');
      } catch (err) {
        if (signupFeedback) signupFeedback.textContent = 'Sign up failed: ' + err.message;
      }
    });

    var signupEmailInput = document.getElementById('signup-email');
    var signupPasswordInput = document.getElementById('signup-password');
    // 实时输入提示：边输入边给邮箱/密码格式提示，降低提交失败率
    function refreshSignupHint() {
      if (!signupFeedback) return;
      var email = signupEmailInput ? signupEmailInput.value.trim() : '';
      var password = signupPasswordInput ? signupPasswordInput.value : '';
      if (!email && !password) {
        signupFeedback.textContent = '';
        return;
      }
      signupFeedback.style.color = '#dc2626';
      if (email && !isValidEmail(email)) {
        signupFeedback.textContent = 'Email format invalid or not usable.';
        return;
      }
      if (password && !isValidPassword(password)) {
        signupFeedback.textContent = 'Password needs uppercase + lowercase + number, min 6 chars.';
        return;
      }
      signupFeedback.textContent = '';
    }
    if (signupEmailInput) signupEmailInput.addEventListener('input', refreshSignupHint);
    if (signupPasswordInput) signupPasswordInput.addEventListener('input', refreshSignupHint);
  }

  // 右上角用户菜单展开/收起
  function toggleUserMenu() {
    if (userMenuWrap) userMenuWrap.classList.toggle('open');
  }

  if (userMenuWrap) {
    userMenuWrap.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleUserMenu();
    });
  }

  document.addEventListener('click', function () {
    if (userMenuWrap) userMenuWrap.classList.remove('open');
  });

  if (userDropdown) {
    userDropdown.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  }

  var logoutBtn = document.querySelector('.user-dropdown-item.logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function (e) {
      e.preventDefault();
      try {
        await window.fastAuthFetch('/api/auth/logout', { method: 'POST' });
      } catch (_) {}
      setStoredAuth(null);
      updateHeaderAuth();
      if (userMenuWrap) userMenuWrap.classList.remove('open');
      showPage('login');
    });
  }

  var deleteAccountBtn = document.querySelector('.user-dropdown-item.delete-account');
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener('click', async function (e) {
      e.preventDefault();
      var password = window.prompt('Enter your current password to delete this account:');
      if (!password) return;
      try {
        const resp = await window.fastAuthFetch('/api/auth/account', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: password })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Delete account failed');
        setStoredAuth(null);
        updateHeaderAuth();
        if (userMenuWrap) userMenuWrap.classList.remove('open');
        alert('Account deleted. You can register this email again for testing.');
        showPage('signup');
      } catch (err) {
        alert('Delete account failed: ' + err.message);
      }
    });
  }

  updateHeaderAuth();
  const auth = getStoredAuth();
  if (!auth && !['login', 'signup'].includes(getPageFromHash())) {
    showPage('login');
  } else {
    showPage(getPageFromHash());
  }
})();

// ================= 天气模块（最终版） =================

const API_CONFIG = {
  weather: {
    currentUrl: "/api/weather/current",
    forecastUrl: "/api/weather/forecast",
  },
  ai: {
    weatherAdviceUrl: "/api/ai/weather-advice",
    incidentSummaryUrl: "/api/ai/incident-summary",
  },
  alerts: {
    trafficInfoFeedUrl: "/api/traffic-info-feed"
  }
};

document.addEventListener("DOMContentLoaded", () => {

  // 天气模块仅在 weather 页面相关输入存在时启用
  const input = document.getElementById("postalCode");
  const button = document.getElementById("searchBtn");

  if (!input || !button) return;

  button.addEventListener("click", fetchWeather);
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") fetchWeather();
  });

  // 天气总入口：地点解析 -> 当前天气 -> 预报 -> AI 建议 -> 更新 UI
  async function fetchWeather() {

    const query = input.value.trim();
    if (!query) return alert("Please enter postal code or location");

    try {

      const location = await getLocation(query);
      const weather = await getCurrentWeather(location.latitude, location.longitude);
      const forecast = await getForecast(location.latitude, location.longitude);
      const advice = await getGeminiAdvice(location, weather, forecast);

      updateLocationUI(location);
      updateWeatherUI(weather);
      updateForecastUI(forecast);
      updateAdviceUI(advice);

    } catch (err) {
      console.error(err);
      alert("Weather fetch failed");
    }
  }

  // ================= 地点解析 =================

  // 调用后端地理编码，支持邮编/地名/MRT
  async function getLocation(searchVal) {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(searchVal)}`);
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || "Location not found");
    return {
      address: r.display || searchVal,
      postalCode: r.postal || "-",
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lon),
      buildingName: r.building || "-"
    };
  }

  // ================= 实时天气 =================

  // 查询实时天气
  async function getCurrentWeather(lat, lon) {
    const url = `${API_CONFIG.weather.currentUrl}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Weather fetch failed");
    return data;
  }

  // ================= 24小时预报（3个时段） =================

  // 查询未来时段预报（后端已裁剪为近 24h 的前 3 个点）
  async function getForecast(lat, lon) {
    const url = `${API_CONFIG.weather.forecastUrl}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Forecast fetch failed");

    return data.value || [];
  }

  // ================= AI 出行建议 =================

  // 请求 AI 生成可读出行建议；失败时回退本地规则文本
  async function getGeminiAdvice(location, weather, forecast) {

    const future = forecast.map(f => {
      const t = new Date(f.dt * 1000)
        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `${t}: ${f.desc}, ${f.temp}°C, rain chance ${f.pop}%`;
    }).join("\n");

    const prompt = `
You are a Singapore travel advisor.
Give 4 bullet points starting with "•".
Location: ${location.address}
Current: ${weather.desc}, ${weather.temp}°C, humidity ${weather.humidity}%, wind ${weather.wind} m/s
Next hours:
${future}
Include:
1) go out or not
2) what to wear
3) umbrella needed?
4) driving tip
`;

    const res = await fetch(API_CONFIG.ai.weatherAdviceUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: { display: location.address },
        weather,
        forecast
      })
    });

    if (!res.ok) return fallbackAdvice(weather, forecast);

    const data = await res.json();
    return data?.text || fallbackAdvice(weather, forecast);
  }

  // AI 不可用时的兜底建议，保证页面总有可读结果
  function fallbackAdvice(weather, forecast) {
    let text = `• Now ${weather.temp}°C (${weather.desc}).\n`;
    if (weather.temp > 30)
      text += "• Quite hot, wear light clothes.\n";
    if (forecast.some(f => f.pop > 35))
      text += "• Possible rain, bring umbrella.\n";
    text += "• Drive carefully if road wet.\n";
    return text;
  }

  // ================= 更新天气界面 =================

  // 刷新地点信息卡片
  function updateLocationUI(loc) {
    document.getElementById("loc-address").textContent = loc.address;
    document.getElementById("loc-postal").textContent = loc.postalCode;
    document.getElementById("loc-coords").textContent =
      `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`;
    document.getElementById("loc-building").textContent = loc.buildingName;
  }

  // 刷新当前天气卡片
  function updateWeatherUI(w) {

    document.getElementById("weather-temp").textContent = w.temp + "°C";
    document.getElementById("weather-desc").textContent = w.desc.toUpperCase();
    document.getElementById("weather-feels").textContent =
      `Feels like ${w.feels}°C`;

    document.getElementById("weather-humidity").textContent = w.humidity + "%";
    document.getElementById("weather-wind").textContent = w.wind + " m/s";
    document.getElementById("weather-pressure").textContent = w.pressure + " hPa";
    document.getElementById("weather-visibility").textContent = w.visibility + " km";
  }

  // 刷新 3 个预报卡片
  function updateForecastUI(list) {

    list.forEach((f, i) => {

      const index = i + 1;

      const time = new Date(f.dt * 1000)
        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      document.getElementById(`forecast-time-${index}`).textContent = time;
      document.getElementById(`forecast-temp-${index}`).textContent = f.temp + "°C";
      document.getElementById(`forecast-desc-${index}`).textContent =
        f.desc.toUpperCase();

      document.getElementById(`forecast-rain-${index}`).textContent =
        f.pop > 30 ? `🌧️ ${f.pop}%` : "";
    });
  }

  // 将 AI 文本按行拆分成列表渲染
  function updateAdviceUI(text) {

    const list = document.getElementById("weather-advice");
    list.innerHTML = "";

    text.split("\n")
      .filter(line => line.trim())
      .forEach(line => {
        const li = document.createElement("li");
        li.textContent = line.replace(/^•\s?/, "");
        list.appendChild(li);
      });
  }

});

// ================= 摄像头 + 路径规划整合模块 =================
(function () {
  // 新加坡地图默认中心点
  const SG_CENTER = [1.3521, 103.8198];
  const ROUTE_COLORS = {
    fastest: "#2563eb",
    fewerLights: "#16a34a",
    balanced: "#ea580c"
  };
  const ROUTE_LABELS = {
    fastest: "FASTEST",
    fewerLights: "FEWER LIGHTS",
    balanced: "BALANCED"
  };

  // 全局运行时状态：集中管理地图图层、路线、事故、告警等跨模块数据
  const state = {
    cameras: [],
    liveMap: null,
    plannerMap: null,
    liveLayer: null,
    liveIncidentLayer: null,
    plannerLayer: null,
    routeLayer: null,
    adminSimulationLayer: null,
    routePolylines: new Map(),
    routePlans: [],
    selectedRouteId: null,
    routeContext: null,
    adminSimulationConfig: null,
    adminSimulationVisible: false,
    adminSimulationData: null,
    adminSimulationSelectedRouteId: null,
    incidentSortMode: "time",
    incidentDataSource: "live",
    incidentMeta: null,
    mapIncidentsVisible: false,
    mapLiveIncidents: [],
    dashboardIncidents: [],
    alertDismissedIds: new Set(),
    selectedAlertIncidentId: null,
    alertAiCache: new Map(),
    userLocation: null,
    alertLocationReady: false,
    alertIncidentById: new Map(),
    alertsInfoFeed: null
  };

  // 读取当前登录用户（来自前面 auth 模块的 sessionStorage 封装）
  function getAuthUser() {
    return window.getFastAuth && window.getFastAuth() ? window.getFastAuth().user : null;
  }

  // 是否管理员：用于控制模拟功能/数据源切换按钮显隐
  function isAdmin() {
    const user = getAuthUser();
    return !!(user && user.role === "admin");
  }

  // 通用距离函数（米）：路径评估、事故匹配、点位去重都会用到
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // 对经纬度做 4 位小数归一化，减少 OSM 节点碎片
  function nodeKey(lat, lon) {
    return `${Math.round(lat * 10000)},${Math.round(lon * 10000)}`;
  }

  // 从 Overpass 道路数据构建图（节点 + 双向边 + 度数）
  function buildGraph(roads) {
    const nodes = new Map();
    function ensureNode(lat, lon) {
      const key = nodeKey(lat, lon);
      if (!nodes.has(key)) nodes.set(key, { key, lat, lon, edges: [], degree: 0 });
      return nodes.get(key);
    }
    for (const el of (roads.elements || [])) {
      if (el.type !== "way" || !Array.isArray(el.geometry) || el.geometry.length < 2) continue;
      for (let i = 0; i < el.geometry.length - 1; i++) {
        const a = el.geometry[i];
        const b = el.geometry[i + 1];
        const n1 = ensureNode(a.lat, a.lon);
        const n2 = ensureNode(b.lat, b.lon);
        const distMeters = haversine(a.lat, a.lon, b.lat, b.lon);
        if (distMeters < 2) continue;
        const baseHours = (distMeters / 1000) / 40;
        n1.edges.push({ to: n2, weight: baseHours });
        n2.edges.push({ to: n1, weight: baseHours });
        n1.degree += 1;
        n2.degree += 1;
      }
    }
    return nodes;
  }

  // 在图中查找最近道路节点（限制 600m，避免误接入）
  function nearestNode(nodes, lat, lon) {
    let best = null;
    let bestDist = Infinity;
    for (const n of nodes.values()) {
      const d = haversine(lat, lon, n.lat, n.lon);
      if (d < bestDist && d < 600) {
        bestDist = d;
        best = n;
      }
    }
    return best;
  }

  // 前端保留的 A* 实现（当前主流程已切后端 Python，这里主要供兼容/模拟）
  function aStar(startNode, endNode, costFn) {
    const open = new Map([[startNode.key, startNode]]);
    const g = new Map([[startNode.key, 0]]);
    const f = new Map([[startNode.key, haversine(startNode.lat, startNode.lon, endNode.lat, endNode.lon) / 1000 / 50]]);
    const prev = new Map();

    while (open.size > 0) {
      let current = null;
      let minF = Infinity;
      for (const n of open.values()) {
        const score = f.get(n.key) ?? Infinity;
        if (score < minF) {
          minF = score;
          current = n;
        }
      }
      if (!current) break;
      if (current.key === endNode.key) break;
      open.delete(current.key);

      for (const edge of current.edges) {
        const tentative = (g.get(current.key) ?? Infinity) + costFn(edge, current);
        if (tentative < (g.get(edge.to.key) ?? Infinity)) {
          prev.set(edge.to.key, current);
          g.set(edge.to.key, tentative);
          const h = haversine(edge.to.lat, edge.to.lon, endNode.lat, endNode.lon) / 1000 / 50;
          f.set(edge.to.key, tentative + h);
          open.set(edge.to.key, edge.to);
        }
      }
    }

    const path = [];
    let cur = endNode;
    while (cur) {
      path.unshift(cur);
      cur = prev.get(cur.key);
    }
    return path.length >= 2 ? path : [];
  }

  function edgeKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  function buildPathEdgeSet(path) {
    const used = new Set();
    for (let i = 0; i < path.length - 1; i++) {
      used.add(edgeKey(path[i].key, path[i + 1].key));
    }
    return used;
  }

  // 备用红绿灯估算：以路口度数 >= 3 作为“有信号”近似
  function countTrafficLightsByDegree(path) {
    let count = 0;
    for (let i = 1; i < path.length - 1; i++) {
      if ((path[i].degree || 0) >= 3) count += 1;
    }
    return count;
  }

  // 从摄像头聚合结果中提取“信号点位”数据，用于更真实的红绿灯计数
  function getTrafficSignalPoints() {
    return (state.cameras || [])
      .filter((c) => {
        const source = String(c.source || "").toLowerCase();
        const name = String(c.name || "");
        return source.includes("signal") || name.includes("信号点位");
      })
      .map((c) => ({
        id: String(c.id || `${c.lat},${c.lon}`),
        lat: Number(c.lat),
        lon: Number(c.lon)
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  }

  // 真实信号点计数：路线附近命中 + 聚类去重，避免一个路口被重复计算
  function countTrafficLightsBySignals(routeCoords, signalPoints, matchRadiusM = 35, dedupeRadiusM = 65) {
    if (!Array.isArray(routeCoords) || routeCoords.length < 2 || !Array.isArray(signalPoints) || !signalPoints.length) {
      return 0;
    }

    const hits = [];
    for (const sig of signalPoints) {
      if (!Number.isFinite(sig.lat) || !Number.isFinite(sig.lon)) continue;
      const d = distanceToRouteMeters(routeCoords, sig.lat, sig.lon);
      if (d <= matchRadiusM) hits.push(sig);
    }
    if (!hits.length) return 0;

    // 将同一路口附近的多个信号点聚合为 1 个，避免重复计数
    const clusters = [];
    for (const sig of hits) {
      let merged = false;
      for (const c of clusters) {
        if (haversine(sig.lat, sig.lon, c.lat, c.lon) <= dedupeRadiusM) {
          c.count += 1;
          c.lat = (c.lat * (c.count - 1) + sig.lat) / c.count;
          c.lon = (c.lon * (c.count - 1) + sig.lon) / c.count;
          merged = true;
          break;
        }
      }
      if (!merged) clusters.push({ lat: sig.lat, lon: sig.lon, count: 1 });
    }
    return clusters.length;
  }

  // 计算路径总长度（米），包含起点到首节点与末节点到终点
  function calcPathDistance(path, startGeo, endGeo) {
    let total = 0;
    let prev = { lat: startGeo.lat, lon: startGeo.lon };
    for (const n of path) {
      total += haversine(prev.lat, prev.lon, n.lat, n.lon);
      prev = n;
    }
    total += haversine(prev.lat, prev.lon, endGeo.lat, endGeo.lon);
    return total;
  }

  // 统一获取可绘制坐标：
  // - 新版优先使用后端 /api/route-plan 返回的 coords
  // - 兼容旧版 path（节点数组）回退计算
  function getRouteCoords(routeOption, startCoord, endCoord) {
    if (Array.isArray(routeOption?.coords) && routeOption.coords.length >= 2) {
      return routeOption.coords;
    }
    const coords = [[startCoord.lat, startCoord.lon]];
    for (const n of routeOption.path) coords.push([n.lat, n.lon]);
    coords.push([endCoord.lat, endCoord.lon]);
    return coords;
  }

  // 前端本地路线生成（兼容保留）：输出 fastest/fewerLights/balanced 三策略
  function calcRoutePlans(nodes, startNode, endNode, startGeo, endGeo, signalPoints = []) {
    const modes = [
      { id: "fastest", label: "FASTEST", color: "#2563eb", desc: "Prioritize total time" },
      { id: "fewerLights", label: "FEWER LIGHTS", color: "#16a34a", desc: "Reduce intersection waiting" },
      { id: "balanced", label: "BALANCED", color: "#ea580c", desc: "Near-fastest with fewer lights" }
    ];

    const plans = [];
    const usedEdgeSets = [];
    for (const mode of modes) {
      const path = aStar(startNode, endNode, (edge, fromNode) => {
        const base = edge.weight;
        const intersectionCost = (edge.to.degree || 0) >= 3 ? (15 / 3600) : 0;
        const reusePenalty = usedEdgeSets.some(set => set.has(edgeKey(fromNode.key, edge.to.key))) ? 0.025 : 0;
        if (mode.id === "fastest") return base + reusePenalty;
        if (mode.id === "fewerLights") return base + intersectionCost * 1.8 + reusePenalty;
        return base + intersectionCost * 0.9 + reusePenalty;
      });

      if (path.length < 2) continue;
      const totalDist = calcPathDistance(path, startGeo, endGeo);
      const estMinutes = (totalDist / 1000 / 40) * 60;
      const coords = getRouteCoords({ path }, startGeo, endGeo);
      const signalLights = countTrafficLightsBySignals(coords, signalPoints, 35, 65);
      const trafficLights = signalLights > 0 ? signalLights : countTrafficLightsByDegree(path);
      const signature = Array.from(buildPathEdgeSet(path)).sort().join(",");
      if (plans.some(p => p.signature === signature)) continue;
      plans.push({ ...mode, path, signature, totalDist, estMinutes, trafficLights, coords });
      usedEdgeSets.push(buildPathEdgeSet(path));
    }
    return plans;
  }

  // 找到某点在路线折线中的最近索引，用于判断“前方事件/附近事件”
  function nearestCoordIndex(coords, lat, lon) {
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const d = haversine(lat, lon, coords[i][0], coords[i][1]);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    return idx;
  }

  // 计算点到路线的最短距离（简化为到顶点最短距离）
  function distanceToRouteMeters(routeCoords, lat, lon) {
    let best = Infinity;
    for (const c of routeCoords || []) {
      const d = haversine(lat, lon, c[0], c[1]);
      if (d < best) best = d;
    }
    return best;
  }

  // 生成用于路线评估/演示的事件（管理员配置优先；否则使用默认模板）
  function buildSyntheticEvents(routeCoords, customConfig) {
    const configuredEvents = customConfig && customConfig.enabled && Array.isArray(customConfig.events)
      ? customConfig.events
      : null;
    if (configuredEvents && configuredEvents.length) {
      return configuredEvents.map((evt, i) => {
        const ratio = Math.max(0.05, Math.min(0.95, Number(evt.ratio) || 0.5));
        const idx = Math.max(1, Math.min(routeCoords.length - 2, Math.floor((routeCoords.length - 1) * ratio)));
        const [lat, lon] = routeCoords[idx];
        const severity = Math.max(1, Math.min(3, Number(evt.severity) || 2));
        const delayMin = Math.max(1, Math.min(45, Number(evt.delayMin) || 8));
        return {
          id: `evt-admin-${i + 1}`,
          type: String(evt.type || "incident"),
          label: String(evt.label || "Admin Incident"),
          color: String(evt.color || (severity === 3 ? "#ef4444" : severity === 2 ? "#f59e0b" : "#a855f7")),
          severity,
          delayMin,
          lat,
          lon,
          reason: `${String(evt.label || "Admin Incident")} (L${severity})`
        };
      });
    }

    const types = [
      { type: "accident", label: "Accident", color: "#ef4444", baseDelay: 10 },
      { type: "congestion", label: "Congestion", color: "#f59e0b", baseDelay: 7 },
      { type: "roadwork", label: "Roadwork", color: "#a855f7", baseDelay: 5 }
    ];
    const ratios = [0.28, 0.53, 0.76];

    return ratios.map((ratio, i) => {
      const idx = Math.max(1, Math.min(routeCoords.length - 2, Math.floor((routeCoords.length - 1) * ratio)));
      const [lat, lon] = routeCoords[idx];
      const t = types[i % types.length];
      const severity = (i % 3) + 1;
      return {
        id: `evt-${i + 1}`,
        type: t.type,
        label: t.label,
        color: t.color,
        severity,
        delayMin: t.baseDelay + severity * 2,
        lat,
        lon,
        reason: `${t.label} (L${severity})`
      };
    });
  }

  // 事件筛选：仅保留“用户附近”或“路线前方”事件，减少噪声
  function analyzeEvents(events, userLoc, routeCoords) {
    const progressIdx = userLoc ? nearestCoordIndex(routeCoords, userLoc.lat, userLoc.lon) : 0;
    const aheadMax = Math.min(routeCoords.length - 1, progressIdx + Math.floor(routeCoords.length * 0.55));
    return events
      .map((evt) => {
        const nearUserMeters = userLoc ? haversine(userLoc.lat, userLoc.lon, evt.lat, evt.lon) : Infinity;
        const eventIdx = nearestCoordIndex(routeCoords, evt.lat, evt.lon);
        const isNearUser = nearUserMeters <= 1200;
        const isAhead = eventIdx >= progressIdx && eventIdx <= aheadMax;
        return { ...evt, nearUserMeters, isNearUser, isAhead, isRelevant: isNearUser || isAhead };
      })
      .filter(e => e.isRelevant);
  }

  // 给事件附上附近摄像头（最多 2 个），用于详情展示证据
  function attachEventCameras(events, cameras) {
    return events.map((evt) => {
      const nearby = cameras
        .map(cam => ({ ...cam, dist: haversine(evt.lat, evt.lon, cam.lat, cam.lon) }))
        .filter(cam => cam.dist <= 1500)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 2);
      return { ...evt, cameras: nearby };
    });
  }

  // 将事件延误映射到每条路线，产出推荐路线与延误评分
  function evaluateRoutesByEvents(routeOptions, events, startGeo, endGeo) {
    const evaluations = new Map();
    for (const route of routeOptions) {
      const coords = getRouteCoords(route, startGeo, endGeo);
      const hits = events.filter(evt => distanceToRouteMeters(coords, evt.lat, evt.lon) <= 350);
      const delay = hits.reduce((sum, h) => sum + h.delayMin, 0);
      const score = route.estMinutes + delay * 0.7 + hits.length * 2;
      evaluations.set(route.id, { hitCount: hits.length, eventDelayMin: delay, score, hits });
    }
    let best = routeOptions[0];
    for (const r of routeOptions) {
      if ((evaluations.get(r.id)?.score ?? Infinity) < (evaluations.get(best.id)?.score ?? Infinity)) best = r;
    }
    return { evaluations, recommendedRouteId: best.id };
  }

  // 获取浏览器定位（失败时返回 null，不中断主流程）
  function getUserLocation() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 15000 }
      );
    });
  }

  // 懒加载初始化两张地图：实时地图 + 规划地图
  function ensureMaps() {
    if (!state.liveMap && document.getElementById("liveMap")) {
      state.liveMap = L.map("liveMap", { center: SG_CENTER, zoom: 11, zoomControl: false, preferCanvas: true });
      L.control.zoom({ position: "bottomright" }).addTo(state.liveMap);
      L.tileLayer("https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png", {
        attribution: "&copy; OneMap Singapore",
        maxZoom: 18,
        minZoom: 10
      }).addTo(state.liveMap);
      state.liveLayer = L.layerGroup().addTo(state.liveMap);
      state.liveIncidentLayer = L.layerGroup().addTo(state.liveMap);
    }

    if (!state.plannerMap && document.getElementById("plannerMap")) {
      state.plannerMap = L.map("plannerMap", { center: SG_CENTER, zoom: 11, zoomControl: false, preferCanvas: true });
      L.control.zoom({ position: "bottomright" }).addTo(state.plannerMap);
      L.tileLayer("https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png", {
        attribution: "&copy; OneMap Singapore",
        maxZoom: 18,
        minZoom: 10
      }).addTo(state.plannerMap);
      state.plannerLayer = L.layerGroup().addTo(state.plannerMap);
      state.routeLayer = L.layerGroup().addTo(state.plannerMap);
      state.adminSimulationLayer = L.layerGroup().addTo(state.plannerMap);
    }
  }

  // 地图点击摄像头后的弹窗展示（名称、来源、实时图）
  function openLiveCamera(c) {
    if (!state.liveMap) return;
    const content = `
      <div style="font-size:12px;max-width:260px;">
        <strong>${c.name}</strong><br/>
        <span>${c.source}</span><br/>
        ${c.imageLink ? `<img src="${c.imageLink}" alt="${c.name}" style="margin-top:6px;width:100%;border-radius:6px;" />` : "No realtime image"}
      </div>
    `;
    L.popup().setLatLng([c.lat, c.lon]).setContent(content).openOn(state.liveMap);
    state.liveMap.setView([c.lat, c.lon], Math.max(state.liveMap.getZoom(), 14));
  }

  // Map View 主渲染：左侧列表 + 右侧地图点位保持同一数据源
  function renderLiveMapAndList() {
    if (!state.liveMap || !state.liveLayer) return;
    state.liveLayer.clearLayers();
    const realtime = state.cameras.filter(c => c.hasRealtimeImage);
    const mapPoints = realtime.slice(0, 90);
    const list = realtime.slice(0, 90);

    mapPoints.forEach((c) => {
      const marker = L.circleMarker([c.lat, c.lon], {
        radius: 6,
        color: "#fff",
        weight: 1.5,
        fillColor: "#2563eb",
        fillOpacity: 0.9
      }).addTo(state.liveLayer);
      marker.on("click", () => openLiveCamera(c));
    });

    const reportList = document.getElementById("camera-report-list");
    if (reportList) {
      reportList.innerHTML = list.map((c, i) => `
        <div class="report-card ${i % 3 === 0 ? "accident" : i % 3 === 1 ? "roadwork" : "breakdown"}" data-camera-id="${c.id}">
          <span class="report-icon ${i % 3 === 0 ? "accident" : i % 3 === 1 ? "roadwork" : "breakdown"}"></span>
          <div class="report-body">
            <span class="report-type">LIVE CAMERA</span>
            <p>${c.name}</p>
            <span class="report-time">${c.source}</span>
          </div>
          <span class="severity-tag ${i % 3 === 0 ? "high" : i % 3 === 1 ? "medium" : "low"}">${i % 3 === 0 ? "HIGH" : i % 3 === 1 ? "MEDIUM" : "LOW"}</span>
        </div>
      `).join("");
      reportList.querySelectorAll(".report-card").forEach((card) => {
        card.addEventListener("click", () => {
          const cam = list.find(x => x.id === card.getAttribute("data-camera-id"));
          if (cam) openLiveCamera(cam);
        });
      });
    }

    const liveCount = document.getElementById("map-live-count");
    if (liveCount) liveCount.textContent = String(mapPoints.length);
  }

  // 实时事故显示开关按钮文案同步
  function renderMapIncidentToggleButton() {
    const btn = document.getElementById("map-toggle-incidents-btn");
    if (!btn) return;
    btn.innerHTML = state.mapIncidentsVisible
      ? `<span class="icon-warning red"></span> HIDE LTA INCIDENTS`
      : `<span class="icon-warning red"></span> SHOW LTA INCIDENTS`;
  }

  // 在 Map View 绘制 LTA 实时事故点
  function drawLiveIncidentMarkers(incidents) {
    if (!state.liveIncidentLayer) return;
    state.liveIncidentLayer.clearLayers();
    (incidents || []).forEach((it) => {
      const lat = Number(it?.lat);
      const lon = Number(it?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const marker = L.circleMarker([lat, lon], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: getIncidentSeverityColor(it) === "red" ? "#dc2626" : getIncidentSeverityColor(it) === "orange" ? "#ea580c" : "#16a34a",
        fillOpacity: 0.95
      }).addTo(state.liveIncidentLayer);
      marker.bindPopup(`
        <div style="font-size:12px;max-width:280px;">
          <strong>${escapeHtml(it.message || it.type || "Traffic incident")}</strong><br/>
          <span>Area: ${escapeHtml(it.area || "Unknown")}</span><br/>
          <span>Reported: ${escapeHtml(formatIncidentTime(it.createdAt))}</span>
        </div>
      `);
    });
  }

  // 拉取地图事故数据（用于地图点位，不带复杂详情）
  async function fetchLiveIncidentsForMap() {
    const resp = await fetch("/api/incidents?source=live&withImagesOnly=0&max=120");
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Failed to load live incidents");
    return data.value || [];
  }

  // 显示/隐藏地图事故图层
  async function toggleMapIncidentsLayer() {
    if (!state.liveIncidentLayer) return;
    if (state.mapIncidentsVisible) {
      state.mapIncidentsVisible = false;
      state.liveIncidentLayer.clearLayers();
      renderMapIncidentToggleButton();
      return;
    }
    const incidents = await fetchLiveIncidentsForMap();
    state.mapLiveIncidents = incidents;
    state.mapIncidentsVisible = true;
    drawLiveIncidentMarkers(incidents);
    renderMapIncidentToggleButton();
  }

  // 摄像头数量驱动的概览占位统计（真实事故统计由 refreshDashboardIncidents 覆盖）
  function updateDashboardStats() {
    const realtime = state.cameras.filter(c => c.hasRealtimeImage).length;
    const totalIncidents = Math.max(3, Math.min(20, Math.round(realtime * 0.025)));
    const high = Math.max(1, Math.round(totalIncidents * 0.25));
    const medium = Math.max(1, Math.round(totalIncidents * 0.45));
    const low = Math.max(1, totalIncidents - high - medium);
    const highest = high > 0 ? "HIGH" : medium > 0 ? "MEDIUM" : "LOW";

    const now = new Date().toLocaleString("en-US", { hour12: true });
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText("summary-last-updated", `Last updated: ${now}`);
    setText("incident-total-num", String(totalIncidents));
    setText("severity-high-num", String(high));
    setText("severity-medium-num", String(medium));
    setText("severity-low-num", String(low));
    setText("incident-highest-severity", `Highest severity: ${highest}`);
    setText("incident-max-radius", `Max congestion radius: ${(1.2 + high * 0.35).toFixed(1)} km`);
    setText("live-incidents-total", String(totalIncidents));
    setText("live-incidents-breakdown", `${high} high, ${medium} medium, ${low} low`);
  }

  // Dashboard 默认证据卡渲染（无实时事故数据时的兜底展示）
  function renderDashboardEvidence() {
    const realtime = state.cameras.filter(c => c.hasRealtimeImage).slice(0, 6);
    const updatesEl = document.getElementById("dashboard-updates-list");
    const evidenceEl = document.getElementById("dashboard-evidence-list");
    if (!updatesEl || !evidenceEl) return;

    updatesEl.innerHTML = realtime.slice(0, 3).map((c, i) => `
      <li>
        <span class="dot ${i === 0 ? "red" : i === 1 ? "orange" : "green"}"></span>
        <div>
          <strong>${i === 0 ? "Accident risk cluster near" : i === 1 ? "Congestion build-up near" : "Roadwork impact near"} ${c.name}</strong>
          <span class="meta">Evidence source: ${c.source} · Camera ID: ${c.id}</span>
        </div>
      </li>
    `).join("");

    evidenceEl.innerHTML = realtime.map((c, i) => `
      <div class="evidence-card">
        <img src="${c.imageLink}" alt="${c.name}" loading="lazy" />
        <div class="evidence-card-body">
          <div class="evidence-card-title">${i % 3 === 0 ? "Accident Evidence" : i % 3 === 1 ? "Congestion Evidence" : "Roadwork Evidence"}</div>
          <div class="evidence-card-meta">${c.name}</div>
          <div class="evidence-card-meta">${c.source}</div>
        </div>
      </div>
    `).join("");
  }

  // 事故文本 -> 严重度分级（高/中/低）
  function getIncidentSeverityScore(incident) {
    const text = `${incident?.type || ""} ${incident?.message || ""}`.toLowerCase();
    if (/(accident|collision|overturned|fire|fatal|crash)/.test(text)) return 3;
    if (/(congestion|jam|heavy traffic|road block|roadwork|construction)/.test(text)) return 2;
    return 1;
  }

  function getIncidentSeverityColor(incident) {
    const score = getIncidentSeverityScore(incident);
    if (score >= 3) return "red";
    if (score === 2) return "orange";
    return "green";
  }

  function getIncidentImpactLabel(incident) {
    const score = getIncidentSeverityScore(incident);
    if (score >= 3) return "HIGH IMPACT";
    if (score === 2) return "MEDIUM IMPACT";
    return "LOW IMPACT";
  }

  // 基础 XSS 防护：所有动态文本渲染前统一转义
  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatIncidentTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleString("en-SG", { hour12: true });
  }

  function incidentTitle(incident) {
    return incident?.message || incident?.type || "Traffic incident";
  }

  function formatFeedTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "Unknown time";
    return date.toLocaleString("en-SG", { hour12: true });
  }

  // Alerts 右栏资讯渲染：近 7 天新闻 + 最新规则更新
  function renderAlertsInfoFeed(feed) {
    const weeklyListEl = document.getElementById("alerts-weekly-news-list");
    const latestRuleEl = document.getElementById("alerts-latest-rule");
    if (!weeklyListEl || !latestRuleEl) return;

    const weeklyNews = Array.isArray(feed?.weeklyNews) ? feed.weeklyNews : [];
    const latestRule = feed?.latestRule || null;

    if (!weeklyNews.length) {
      weeklyListEl.innerHTML = `<div class="alert-card"><div class="alert-body"><strong>最近7天暂无可用事故新闻。</strong></div></div>`;
    } else {
      weeklyListEl.innerHTML = weeklyNews.map((item, idx) => `
        <div class="alert-card">
          <div class="alert-body">
            <strong>${idx + 1}. ${escapeHtml(item.title || "Traffic news")}</strong>
            <span class="alert-meta">TIME: ${escapeHtml(formatFeedTime(item.publishedAt))}</span>
            <a class="alert-meta" href="${escapeHtml(item.link || "#")}" target="_blank" rel="noopener noreferrer">Open source</a>
          </div>
        </div>
      `).join("");
    }

    if (!latestRule) {
      latestRuleEl.innerHTML = `<div class="alert-card"><div class="alert-body"><strong>暂无最新交通规则更新。</strong></div></div>`;
      return;
    }
    latestRuleEl.innerHTML = `
      <h4 style="margin:0 0 8px;">Latest Traffic Rule Update</h4>
      <div class="alert-card">
        <div class="alert-body">
          <strong>${escapeHtml(latestRule.title || "Traffic rule update")}</strong>
          <span class="alert-meta">TIME: ${escapeHtml(formatFeedTime(latestRule.publishedAt))}</span>
          <a class="alert-meta" href="${escapeHtml(latestRule.link || "#")}" target="_blank" rel="noopener noreferrer">Open source</a>
        </div>
      </div>
    `;
  }

  // 刷新 Alerts 资讯流（进入 Alerts 页面时触发）
  async function refreshAlertsInfoFeed() {
    const weeklyListEl = document.getElementById("alerts-weekly-news-list");
    const latestRuleEl = document.getElementById("alerts-latest-rule");
    if (!weeklyListEl || !latestRuleEl) return;
    weeklyListEl.innerHTML = `<p style="margin:0;">加载近7天事故新闻中...</p>`;
    latestRuleEl.innerHTML = `<p style="margin:0;">加载最新交通规则中...</p>`;
    try {
      const res = await fetch(API_CONFIG.alerts.trafficInfoFeedUrl);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Feed request failed");
      state.alertsInfoFeed = data;
      renderAlertsInfoFeed(data);
    } catch (err) {
      console.error("Traffic info feed failed:", err.message);
      weeklyListEl.innerHTML = `<div class="alert-card"><div class="alert-body"><strong>资讯加载失败</strong><span class="alert-meta">${escapeHtml(err.message)}</span></div></div>`;
      latestRuleEl.innerHTML = "";
    }
  }

  function getIncidentSpreadText(incident) {
    const r = Number(incident?.spreadRadiusKm);
    if (!Number.isFinite(r) || r <= 0) return "N/A";
    return `${r.toFixed(1)} km`;
  }

  function getIncidentDurationText(incident) {
    const minV = Number(incident?.estimatedDurationMin);
    const maxV = Number(incident?.estimatedDurationMax);
    if (Number.isFinite(minV) && Number.isFinite(maxV)) {
      return `${Math.round(minV)}-${Math.round(maxV)} mins`;
    }
    return "N/A";
  }

  // Alerts 的“附近事故”逻辑只请求一次定位，避免频繁弹权限/消耗性能
  async function ensureAlertLocation() {
    if (state.alertLocationReady) return;
    state.alertLocationReady = true;
    state.userLocation = await getUserLocation();
  }

  function incidentIsNearby(incident) {
    if (!state.userLocation) return false;
    const lat = Number(incident?.lat);
    const lon = Number(incident?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return haversine(state.userLocation.lat, state.userLocation.lon, lat, lon) <= 3500;
  }

  // 生成单条告警卡 HTML（Pinned 与 All 共用）
  function buildAlertCardHtml(incident, badgeText) {
    const sevColor = getIncidentSeverityColor(incident);
    const impactLabel = getIncidentImpactLabel(incident);
    const impactClass = sevColor === "red" ? "high" : sevColor === "orange" ? "medium" : "low";
    const id = escapeHtml(incident.id || "");
    const summary = escapeHtml(incident.message || incident.type || "Traffic incident");
    const area = escapeHtml(incident.area || "Unknown area");
    const timeText = escapeHtml(formatIncidentTime(incident.createdAt));
    return `
      <div class="alert-card" data-incident-id="${id}">
        <span class="alert-icon ${sevColor}"></span>
        <div class="alert-body">
          <strong>${summary}</strong>
          ${badgeText ? `<span class="badge nearby">${escapeHtml(badgeText)}</span>` : ""}
          <p>Area: ${area}</p>
          <span class="alert-meta">REPORTED: ${timeText}</span>
          <span class="alert-meta">SPREAD: ${escapeHtml(getIncidentSpreadText(incident))}</span>
          <span class="alert-meta">DURATION: ${escapeHtml(getIncidentDurationText(incident))}</span>
          <span class="impact-tag ${impactClass}">${impactLabel}</span>
        </div>
        <div class="alert-actions">
          <button type="button" class="alert-view-detail-btn" data-incident-id="${id}">View Details ></button>
          <button type="button" class="alert-dismiss-btn" data-incident-id="${id}">Dismiss ×</button>
        </div>
      </div>
    `;
  }

  // 以事故点就近匹配实时摄像头（前端辅助逻辑）
  function getNearestCameraForPoint(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    let best = null;
    let bestDist = Infinity;
    for (const cam of state.cameras || []) {
      if (!cam.hasRealtimeImage) continue;
      const d = haversine(lat, lon, cam.lat, cam.lon);
      if (d < bestDist) {
        bestDist = d;
        best = cam;
      }
    }
    if (!best || bestDist > 1800) return null;
    return best;
  }

  // 管理员模拟模式下：提取当前选中模拟路线对应的事故列表
  function getSelectedSimRouteIncidentsForAlerts() {
    const sim = state.adminSimulationData;
    if (!state.adminSimulationVisible || !sim || !Array.isArray(sim.routes) || !sim.routes.length) return [];
    const routeId = state.adminSimulationSelectedRouteId || sim.notes?.fastestByTimeId;
    const route = sim.routes.find((r) => r.id === routeId);
    if (!route || !Array.isArray(route.incidents) || !route.incidents.length) return [];
    const routeIndex = Math.max(0, sim.routes.findIndex((r) => r.id === route.id));
    const routeName = `模拟路线 ${String.fromCharCode(65 + routeIndex)}`;

    return route.incidents.map((evt, idx) => {
      const cam = getNearestCameraForPoint(Number(evt.lat), Number(evt.lon));
      return {
        id: `sim-${routeId}-${evt.id || idx}`,
        type: evt.label || "Simulated incident",
        message: evt.message || evt.reason || evt.label || "Simulated traffic disruption",
        area: routeName,
        lat: evt.lat,
        lon: evt.lon,
        createdAt: evt.createdAt || sim.generatedAt || new Date().toISOString(),
        spreadRadiusKm: Number.isFinite(Number(evt.spreadRadiusKm)) ? Number(evt.spreadRadiusKm) : 1.2,
        estimatedDurationMin: Number.isFinite(Number(evt.estimatedDurationMin)) ? Number(evt.estimatedDurationMin) : 20,
        estimatedDurationMax: Number.isFinite(Number(evt.estimatedDurationMax)) ? Number(evt.estimatedDurationMax) : 55,
        imageLink: cam?.imageLink || null,
        cameraName: cam?.name || null
      };
    });
  }

  // 普通规划模式下：提取当前选中真实路线上的命中事件
  function getSelectedPlannedRouteIncidentsForAlerts() {
    const selectedId = state.selectedRouteId;
    const evalMap = state.routeContext?.evaluation?.evaluations;
    const routeEval = selectedId && evalMap ? evalMap.get(selectedId) : null;
    const hits = routeEval?.hits || [];
    if (!hits.length) return [];
    const generatedAt = state.routeContext?.generatedAt || new Date().toISOString();

    return hits.map((evt, idx) => {
      const cam = evt.cameras && evt.cameras.length ? evt.cameras[0] : getNearestCameraForPoint(Number(evt.lat), Number(evt.lon));
      return {
        id: `route-${selectedId}-${evt.id || idx}`,
        type: evt.type || evt.label || "Route incident",
        message: evt.reason || evt.label || "Incident detected on selected route",
        area: cam?.name || "Along selected route",
        lat: evt.lat,
        lon: evt.lon,
        createdAt: generatedAt,
        spreadRadiusKm: 1.0,
        estimatedDurationMin: Math.max(10, Math.round((evt.delayMin || 8) * 2)),
        estimatedDurationMax: Math.max(20, Math.round((evt.delayMin || 8) * 4)),
        imageLink: cam?.imageLink || null,
        cameraName: cam?.name || null
      };
    });
  }

  // Alerts 主渲染入口：
  // - 决定 Pinned 来源（模拟路线 / 当前规划路线 / 附近事故）
  // - 渲染全部事故列表
  // - 维护详情页索引 map
  function renderAlertsPanels() {
    const pinnedSection = document.getElementById("alerts-pinned-section");
    const pinnedList = document.getElementById("alerts-pinned-list");
    const allList = document.getElementById("alerts-all-list");
    if (!pinnedSection || !pinnedList || !allList) return;
    if (!state.alertLocationReady) ensureAlertLocation().then(() => renderAlertsPanels());

    const base = sortIncidents(state.dashboardIncidents, state.incidentSortMode)
      .filter((it) => !state.alertDismissedIds.has(String(it.id || "")));

    let pinned = [];
    let badgeText = "";
    if (state.adminSimulationVisible) {
      pinned = getSelectedSimRouteIncidentsForAlerts();
      badgeText = "模拟路线";
    } else if (state.selectedRouteId && state.routeContext) {
      pinned = getSelectedPlannedRouteIncidentsForAlerts();
      badgeText = "ROUTE";
    } else {
      pinned = base.filter(incidentIsNearby);
      badgeText = "NEARBY";
    }

    if (!pinned.length) {
      pinnedSection.style.display = "none";
      pinnedList.innerHTML = "";
    } else {
      pinnedSection.style.display = "";
      pinnedList.innerHTML = pinned.map((it) => buildAlertCardHtml(it, badgeText)).join("");
    }

    if (!base.length) {
      allList.innerHTML = `<div class="alert-card"><div class="alert-body"><strong>No active realtime incidents now.</strong></div></div>`;
    } else {
      allList.innerHTML = base.map((it) => buildAlertCardHtml(it, "")).join("");
    }
    state.alertIncidentById = new Map([...base, ...pinned].map((it) => [String(it.id || ""), it]));
    if (state.alertsInfoFeed) renderAlertsInfoFeed(state.alertsInfoFeed);
  }

  // 事故详情 AI 摘要（带缓存，失败自动回退）
  async function fetchGeminiIncidentSummary(incident) {
    const cacheKey = String(incident?.id || "");
    if (state.alertAiCache.has(cacheKey)) return state.alertAiCache.get(cacheKey);

    const fallback = {
      location: incident.area || "Unknown area",
      time: formatIncidentTime(incident.createdAt),
      reason: incident.message || incident.type || "Traffic disruption",
      duration: getIncidentDurationText(incident) !== "N/A"
        ? `${getIncidentDurationText(incident)} (estimated)`
        : (getIncidentSeverityScore(incident) >= 3 ? "90-120 minutes (estimated)" : getIncidentSeverityScore(incident) === 2 ? "45-90 minutes (estimated)" : "20-45 minutes (estimated)")
    };

    try {
      const res = await fetch(API_CONFIG.ai.incidentSummaryUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incident: {
            message: incident.message || incident.type || "Traffic incident",
            area: incident.area || "Unknown area",
            createdAt: formatIncidentTime(incident.createdAt),
            cameraName: incident.cameraName || "None"
          }
        })
      });
      if (!res.ok) throw new Error("Gemini request failed");
      const data = await res.json();
      const result = {
        location: data.location || fallback.location,
        time: data.time || fallback.time,
        reason: data.reason || fallback.reason,
        duration: data.duration || fallback.duration
      };
      state.alertAiCache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.warn("Incident summary fallback:", err.message);
    }
    state.alertAiCache.set(cacheKey, fallback);
    return fallback;
  }

  // Alert Detail 页面渲染：基础字段 + AI 结果 + 摄像头证据
  async function renderAlertDetailPage() {
    const target = document.getElementById("alert-detail-content");
    if (!target) return;
    const incident = state.alertIncidentById.get(String(state.selectedAlertIncidentId || "")) ||
      state.dashboardIncidents.find((x) => String(x.id || "") === String(state.selectedAlertIncidentId || ""));
    if (!incident) {
      target.innerHTML = "<p>Incident not found.</p>";
      return;
    }

    target.innerHTML = `
      <h3>${escapeHtml(incidentTitle(incident))}</h3>
      <div class="alert-detail-grid">
        <div class="alert-detail-item"><span class="k">LOCATION</span><span class="v" id="detail-location">${escapeHtml(incident.area || "Unknown area")}</span></div>
        <div class="alert-detail-item"><span class="k">REPORTED TIME</span><span class="v" id="detail-time">${escapeHtml(formatIncidentTime(incident.createdAt))}</span></div>
        <div class="alert-detail-item"><span class="k">EST. SPREAD</span><span class="v">${escapeHtml(getIncidentSpreadText(incident))}</span></div>
        <div class="alert-detail-item"><span class="k">EST. DURATION</span><span class="v">${escapeHtml(getIncidentDurationText(incident))}</span></div>
        <div class="alert-detail-item"><span class="k">POSSIBLE REASON (AI)</span><span class="v" id="detail-reason">Generating summary...</span></div>
        <div class="alert-detail-item"><span class="k">POSSIBLE DURATION (AI)</span><span class="v" id="detail-duration">Generating summary...</span></div>
      </div>
      ${incident.cameraName || incident.imageLink ? `
      <div class="alert-detail-camera">
        <h4>Related Camera</h4>
        <p>${escapeHtml(incident.cameraName || "Nearby camera")}</p>
        ${incident.imageLink ? `<img src="${escapeHtml(incident.imageLink)}" alt="Incident camera evidence" loading="lazy" />` : ""}
      </div>
      ` : ""}
    `;

    const summary = await fetchGeminiIncidentSummary(incident);
    const locationEl = document.getElementById("detail-location");
    const timeEl = document.getElementById("detail-time");
    const reasonEl = document.getElementById("detail-reason");
    const durationEl = document.getElementById("detail-duration");
    if (!reasonEl || String(incident.id || "") !== String(state.selectedAlertIncidentId || "")) return;
    if (locationEl) locationEl.textContent = summary.location;
    if (timeEl) timeEl.textContent = summary.time;
    reasonEl.textContent = summary.reason;
    if (durationEl) durationEl.textContent = summary.duration;
  }

  // 事故排序：按时间/按严重度
  function sortIncidents(incidents, mode) {
    const list = [...(incidents || [])];
    if (mode === "severity") {
      return list.sort((a, b) => {
        const sd = getIncidentSeverityScore(b) - getIncidentSeverityScore(a);
        if (sd !== 0) return sd;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
    }
    return list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  function renderIncidentSortButton() {
    const btn = document.getElementById("incident-sort-btn");
    if (!btn) return;
    btn.textContent = state.incidentSortMode === "severity" ? "SORT: SEVERITY" : "SORT: TIME";
  }

  // 管理员可切换事故源（LTA LIVE / 模拟事故）
  function renderIncidentSourceButton() {
    const btn = document.getElementById("admin-incident-source-btn");
    if (!btn) return;
    const show = isAdmin();
    btn.classList.toggle("hidden", !show);
    if (!show) return;
    btn.textContent = state.incidentDataSource === "mock" ? "DATA: 模拟事故" : "DATA: LTA LIVE";
    btn.title = state.incidentDataSource === "mock"
      ? "当前展示管理员模拟事故数据（含消失判定）"
      : "当前展示 LTA 实时事故数据";
  }

  function renderIncidentUpdatesList() {
    const updatesEl = document.getElementById("dashboard-updates-list");
    if (!updatesEl) return;
    const sorted = sortIncidents(state.dashboardIncidents, state.incidentSortMode);
    updatesEl.innerHTML = sorted.map((it, idx) => `
      <li>
        <span class="dot ${getIncidentSeverityColor(it)}"></span>
        <div>
          <strong>${it.message || it.type || "Traffic incident"}</strong>
          <span class="meta">Area: ${it.area || "Unknown"} · Camera: ${it.cameraName || "N/A"} · Spread: ${getIncidentSpreadText(it)} · Duration: ${getIncidentDurationText(it)}</span>
        </div>
      </li>
    `).join("");
    renderAlertsPanels();
  }

  // 获取 Dashboard 事故数据；管理员可选择 live/mock
  async function fetchRealtimeIncidents() {
    const source = isAdmin() ? state.incidentDataSource : "live";
    const resp = await fetch(`/api/incidents?withImagesOnly=0&max=12&source=${encodeURIComponent(source)}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Failed to load incidents");
    return {
      incidents: data.value || [],
      meta: data.meta || null
    };
  }

  // 刷新 Dashboard 事故视图，并同步更新时间提示
  async function refreshDashboardIncidents() {
    const payload = await fetchRealtimeIncidents();
    state.incidentMeta = payload.meta || null;
    renderDashboardIncidents(payload.incidents || []);
    const hint = document.getElementById("summary-last-updated");
    if (hint && state.incidentMeta?.source === "mock") {
      const step = Number.isFinite(Number(state.incidentMeta.pollStep)) ? ` · Sim step ${state.incidentMeta.pollStep}` : "";
      const resolved = Number.isFinite(Number(state.incidentMeta.resolvedCount)) ? ` · Resolved this step: ${state.incidentMeta.resolvedCount}` : "";
      hint.textContent = `Last updated: ${new Date().toLocaleString("en-SG", { hour12: true })} · 模拟数据${step}${resolved}`;
    }
  }

  // Dashboard 事故列表与证据图主渲染
  function renderDashboardIncidents(incidents) {
    const overviewEl = document.getElementById("incident-overview-section");
    const recentEl = document.getElementById("recent-updates-section");
    const updatesEl = document.getElementById("dashboard-updates-list");
    const evidenceEl = document.getElementById("dashboard-evidence-list");
    if (!overviewEl || !recentEl || !updatesEl || !evidenceEl) return;

    if (!Array.isArray(incidents) || incidents.length === 0) {
      overviewEl.style.display = "none";
      recentEl.style.display = "none";
      state.dashboardIncidents = [];
      renderAlertsPanels();
      return;
    }

    overviewEl.style.display = "";
    recentEl.style.display = "";

    const totalIncidents = incidents.length;
    const high = incidents.filter((x) => getIncidentSeverityScore(x) === 3).length;
    const medium = incidents.filter((x) => getIncidentSeverityScore(x) === 2).length;
    const low = incidents.filter((x) => getIncidentSeverityScore(x) === 1).length;
    const highest = high > 0 ? "HIGH" : medium > 0 ? "MEDIUM" : "LOW";

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setText("incident-total-num", String(totalIncidents));
    setText("severity-high-num", String(high));
    setText("severity-medium-num", String(medium));
    setText("severity-low-num", String(low));
    setText("incident-highest-severity", `Highest severity: ${highest}`);
    setText("incident-max-radius", "Max congestion radius: 2.0 km");
    setText("live-incidents-total", String(totalIncidents));
    setText("live-incidents-breakdown", `${high} high, ${medium} medium, ${low} low`);
    state.dashboardIncidents = incidents;
    renderIncidentSortButton();
    renderIncidentUpdatesList();

    evidenceEl.innerHTML = incidents.slice(0, 6).map((it) => `
      <div class="evidence-card">
        ${it.imageLink
          ? `<img src="${it.imageLink}" alt="${it.message || "incident"}" loading="lazy" />`
          : `<div style="height:120px;display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#64748b;font-size:12px;">无附近摄像头图片</div>`}
        <div class="evidence-card-body">
          <div class="evidence-card-title">${it.type || "Traffic incident"}</div>
          <div class="evidence-card-meta">${it.area || "Unknown area"}</div>
          <div class="evidence-card-meta">Spread ${getIncidentSpreadText(it)} · Duration ${getIncidentDurationText(it)}</div>
          <div class="evidence-card-meta">${it.cameraName ? `Camera: ${it.cameraName}` : "No nearby camera, showing incident text only"}</div>
        </div>
      </div>
    `).join("");
  }

  // 管理员用户统计面板渲染（用户总数、验证数、会话数等）
  async function renderAdminUsersPanel() {
    const panel = document.getElementById("admin-users-panel");
    const statsEl = document.getElementById("admin-user-stats");
    const tbody = document.getElementById("admin-users-tbody");
    if (!panel || !statsEl || !tbody) return;
    if (!isAdmin()) {
      panel.classList.add("hidden");
      return;
    }

    panel.classList.remove("hidden");
    try {
      const [summaryResp, usersResp] = await Promise.all([
        window.fastAuthFetch("/api/admin/users/summary"),
        window.fastAuthFetch("/api/admin/users?limit=200")
      ]);
      const summary = await summaryResp.json();
      const usersData = await usersResp.json();
      if (!summaryResp.ok) throw new Error(summary.error || "Failed to load summary");
      if (!usersResp.ok) throw new Error(usersData.error || "Failed to load users");

      const stats = [
        ["Total", summary.totalUsers],
        ["Verified", summary.verifiedUsers],
        ["Admins", summary.adminUsers],
        ["Users", summary.normalUsers],
        ["Active Sessions", summary.activeSessions],
        ["New 7 Days", summary.newUsers7d]
      ];

      statsEl.innerHTML = stats.map(([k, v]) => `
        <div class="admin-user-stat">
          <span class="k">${k}</span>
          <span class="v">${v}</span>
        </div>
      `).join("");

      tbody.innerHTML = (usersData.value || []).map((u) => `
        <tr>
          <td>${u.id}</td>
          <td>${u.name}</td>
          <td>${u.email}</td>
          <td>${u.role}</td>
          <td>${u.email_verified ? "Yes" : "No"}</td>
          <td>${new Date(u.created_at).toLocaleString()}</td>
        </tr>
      `).join("");
    } catch (err) {
      statsEl.innerHTML = `<div class="admin-user-stat"><span class="k">Error</span><span class="v">-</span></div>`;
      tbody.innerHTML = `<tr><td colspan="6">Failed to load user table: ${err.message}</td></tr>`;
    }
  }

  // 右侧路线详情面板（普通规划）
  function showRouteDetails(route) {
    if (!route) return;
    const eva = state.routeContext?.evaluation?.evaluations?.get(route.id) || { eventDelayMin: 0, hitCount: 0 };
    const currentFastestId = state.routeContext?.currentFastestId || null;
    const nearbyCameras = (state.routeContext?.events || []).filter(e => distanceToRouteMeters(route.coords, e.lat, e.lon) <= 350).reduce((sum, e) => sum + (e.cameras?.length ? 1 : 0), 0);
    const totalMinutes = route.estMinutes + eva.eventDelayMin * 0.7;
    const trafficLevel = eva.eventDelayMin > 18 ? "Heavy" : eva.eventDelayMin > 8 ? "Moderate" : "Light";

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    const title = route.id === currentFastestId ? "FASTEST NOW" : (ROUTE_LABELS[route.id] || route.id.toUpperCase());
    setText("route-detail-title", title);
    setText("route-detail-time", `${Math.round(totalMinutes)} mins`);
    setText("route-detail-distance", `${(route.totalDist / 1000).toFixed(1)} km`);
    setText("route-detail-delay", `+${Math.round(eva.eventDelayMin)} mins`);
    setText("route-detail-lights", `${route.trafficLights} signals`);
    setText("route-detail-type", route.id === "fastest" ? "Expressway priority" : route.id === "fewerLights" ? "Intersection-light avoidance" : "Balanced urban route");
    setText("route-detail-speed", `Average speed: ${(route.totalDist / 1000 / (Math.max(totalMinutes, 1) / 60)).toFixed(1)} km/h`);
    setText("route-detail-cameras", `Cameras available: ${nearbyCameras}`);

    const trafficEl = document.getElementById("route-detail-traffic");
    if (trafficEl) {
      const dotColor = trafficLevel === "Heavy" ? "red" : trafficLevel === "Moderate" ? "orange" : "green";
      trafficEl.innerHTML = `<span class="dot ${dotColor}"></span> ${trafficLevel}`;
    }
  }

  // 右侧路线详情面板（管理员模拟）
  function showSimulationRouteDetails(sim, routeId) {
    if (!sim || !Array.isArray(sim.routes) || !sim.routes.length) return;
    const route = sim.routes.find(r => r.id === routeId) || sim.routes[0];
    if (!route) return;

    const trafficLevel = route.incidentDelayMin > 10 ? "Heavy" : route.incidentDelayMin > 4 ? "Moderate" : "Light";
    const avgSpeed = route.distanceKm / (Math.max(route.simulatedEtaMin, 1) / 60);
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    const strategyName = route.id === "fastest"
      ? "时间优先策略"
      : route.id === "fewerLights"
        ? "少红绿灯策略"
        : "均衡策略";
    setText("route-detail-title", `模拟 ${strategyName}`);
    setText("route-detail-time", `${Math.round(route.simulatedEtaMin)} mins`);
    setText("route-detail-distance", `${route.distanceKm.toFixed(1)} km`);
    setText("route-detail-delay", `+${Math.round(route.incidentDelayMin)} mins`);
    setText("route-detail-lights", `${route.lights} signals`);
    setText("route-detail-type", "Standalone A* simulation route");
    setText("route-detail-speed", `Average speed: ${avgSpeed.toFixed(1)} km/h`);
    setText("route-detail-cameras", `Simulation incidents: ${route.incidents.length}`);

    const trafficEl = document.getElementById("route-detail-traffic");
    if (trafficEl) {
      const dotColor = trafficLevel === "Heavy" ? "red" : trafficLevel === "Moderate" ? "orange" : "green";
      trafficEl.innerHTML = `<span class="dot ${dotColor}"></span> ${trafficLevel}`;
    }
  }

  // 渲染 3 条路线卡片，并按“含事件延误后的 ETA”排序
  function renderRouteCards() {
    const container = document.getElementById("route-cards");
    const title = document.getElementById("route-options-title");
    if (!container) return;
    if (title) title.textContent = `ROUTE OPTIONS (${state.routePlans.length}) · SORTED BY TIME`;

    const currentFastestId = state.routeContext?.currentFastestId || null;
    const enriched = state.routePlans.map((r) => {
      const eva = state.routeContext?.evaluation?.evaluations?.get(r.id) || { eventDelayMin: 0 };
      const totalMinutes = r.estMinutes + eva.eventDelayMin * 0.7;
      const trafficLevel = eva.eventDelayMin > 18 ? "Heavy" : eva.eventDelayMin > 8 ? "Moderate" : "Light";
      const routeLabel = r.id === currentFastestId ? "FASTEST NOW" : (ROUTE_LABELS[r.id] || r.id.toUpperCase());
      return { r, eva, totalMinutes, trafficLevel, routeLabel };
    });

    const minTotal = Math.min(...enriched.map(x => x.totalMinutes));
    const minDist = Math.min(...enriched.map(x => x.r.totalDist));
    const minLights = Math.min(...enriched.map(x => x.r.trafficLights));
    const avgTotal = enriched.reduce((sum, x) => sum + x.totalMinutes, 0) / Math.max(1, enriched.length);

    const sorted = enriched.slice().sort((a, b) => a.totalMinutes - b.totalMinutes);

    function getStatusTag(item) {
      if (Math.abs(item.totalMinutes - minTotal) < 1e-6) return "时间最短";
      if (Math.abs(item.r.totalDist - minDist) < 1e-6) return "距离最短";
      if (item.r.trafficLights === minLights) return "红绿灯最少";
      const dev = Math.abs(item.totalMinutes - avgTotal);
      const minDev = Math.min(...sorted.map(x => Math.abs(x.totalMinutes - avgTotal)));
      if (Math.abs(dev - minDev) < 1e-6) return "综合平均";
      return "综合路线";
    }

    container.innerHTML = sorted.map((item, idx) => {
      const r = item.r;
      const eva = item.eva;
      const totalMinutes = item.totalMinutes;
      const trafficLevel = item.trafficLevel;
      const routeLabel = item.routeLabel;
      const statusTag = getStatusTag(item);
      return `
      <div class="route-card ${r.id === state.selectedRouteId ? "selected" : ""}" data-route-id="${r.id}">
        <div class="route-card-main">${Math.round(totalMinutes)} mins</div>
        <div class="route-card-erp">+${Math.round(eva.eventDelayMin)} mins delay</div>
        <div class="route-card-status">#${idx + 1} · ${statusTag}</div>
        <div class="route-card-icons">
          <span class="icon-plane"></span>
          <span class="icon-traffic">${r.trafficLights}</span>
          <span class="dot ${trafficLevel === "Heavy" ? "red" : trafficLevel === "Moderate" ? "orange" : "green"}"></span>
        </div>
        <div class="route-card-metrics">Distance ${(r.totalDist / 1000).toFixed(1)} km · Lights ${r.trafficLights}</div>
      </div>
    `;
    }).join("");

    container.querySelectorAll(".route-card").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-route-id");
        selectRoute(id);
      });
    });
  }

  // 在规划地图绘制路线折线，并突出选中路线
  function drawRoutes(startGeo, endGeo) {
    if (!state.plannerMap || !state.routeLayer || !state.plannerLayer) return;
    state.routeLayer.clearLayers();
    state.routePolylines.clear();
    state.plannerLayer.clearLayers();

    L.marker([startGeo.lat, startGeo.lon]).bindPopup("Origin").addTo(state.plannerLayer);
    L.marker([endGeo.lat, endGeo.lon]).bindPopup("Destination").addTo(state.plannerLayer);

    state.routePlans.forEach((r) => {
      const line = L.polyline(r.coords, {
        color: r.color || ROUTE_COLORS[r.id] || "#2563eb",
        weight: r.id === state.selectedRouteId ? 6 : 4,
        opacity: r.id === state.selectedRouteId ? 0.95 : 0.55
      }).addTo(state.routeLayer);
      line.routeId = r.id;
      state.routePolylines.set(r.id, line);
    });

    const selected = state.routePlans.find(r => r.id === state.selectedRouteId) || state.routePlans[0];
    if (selected) {
      const bounds = L.latLngBounds(selected.coords.map(c => [c[0], c[1]]));
      state.plannerMap.fitBounds(bounds.pad(0.15));
      showRouteDetails(selected);
    }
  }

  // 用户点击路线卡片后的联动：高亮折线 + 刷新详情 + 同步 Alerts
  function selectRoute(routeId) {
    state.selectedRouteId = routeId;
    const selected = state.routePlans.find(r => r.id === routeId);
    if (!selected) return;
    showRouteDetails(selected);
    renderRouteCards();
    if (state.routeLayer) {
      state.routeLayer.eachLayer((layer) => {
        const id = layer.routeId;
        layer.setStyle({
          weight: id === routeId ? 6 : 4,
          opacity: id === routeId ? 0.95 : 0.55
        });
      });
    }
    renderAlertsPanels();
  }

  // 获取并标准化摄像头数据（聚合来源由后端负责）
  async function fetchCameras() {
    const res = await fetch("/api/cameras?max=4000");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load cameras");
    return (data.value || []).map((cam, i) => ({
      id: cam.CameraID || `cam-${i}`,
      name: cam.Name || `Camera ${i + 1}`,
      source: cam.Source || "Unknown",
      lat: parseFloat(cam.Latitude),
      lon: parseFloat(cam.Longitude),
      imageLink: cam.ImageLink || null,
      hasRealtimeImage: Boolean(cam.HasRealtimeImage && cam.ImageLink)
    })).filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lon));
  }

  // 地理编码：支持邮编/地名/MRT（后端做多源解析）
  async function geocodeLocation(inputText) {
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(inputText)}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Geocode failed");
    return { lat: parseFloat(d.lat), lon: parseFloat(d.lon), display: d.display || inputText };
  }

  // 旧版前端本地寻路使用：保留作为兼容/调试函数
  async function fetchRoadsForBounds(startGeo, endGeo) {
    const padLat = 0.07;
    const padLon = 0.09;
    const minLat = Math.min(startGeo.lat, endGeo.lat) - padLat;
    const maxLat = Math.max(startGeo.lat, endGeo.lat) + padLat;
    const minLon = Math.min(startGeo.lon, endGeo.lon) - padLon;
    const maxLon = Math.max(startGeo.lon, endGeo.lon) + padLon;
    const q = new URLSearchParams({
      minLat: String(minLat),
      minLon: String(minLon),
      maxLat: String(maxLat),
      maxLon: String(maxLon)
    });
    const r = await fetch(`/api/roads?${q.toString()}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Roads API failed");
    return d;
  }

  // 新版路径规划入口：调用后端 /api/route-plan（Python A*）
  async function fetchRoutePlansFromPython(startGeo, endGeo, paddingDeg) {
    const resp = await fetch("/api/route-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: { lat: startGeo.lat, lon: startGeo.lon },
        end: { lat: endGeo.lat, lon: endGeo.lon },
        paddingDeg: Number.isFinite(Number(paddingDeg)) ? Number(paddingDeg) : undefined
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Python route-plan failed");
    const routes = Array.isArray(data.routes) ? data.routes : [];
    return routes
      .map((r) => ({
        id: r.id,
        label: r.label || (ROUTE_LABELS[r.id] || String(r.id || "").toUpperCase()),
        color: r.color || ROUTE_COLORS[r.id] || "#2563eb",
        desc: r.desc || "",
        totalDist: Number(r.totalDist),
        estMinutes: Number(r.estMinutes),
        trafficLights: Math.max(0, Math.round(Number(r.trafficLights) || 0)),
        coords: (Array.isArray(r.coords) ? r.coords : []).map((c) => [Number(c[0]), Number(c[1])]).filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1])),
        signature: r.signature || `${r.id || "route"}-${Math.random().toString(36).slice(2, 8)}`,
        path: []
      }))
      .filter((r) => r.id && Number.isFinite(r.totalDist) && Number.isFinite(r.estMinutes) && Array.isArray(r.coords) && r.coords.length >= 2);
  }

  // 读取管理员模拟配置（事件比例、延误、严重度等）
  async function loadAdminSimulationConfig() {
    if (!isAdmin()) return;
    const panel = document.getElementById("admin-sim-panel");
    if (!panel) return;
    panel.classList.remove("hidden");
    try {
      const resp = await window.fastAuthFetch("/api/admin/simulation-config");
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Load config failed");
      state.adminSimulationConfig = data.config || null;
    } catch (err) {
      console.error(err);
      state.adminSimulationConfig = null;
    }
  }

  async function saveAdminSimulationConfig() {
    return;
  }

  // 构造管理员“独立模拟路段”：固定起终点 + 3 条路线 + 模拟事故
  async function buildStandaloneSimulation() {
    const start = { lat: 1.3114, lon: 103.7808, label: "Sim Start (Queenstown)" };
    const end = { lat: 1.3694, lon: 103.9496, label: "Sim End (Tampines)" };
    const plans = (await fetchRoutePlansFromPython(start, end, 0.03)).slice(0, 3);
    if (plans.length < 2) throw new Error("Not enough simulation route options");

    let shortestRoute = plans[0];
    for (const p of plans) {
      if (p.totalDist < shortestRoute.totalDist) shortestRoute = p;
    }

    const shortestCoords = shortestRoute.coords || getRouteCoords(shortestRoute, start, end);
    const idx = Math.max(1, Math.min(shortestCoords.length - 2, Math.floor((shortestCoords.length - 1) * 0.56)));
    const congestionPoint = shortestCoords[idx];
    const simNow = Date.now();
    const incidents = [
      {
        id: "sim-congestion-1",
        routeId: shortestRoute.id,
        label: "模拟拥堵",
        lat: congestionPoint[0],
        lon: congestionPoint[1],
        delayMin: 12,
        severity: "High",
        color: "#ef4444",
        area: "SIM Corridor A",
        createdAt: new Date(simNow).toISOString(),
        message: "前方两车追尾占用1条车道，导致车辆排队回堵",
        reason: "两车追尾占道，通行能力下降"
      },
      {
        id: "sim-roadwork-1",
        routeId: shortestRoute.id,
        label: "模拟施工",
        lat: shortestCoords[Math.max(1, idx - 1)][0],
        lon: shortestCoords[Math.max(1, idx - 1)][1],
        delayMin: 4,
        severity: "Medium",
        color: "#a855f7",
        area: "SIM Corridor A",
        createdAt: new Date(simNow + 60 * 1000).toISOString(),
        message: "道路养护临时封闭慢车道，需并线通过",
        reason: "道路养护导致车道收窄"
      },
      {
        id: "sim-breakdown-1",
        routeId: shortestRoute.id,
        label: "模拟故障车",
        lat: shortestCoords[Math.min(shortestCoords.length - 2, idx + 1)][0],
        lon: shortestCoords[Math.min(shortestCoords.length - 2, idx + 1)][1],
        delayMin: 6,
        severity: "Medium",
        color: "#f59e0b",
        area: "SIM Corridor A",
        createdAt: new Date(simNow + 2 * 60 * 1000).toISOString(),
        message: "故障车辆停靠应急带，间歇影响主线汇入",
        reason: "故障车引发瓶颈波动"
      }
    ];

    const routeSummaries = plans.map((p) => {
      const ownIncidents = incidents.filter(i => i.routeId === p.id);
      const incidentDelay = ownIncidents.reduce((sum, x) => sum + x.delayMin, 0);
      const simulatedEtaMin = p.estMinutes + incidentDelay;
      return {
        id: p.id,
        label: p.label,
        color: p.color,
        coords: p.coords || getRouteCoords(p, start, end),
        distanceKm: p.totalDist / 1000,
        lights: p.trafficLights,
        baseEtaMin: p.estMinutes,
        incidentDelayMin: incidentDelay,
        simulatedEtaMin,
        incidents: ownIncidents
      };
    });

    routeSummaries.sort((a, b) => a.simulatedEtaMin - b.simulatedEtaMin);
    const fastestByTimeId = routeSummaries[0].id;
    const shortestByDistanceId = shortestRoute.id;

    return {
      start,
      end,
      routes: routeSummaries,
      incidents,
      generatedAt: new Date(simNow).toISOString(),
      notes: {
        shortestByDistanceId,
        fastestByTimeId
      }
    };
  }

  // 渲染管理员模拟结果卡片区（可点击切换高亮路线）
  function renderStandaloneSimulationInfo(sim) {
    const target = document.getElementById("admin-sim-results");
    const toggleBtn = document.getElementById("admin-toggle-sim-btn");
    if (toggleBtn) toggleBtn.textContent = state.adminSimulationVisible ? "HIDE SIMULATION" : "GENERATE SIMULATION";
    if (!target) return;

    if (!state.adminSimulationVisible) {
      target.innerHTML = `<div class="admin-sim-card"><h4>Simulation Hidden</h4><p>Click "GENERATE SIMULATION" to display a standalone simulated route.</p></div>`;
      return;
    }

    if (!sim || !Array.isArray(sim.routes) || !sim.routes.length) {
      target.innerHTML = `<div class="admin-sim-card"><h4>No Simulation</h4><p>Unable to build simulation routes.</p></div>`;
      return;
    }

    const strategyName = (id) => {
      if (id === "fastest") return "时间优先策略";
      if (id === "fewerLights") return "少红绿灯策略";
      return "均衡策略";
    };

    target.innerHTML = sim.routes.map((r, idx) => {
      const tags = [];
      if (r.id === sim.notes.fastestByTimeId) tags.push("时间最短");
      if (r.id === sim.notes.shortestByDistanceId) tags.push("路径最短");
      if (!tags.length) tags.push("备选路线");
      const incidentText = r.incidents.length
        ? r.incidents.map(i => `${i.label}(+${i.delayMin}m, ${formatIncidentTime(i.createdAt)}): ${i.reason}`).join(" · ")
        : "No major incidents";
      const selected = r.id === state.adminSimulationSelectedRouteId;
      return `
        <div class="admin-sim-card ${selected ? "selected" : ""}" data-sim-route-id="${r.id}">
          <h4>#${idx + 1} 模拟路线 ${String.fromCharCode(65 + idx)}</h4>
          <p>策略: ${strategyName(r.id)}</p>
          <p>状态: ${tags.join(" / ")}</p>
          <p>距离: ${r.distanceKm.toFixed(1)} km · 红绿灯: ${r.lights}</p>
          <p>基础时间: ${Math.round(r.baseEtaMin)} mins · 延误: +${Math.round(r.incidentDelayMin)} mins · 模拟总时间: ${Math.round(r.simulatedEtaMin)} mins</p>
          <p>事故/路况: ${incidentText}</p>
        </div>
      `;
    }).join("");

    target.querySelectorAll(".admin-sim-card[data-sim-route-id]").forEach((el) => {
      el.addEventListener("click", () => {
        const rid = el.getAttribute("data-sim-route-id");
        state.adminSimulationSelectedRouteId = rid;
        drawStandaloneSimulation(state.adminSimulationData);
        renderStandaloneSimulationInfo(state.adminSimulationData);
        showSimulationRouteDetails(state.adminSimulationData, rid);
        renderAlertsPanels();
      });
    });
  }

  // 在地图绘制模拟路线、模拟起终点与模拟事故点
  function drawStandaloneSimulation(sim) {
    if (!state.adminSimulationLayer || !state.plannerMap) return;
    state.adminSimulationLayer.clearLayers();
    if (!state.adminSimulationVisible) return;
    if (!sim || !Array.isArray(sim.routes)) return;

    const selectedId = state.adminSimulationSelectedRouteId || sim.notes.fastestByTimeId;

    sim.routes.forEach((r, idx) => {
      const isSelected = r.id === selectedId;
      L.polyline(r.coords, {
        color: r.color || (idx === 1 ? "#f59e0b" : "#22c55e"),
        weight: isSelected ? 7 : 3,
        opacity: isSelected ? 0.96 : 0.28,
        dashArray: isSelected ? null : "8 6"
      }).bindPopup(`${r.label}<br/>${Math.round(r.simulatedEtaMin)} mins`).addTo(state.adminSimulationLayer);
    });

    L.circleMarker([sim.start.lat, sim.start.lon], {
      radius: 8, fillColor: "#22c55e", color: "#fff", weight: 2, fillOpacity: 1
    }).bindPopup(sim.start.label).addTo(state.adminSimulationLayer);

    L.circleMarker([sim.end.lat, sim.end.lon], {
      radius: 8, fillColor: "#e94560", color: "#fff", weight: 2, fillOpacity: 1
    }).bindPopup(sim.end.label).addTo(state.adminSimulationLayer);

    const selectedRouteIncidents = (sim.incidents || []).filter(evt => evt.routeId === selectedId);
    selectedRouteIncidents.forEach((evt) => {
      L.circleMarker([evt.lat, evt.lon], {
        radius: 7, fillColor: evt.color, color: "#fff", weight: 2, fillOpacity: 0.95
      }).bindPopup(`${evt.label} · ${evt.severity} · +${evt.delayMin} mins`).addTo(state.adminSimulationLayer);
    });

    const allCoords = sim.routes.flatMap(r => r.coords || []);
    state.plannerMap.fitBounds(L.latLngBounds(allCoords.map(c => [c[0], c[1]])).pad(0.15));
  }

  // 管理员“生成/隐藏模拟路段”总开关
  async function toggleStandaloneSimulation() {
    if (!isAdmin()) return;
    state.adminSimulationVisible = !state.adminSimulationVisible;
    try {
      const simulation = state.adminSimulationVisible ? await buildStandaloneSimulation() : null;
      state.adminSimulationData = simulation;
      state.adminSimulationSelectedRouteId = simulation?.notes?.fastestByTimeId || null;
      drawStandaloneSimulation(state.adminSimulationData);
      renderStandaloneSimulationInfo(state.adminSimulationData);
      if (state.adminSimulationVisible && state.adminSimulationData) {
        showSimulationRouteDetails(state.adminSimulationData, state.adminSimulationSelectedRouteId);
      } else {
        const normalRoute = state.routePlans.find(r => r.id === state.selectedRouteId) || state.routePlans[0];
        if (normalRoute) showRouteDetails(normalRoute);
      }
      renderAlertsPanels();
    } catch (err) {
      state.adminSimulationVisible = false;
      state.adminSimulationData = null;
      state.adminSimulationSelectedRouteId = null;
      drawStandaloneSimulation(state.adminSimulationData);
      const target = document.getElementById("admin-sim-results");
      if (target) target.innerHTML = `<div class="admin-sim-card"><h4>Simulation Error</h4><p>${err.message}</p></div>`;
      renderAlertsPanels();
    }
  }

  // 普通路径规划主流程：
  // 1) 输入解析与地理编码
  // 2) 调后端 Python 生成 3 条路线
  // 3) 叠加事件评估并决定“当前最快”
  // 4) 刷新地图、路线卡片、详情与 Alerts
  async function calculateRoutes() {
    const btn = document.getElementById("route-calculate-btn");
    const hintEl = document.getElementById("route-planning-hint");
    const startInput = document.getElementById("route-start-postal");
    const endInput = document.getElementById("route-end-postal");
    const startQuery = (startInput?.value || "").trim();
    const endQuery = (endInput?.value || "").trim();

    if (!startQuery || !endQuery) {
      alert("Please enter start and destination (postal code or location name).");
      return;
    }

    if (btn) btn.disabled = true;
    const startedAt = Date.now();
    if (hintEl) hintEl.textContent = "Planning route... estimated time 5-15 seconds.";
    try {
      const [userLoc, startGeo, endGeo] = await Promise.all([getUserLocation(), geocodeLocation(startQuery), geocodeLocation(endQuery)]);
      const plans = await fetchRoutePlansFromPython(startGeo, endGeo, 0.03);
      if (!plans.length) throw new Error("No valid route plan generated.");

      const defaultRoute = plans.find(r => r.id === "fastest") || plans[0];
      const baseCoords = getRouteCoords(defaultRoute, startGeo, endGeo);
      const realtimeCameras = state.cameras.filter(c => c.hasRealtimeImage);
      const relevantEvents = analyzeEvents(buildSyntheticEvents(baseCoords, state.adminSimulationConfig), userLoc, baseCoords);
      const eventsWithCameras = attachEventCameras(relevantEvents, realtimeCameras);
      const evaluation = evaluateRoutesByEvents(plans, eventsWithCameras, startGeo, endGeo);
      let currentFastestId = plans[0].id;
      let fastestMinutes = Infinity;
      for (const p of plans) {
        const e = evaluation.evaluations.get(p.id) || { eventDelayMin: 0 };
        const total = p.estMinutes + e.eventDelayMin * 0.7;
        if (total < fastestMinutes) {
          fastestMinutes = total;
          currentFastestId = p.id;
        }
      }

      state.routePlans = plans;
      state.routeContext = {
        userLoc,
        events: eventsWithCameras,
        evaluation,
        startGeo,
        endGeo,
        currentFastestId,
        generatedAt: new Date().toISOString()
      };
      state.selectedRouteId = evaluation.recommendedRouteId || plans[0].id;

      drawRoutes(startGeo, endGeo);
      renderRouteCards();
      showRouteDetails(state.routePlans.find(r => r.id === state.selectedRouteId));
      if (state.adminSimulationVisible && state.adminSimulationData) {
        showSimulationRouteDetails(state.adminSimulationData, state.adminSimulationSelectedRouteId);
      }
      renderAlertsPanels();
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (hintEl) hintEl.textContent = `Route planning completed in ${elapsed}s. 3 routes are sorted by ETA.`;
    } catch (err) {
      alert(`Route calculation failed: ${err.message}`);
      if (hintEl) hintEl.textContent = `Route planning failed: ${err.message}`;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // 统一绑定所有页面事件：按钮、tab、hash、列表项、dismiss 等
  function bindActions() {
    const calcBtn = document.getElementById("route-calculate-btn");
    if (calcBtn) calcBtn.addEventListener("click", calculateRoutes);

    const viewCameraBtn = document.getElementById("route-view-cameras-btn");
    if (viewCameraBtn) {
      viewCameraBtn.addEventListener("click", () => {
        const tab = document.querySelector('.nav-tab[data-page="map-view"]');
        if (tab) tab.click();
      });
    }

    const simToggleBtn = document.getElementById("admin-toggle-sim-btn");
    if (simToggleBtn) simToggleBtn.addEventListener("click", toggleStandaloneSimulation);
    const adminUsersRefreshBtn = document.getElementById("admin-users-refresh-btn");
    if (adminUsersRefreshBtn) adminUsersRefreshBtn.addEventListener("click", renderAdminUsersPanel);
    const incidentSortBtn = document.getElementById("incident-sort-btn");
    if (incidentSortBtn) {
      incidentSortBtn.addEventListener("click", () => {
        state.incidentSortMode = state.incidentSortMode === "time" ? "severity" : "time";
        renderIncidentSortButton();
        renderIncidentUpdatesList();
      });
    }
    const mapIncidentToggleBtn = document.getElementById("map-toggle-incidents-btn");
    if (mapIncidentToggleBtn) {
      mapIncidentToggleBtn.addEventListener("click", async () => {
        mapIncidentToggleBtn.disabled = true;
        try {
          await toggleMapIncidentsLayer();
        } catch (err) {
          alert(`Load LTA incidents failed: ${err.message}`);
        } finally {
          mapIncidentToggleBtn.disabled = false;
        }
      });
    }
    const incidentSourceBtn = document.getElementById("admin-incident-source-btn");
    if (incidentSourceBtn) {
      incidentSourceBtn.addEventListener("click", async () => {
        if (!isAdmin()) return;
        state.incidentDataSource = state.incidentDataSource === "live" ? "mock" : "live";
        renderIncidentSourceButton();
        try {
          await refreshDashboardIncidents();
        } catch (err) {
          console.error(err);
          alert(`切换事故数据源失败: ${err.message}`);
        }
      });
    }

    const alertBackBtn = document.getElementById("alert-detail-back-btn");
    if (alertBackBtn) {
      alertBackBtn.addEventListener("click", () => {
        window.location.hash = "alerts";
      });
    }

    document.addEventListener("click", (e) => {
      const detailBtn = e.target.closest(".alert-view-detail-btn");
      if (detailBtn) {
        const incidentId = detailBtn.getAttribute("data-incident-id");
        state.selectedAlertIncidentId = incidentId;
        window.location.hash = "alert-detail";
        renderAlertDetailPage();
        return;
      }
      const dismissBtn = e.target.closest(".alert-dismiss-btn");
      if (dismissBtn) {
        const incidentId = dismissBtn.getAttribute("data-incident-id");
        state.alertDismissedIds.add(String(incidentId || ""));
        renderAlertsPanels();
      }
    });

    window.addEventListener("hashchange", () => {
      const page = (window.location.hash || "#dashboard").slice(1);
      if (page === "alerts") {
        renderAlertsPanels();
        refreshAlertsInfoFeed();
      }
      if (page === "alert-detail") {
        if (!state.selectedAlertIncidentId && state.dashboardIncidents.length) {
          state.selectedAlertIncidentId = String(state.dashboardIncidents[0].id || "");
        }
        renderAlertDetailPage();
      }
    });

    const tabs = document.querySelectorAll(".nav-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        if (tab.getAttribute("data-page") === "alerts") {
          renderAlertsPanels();
          refreshAlertsInfoFeed();
        }
        setTimeout(() => {
          if (state.liveMap) state.liveMap.invalidateSize();
          if (state.plannerMap) state.plannerMap.invalidateSize();
        }, 40);
      });
    });
  }

  // 页面启动入口：初始化地图、拉取基础数据、按当前 hash 渲染目标页面
  async function bootstrapDemo() {
    if (!window.L) return;
    ensureMaps();
    bindActions();

    try {
      const panel = document.getElementById("admin-sim-panel");
      if (panel) panel.classList.toggle("hidden", !isAdmin());
      if (isAdmin()) await loadAdminSimulationConfig();
      renderIncidentSourceButton();
      renderMapIncidentToggleButton();
      state.cameras = await fetchCameras();
      updateDashboardStats();
      try {
        await refreshDashboardIncidents();
      } catch (incErr) {
        console.error(incErr);
        state.dashboardIncidents = [];
        renderAlertsPanels();
        renderDashboardEvidence();
      }
      await renderAdminUsersPanel();
      renderLiveMapAndList();
      if (state.mapIncidentsVisible) drawLiveIncidentMarkers(state.mapLiveIncidents);
      if (isAdmin()) renderStandaloneSimulationInfo(null);
      const currentPage = (window.location.hash || "#dashboard").slice(1);
      if (currentPage === "alerts") renderAlertsPanels();
      if (currentPage === "alerts") refreshAlertsInfoFeed();
      if (currentPage === "alert-detail") {
        if (!state.selectedAlertIncidentId && state.dashboardIncidents.length) {
          state.selectedAlertIncidentId = String(state.dashboardIncidents[0].id || "");
        }
        renderAlertDetailPage();
      }
      setTimeout(() => {
        if (state.liveMap) state.liveMap.invalidateSize();
        if (state.plannerMap) state.plannerMap.invalidateSize();
      }, 80);
    } catch (err) {
      console.error(err);
    }
  }

  // 登录态变化后的全局重同步：管理员区块、事故源、模拟状态、告警联动全部刷新
  window.addEventListener("fast-auth-changed", async () => {
    const panel = document.getElementById("admin-sim-panel");
    if (panel) panel.classList.toggle("hidden", !isAdmin());
    const simResults = document.getElementById("admin-sim-results");
    const usersPanel = document.getElementById("admin-users-panel");
    if (usersPanel) usersPanel.classList.toggle("hidden", !isAdmin());
    if (!isAdmin()) state.incidentDataSource = "live";
    renderIncidentSourceButton();
    if (isAdmin()) {
      await loadAdminSimulationConfig();
      await renderAdminUsersPanel();
      state.adminSimulationData = null;
      state.adminSimulationSelectedRouteId = null;
      renderStandaloneSimulationInfo(state.adminSimulationData);
    } else {
      state.adminSimulationConfig = null;
      state.adminSimulationVisible = false;
      state.adminSimulationData = null;
      state.adminSimulationSelectedRouteId = null;
      if (state.adminSimulationLayer) state.adminSimulationLayer.clearLayers();
      if (simResults) simResults.innerHTML = "";
    }
    try {
      await refreshDashboardIncidents();
    } catch (err) {
      console.error(err);
    }
    renderAlertsPanels();
    refreshAlertsInfoFeed();
  });

  // 模块真实启动点
  document.addEventListener("DOMContentLoaded", bootstrapDemo);
})();
