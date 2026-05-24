(function () {
  const api = window.roadtripApi;
  const days = window.ROADTRIP_DAYS || [];
  const state = {
    session: null,
    user: null,
    publicUser: null,
    profile: null,
    activeDay: null,
    activeKind: "notes",
    activeTarget: { type: "page", id: "roadtrip-2026" },
    entries: []
  };

  const els = {
    authBar: document.getElementById("authBar"),
    profileModal: document.getElementById("profileModal"),
    profileForm: document.getElementById("profileForm"),
    displayNameInput: document.getElementById("displayNameInput"),
    profileError: document.getElementById("profileError"),
    cancelProfile: document.getElementById("cancelProfile"),
    drawer: document.getElementById("collabDrawer"),
    closeDrawer: document.getElementById("closeCollabDrawer"),
    drawerKind: document.getElementById("collabDrawerKind"),
    drawerTitle: document.getElementById("collabDrawerTitle"),
    drawerSubtitle: document.getElementById("collabDrawerSubtitle"),
    notesTab: document.getElementById("notesTab"),
    commentsTab: document.getElementById("commentsTab"),
    status: document.getElementById("collabStatus"),
    list: document.getElementById("collabList"),
    form: document.getElementById("collabForm"),
    body: document.getElementById("collabBody"),
    bodyLabel: document.getElementById("collabBodyLabel"),
    formHint: document.getElementById("collabFormHint"),
    submit: document.getElementById("submitCollab")
  };

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function defaultAvatar(name) {
    const label = encodeURIComponent(String(name || "旅").slice(0, 1));
    return `https://api.dicebear.com/9.x/initials/svg?seed=${label}`;
  }

  function openProfileModal(message = "") {
    els.profileError.textContent = message;
    els.profileModal.classList.add("is-open");
    els.profileModal.setAttribute("aria-hidden", "false");
    els.displayNameInput.focus();
  }

  function closeProfileModal() {
    els.profileModal.classList.remove("is-open");
    els.profileModal.setAttribute("aria-hidden", "true");
  }

  function renderAuthBar() {
    if (!api?.isConfigured) {
      els.authBar.innerHTML = `<span class="collab-error">评论功能待配置 Supabase</span>`;
      return;
    }
    if (!state.user) {
      els.authBar.innerHTML = `<button class="auth-button" id="loginButton" type="button">登录授权</button>`;
      document.getElementById("loginButton").addEventListener("click", handleLogin);
      return;
    }
    const name = state.profile?.display_name || state.publicUser?.providerName || "设置姓名";
    const avatar = state.profile?.avatar_url || state.publicUser?.avatarUrl || defaultAvatar(name);
    els.authBar.innerHTML = `
      <span class="user-chip">
        <img class="avatar" src="${escapeHtml(avatar)}" alt="">
        <span>${escapeHtml(name)}</span>
      </span>
      ${state.profile ? "" : '<button class="auth-button" id="setNameButton" type="button">设置姓名</button>'}
      <button class="auth-button" id="logoutButton" type="button">退出</button>
    `;
    const setNameButton = document.getElementById("setNameButton");
    if (setNameButton) setNameButton.addEventListener("click", () => openProfileModal());
    document.getElementById("logoutButton").addEventListener("click", handleLogout);
  }

  async function handleLogin() {
    try {
      await api.signInWithOAuth();
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleLogout() {
    await api.signOut();
    state.session = null;
    state.user = null;
    state.publicUser = null;
    state.profile = null;
    renderAuthBar();
    renderFormState();
  }

  async function loadSession() {
    if (!api) return;
    const { session, user } = await api.getSession();
    state.session = session;
    state.user = user;
    state.publicUser = api.publicUser(user);
    state.profile = user ? await api.getProfile(user.id) : null;
    renderAuthBar();
    renderFormState();
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    if (!state.user) {
      els.profileError.textContent = "请先登录授权";
      return;
    }
    try {
      const profile = await api.saveProfile({
        userId: state.user.id,
        displayName: els.displayNameInput.value,
        avatarUrl: state.publicUser?.avatarUrl
      });
      state.profile = profile;
      closeProfileModal();
      renderAuthBar();
      renderFormState();
    } catch (error) {
      els.profileError.textContent = error.message;
    }
  }

  function dayById(dayId) {
    return days.find((day) => Number(day.day) === Number(dayId));
  }

  function setActiveTab(kind) {
    state.activeKind = kind;
    els.notesTab.classList.toggle("is-active", kind === "notes");
    els.commentsTab.classList.toggle("is-active", kind === "comments");
    els.bodyLabel.textContent = kind === "notes" ? "添加公开备注" : "添加公开评论";
    els.body.placeholder = kind === "notes"
      ? "写下停车、补给、门票、避坑或路线建议"
      : "写下你对这段路线、预算或安排的看法";
  }

  function openDrawer({ dayId, kind }) {
    const day = dayById(dayId);
    if (!day) return;
    state.activeDay = day;
    state.activeTarget = { type: "day", id: String(day.day) };
    setActiveTab(kind || "notes");
    els.drawerKind.textContent = day.phase;
    els.drawerTitle.textContent = `D${day.day} ${day.route}`;
    els.drawerSubtitle.textContent = `${day.dateText} · ${day.overnight}`;
    els.drawer.classList.add("is-open");
    els.drawer.setAttribute("aria-hidden", "false");
    renderFormState();
    loadEntries().catch(showStatusError);
  }

  function closeDrawer() {
    els.drawer.classList.remove("is-open");
    els.drawer.setAttribute("aria-hidden", "true");
    state.entries = [];
    els.list.innerHTML = "";
    els.body.value = "";
  }

  function showStatus(message) {
    els.status.textContent = message || "";
    els.status.classList.remove("collab-error");
  }

  function showStatusError(error) {
    els.status.textContent = error.message || "加载失败，请稍后重试";
    els.status.classList.add("collab-error");
  }

  function canModerate() {
    return state.profile?.role === "admin";
  }

  function canEdit(entry) {
    return Boolean(state.user && entry.author_id === state.user.id);
  }

  function formatTime(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function entryAuthor(entry) {
    return entry.profiles || {};
  }

  function renderEntries() {
    if (!state.entries.length) {
      els.list.innerHTML = `<div class="collab-item">还没有公开${state.activeKind === "notes" ? "备注" : "评论"}，可以来写第一条。</div>`;
      return;
    }
    els.list.innerHTML = state.entries.map((entry) => {
      const author = entryAuthor(entry);
      const name = author.display_name || "匿名用户";
      const avatar = author.avatar_url || defaultAvatar(name);
      const actions = [];
      if (canEdit(entry)) actions.push(`<button class="mini-action" type="button" data-entry-action="edit" data-entry-id="${entry.id}">编辑</button>`);
      if (canEdit(entry)) actions.push(`<button class="mini-action" type="button" data-entry-action="delete" data-entry-id="${entry.id}">删除</button>`);
      if (canModerate()) actions.push(`<button class="mini-action" type="button" data-entry-action="hide" data-entry-id="${entry.id}">隐藏</button>`);
      return `
        <article class="collab-item">
          <div class="collab-item-head">
            <span class="collab-author">
              <img class="avatar" src="${escapeHtml(avatar)}" alt="">
              <span>${escapeHtml(name)}</span>
            </span>
            <span class="collab-time">${escapeHtml(formatTime(entry.created_at))}</span>
          </div>
          <div class="collab-body">${escapeHtml(entry.body)}</div>
          ${actions.length ? `<div class="collab-item-actions">${actions.join("")}</div>` : ""}
        </article>
      `;
    }).join("");
  }

  async function loadEntries() {
    showStatus("加载中...");
    if (!api?.isConfigured) {
      state.entries = [];
      renderEntries();
      showStatus("配置 Supabase 后，这里会显示公开内容。");
      return;
    }
    if (state.activeKind === "notes") {
      state.entries = await api.listNotes(state.activeDay.day);
    } else {
      state.entries = await api.listComments(state.activeTarget.type, state.activeTarget.id);
    }
    renderEntries();
    showStatus("");
  }

  async function refreshVisibleCounts() {
    if (!api?.isConfigured || !window.ROADTRIP_COLLAB_COUNTS) return;
    const visibleDayIds = [...document.querySelectorAll("[data-collab-kind][data-day]")]
      .map((button) => button.dataset.day);
    const uniqueIds = [...new Set(visibleDayIds)].slice(0, 80);
    for (const dayId of uniqueIds) {
      const notes = await api.listNotes(dayId);
      const comments = await api.listComments("day", dayId);
      window.ROADTRIP_COLLAB_COUNTS.notes.set(String(dayId), notes.length);
      window.ROADTRIP_COLLAB_COUNTS.comments.set(String(dayId), comments.length);
    }
    if (typeof window.renderRows === "function") {
      window.renderRows();
    }
  }

  async function requireProfileForPosting() {
    if (!api?.isConfigured) throw new Error("请先配置 Supabase");
    if (!state.user) {
      await api.signInWithOAuth();
      throw new Error("请登录后再发布");
    }
    if (!state.profile) {
      openProfileModal("发布前请先设置唯一姓名");
      throw new Error("请先设置唯一姓名");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      await requireProfileForPosting();
      const body = els.body.value.trim();
      if (!body) throw new Error("内容不能为空");
      if (body.length > 1000) throw new Error("内容不能超过 1000 个字符");
      els.submit.disabled = true;
      if (state.activeKind === "notes") {
        await api.createNote({
          dayId: state.activeDay.day,
          routeTitle: state.activeDay.route,
          body,
          authorId: state.user.id
        });
      } else {
        await api.createComment({
          targetType: state.activeTarget.type,
          targetId: state.activeTarget.id,
          body,
          authorId: state.user.id
        });
      }
      els.body.value = "";
      await loadEntries();
      await refreshVisibleCounts();
    } catch (error) {
      showStatusError(error);
    } finally {
      renderFormState();
    }
  }

  async function handleEntryAction(event) {
    const button = event.target.closest("[data-entry-action]");
    if (!button) return;
    const id = button.dataset.entryId;
    const action = button.dataset.entryAction;
    const entry = state.entries.find((item) => item.id === id);
    if (!entry) return;
    try {
      if (action === "edit") {
        const nextBody = window.prompt("编辑公开内容", entry.body);
        if (nextBody === null) return;
        if (!nextBody.trim()) throw new Error("内容不能为空");
        await api.updateEntry(state.activeKind, id, nextBody);
      }
      if (action === "delete") {
        if (!window.confirm("确定删除这条内容吗？")) return;
        await api.deleteEntry(state.activeKind, id);
      }
      if (action === "hide") {
        if (!window.confirm("确定隐藏这条内容吗？")) return;
        await api.hideEntry(state.activeKind, id);
      }
      await loadEntries();
      await refreshVisibleCounts();
    } catch (error) {
      showStatusError(error);
    }
  }

  function renderFormState() {
    if (!els.form) return;
    const canPost = Boolean(api?.isConfigured && state.user && state.profile);
    els.body.disabled = !canPost;
    els.submit.disabled = !canPost;
    if (!api?.isConfigured) {
      els.formHint.textContent = "配置 Supabase 后可发布公开备注和评论。";
    } else if (!state.user) {
      els.formHint.textContent = "登录授权后可以发布。";
    } else if (!state.profile) {
      els.formHint.textContent = "设置唯一姓名后可以发布。";
    } else {
      els.formHint.textContent = `将以「${state.profile.display_name}」公开发布。`;
    }
  }

  function bindAuthEvents() {
    els.profileForm.addEventListener("submit", handleProfileSubmit);
    els.cancelProfile.addEventListener("click", closeProfileModal);
    els.closeDrawer.addEventListener("click", closeDrawer);
    els.form.addEventListener("submit", handleSubmit);
    els.list.addEventListener("click", handleEntryAction);
    els.notesTab.addEventListener("click", () => {
      setActiveTab("notes");
      loadEntries().catch(showStatusError);
      renderFormState();
    });
    els.commentsTab.addEventListener("click", () => {
      setActiveTab("comments");
      loadEntries().catch(showStatusError);
      renderFormState();
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-collab-kind][data-day]");
      if (!button) return;
      openDrawer({
        dayId: button.dataset.day,
        kind: button.dataset.collabKind
      });
    });
    api?.onAuthStateChange(() => loadSession().catch(console.error));
  }

  function init() {
    bindAuthEvents();
    loadSession().catch((error) => {
      console.error(error);
      renderAuthBar();
    });
    window.roadtripCollab = {
      state,
      openProfileModal,
      openDrawer,
      closeDrawer,
      renderAuthBar,
      loadEntries,
      refreshVisibleCounts
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
