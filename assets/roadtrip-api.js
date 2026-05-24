(function () {
  const config = window.ROADTRIP_SUPABASE_CONFIG || {};
  const hasSupabase = Boolean(config.url && config.anonKey && window.supabase);
  const client = hasSupabase ? window.supabase.createClient(config.url, config.anonKey) : null;

  function normalizeDisplayName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function publicUser(user) {
    const meta = user?.user_metadata || {};
    return {
      id: user?.id || "",
      email: user?.email || "",
      avatarUrl: meta.avatar_url || meta.picture || "",
      providerName: meta.full_name || meta.name || meta.user_name || ""
    };
  }

  function formatError(error) {
    if (!error) return "";
    if (error.code === "23505") return "这个姓名已被使用，请换一个";
    if (error.message) return error.message;
    return "操作失败，请稍后重试";
  }

  function defaultRedirectPath() {
    const firstPathSegment = window.location.pathname.split("/").filter(Boolean)[0];
    if (firstPathSegment === "china_travel") return "/china_travel/";
    return "/";
  }

  function authRedirectUrl() {
    const path = config.redirectPath && config.redirectPath !== "auto"
      ? config.redirectPath
      : defaultRedirectPath();
    return new URL(path, window.location.origin).toString();
  }

  async function getSession() {
    if (!client) return { session: null, user: null };
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error(formatError(error));
    return { session: data.session, user: data.session?.user || null };
  }

  function onAuthStateChange(callback) {
    if (!client) return { unsubscribe() {} };
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      callback({ session, user: session?.user || null });
    });
    return data.subscription;
  }

  async function signInWithOAuth() {
    if (!client) throw new Error("请先配置 Supabase URL 和 anon key");
    const redirectTo = authRedirectUrl();
    const { error } = await client.auth.signInWithOAuth({
      provider: config.oauthProvider || "github",
      options: { redirectTo }
    });
    if (error) throw new Error(formatError(error));
  }

  async function signInWithEmail(email) {
    if (!client) throw new Error("请先配置 Supabase URL 和 anon key");
    const redirectTo = authRedirectUrl();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });
    if (error) throw new Error(formatError(error));
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw new Error(formatError(error));
  }

  async function getProfile(userId) {
    if (!client || !userId) return null;
    const { data, error } = await client
      .from("profiles")
      .select("user_id, display_name, avatar_url, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(formatError(error));
    return data;
  }

  async function saveProfile({ userId, displayName, avatarUrl }) {
    if (!client) throw new Error("请先配置 Supabase URL 和 anon key");
    const cleanName = String(displayName || "").trim().replace(/\s+/g, " ");
    if (!cleanName) throw new Error("请输入公开显示姓名");
    if (cleanName.length > 40) throw new Error("公开显示姓名不能超过 40 个字符");
    const payload = {
      user_id: userId,
      display_name: cleanName,
      avatar_url: avatarUrl || null
    };
    const { data, error } = await client
      .from("profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select("user_id, display_name, avatar_url, role")
      .single();
    if (error) throw new Error(formatError(error));
    return data;
  }

  async function listNotes(dayId) {
    if (!client) return [];
    const { data, error } = await client
      .from("notes")
      .select("id, day_id, route_title, body, author_id, is_hidden, created_at, updated_at, profiles(display_name, avatar_url, role)")
      .eq("day_id", Number(dayId))
      .order("created_at", { ascending: false });
    if (error) throw new Error(formatError(error));
    return data || [];
  }

  async function listComments(targetType, targetId) {
    if (!client) return [];
    const { data, error } = await client
      .from("comments")
      .select("id, target_type, target_id, body, author_id, is_hidden, created_at, updated_at, profiles(display_name, avatar_url, role)")
      .eq("target_type", targetType)
      .eq("target_id", String(targetId))
      .order("created_at", { ascending: false });
    if (error) throw new Error(formatError(error));
    return data || [];
  }

  async function createNote({ dayId, routeTitle, body, authorId }) {
    if (!client) throw new Error("请先配置 Supabase URL 和 anon key");
    const { data, error } = await client
      .from("notes")
      .insert({
        day_id: Number(dayId),
        route_title: routeTitle,
        body: String(body || "").trim(),
        author_id: authorId
      })
      .select("id")
      .single();
    if (error) throw new Error(formatError(error));
    return data;
  }

  async function createComment({ targetType, targetId, body, authorId }) {
    if (!client) throw new Error("请先配置 Supabase URL 和 anon key");
    const { data, error } = await client
      .from("comments")
      .insert({
        target_type: targetType,
        target_id: String(targetId),
        body: String(body || "").trim(),
        author_id: authorId
      })
      .select("id")
      .single();
    if (error) throw new Error(formatError(error));
    return data;
  }

  async function updateEntry(kind, id, body) {
    if (!client) throw new Error("请先配置 Supabase URL 和 anon key");
    const table = kind === "notes" ? "notes" : "comments";
    const { error } = await client
      .from(table)
      .update({ body: String(body || "").trim() })
      .eq("id", id);
    if (error) throw new Error(formatError(error));
  }

  async function deleteEntry(kind, id) {
    if (!client) throw new Error("请先配置 Supabase URL 和 anon key");
    const table = kind === "notes" ? "notes" : "comments";
    const { error } = await client.from(table).delete().eq("id", id);
    if (error) throw new Error(formatError(error));
  }

  async function hideEntry(kind, id) {
    if (!client) throw new Error("请先配置 Supabase URL 和 anon key");
    const table = kind === "notes" ? "notes" : "comments";
    const { error } = await client.from(table).update({ is_hidden: true }).eq("id", id);
    if (error) throw new Error(formatError(error));
  }

  window.roadtripApi = {
    isConfigured: hasSupabase,
    normalizeDisplayName,
    publicUser,
    getSession,
    onAuthStateChange,
    signInWithOAuth,
    signInWithEmail,
    signOut,
    getProfile,
    saveProfile,
    listNotes,
    listComments,
    createNote,
    createComment,
    updateEntry,
    deleteEntry,
    hideEntry
  };
})();
