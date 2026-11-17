const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-bootstrap-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ADMIN_EMAIL = "admin@manual.future.internal";

type JsonRecord = Record<string, unknown>;

function reply(status: number, payload: JsonRecord) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });
}

function equalSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

async function authUser(token: string) {
  const response = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, {
    headers: {
      apikey: env("SUPABASE_ANON_KEY"),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  return await response.json() as {
    id: string;
    email?: string;
    app_metadata?: { role?: string; must_change_password?: boolean };
  };
}

async function adminRequest(path: string, method: string, body?: JsonRecord) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${env("SUPABASE_URL")}/auth/v1/admin/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data: JsonRecord = {};
  try {
    data = text ? JSON.parse(text) as JsonRecord : {};
  } catch {
    data = { message: text };
  }
  return { response, data };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });

  try {
    const body = await request.json() as JsonRecord;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "bootstrap") {
      const configuredSecret = env("ADMIN_BOOTSTRAP_SECRET");
      const suppliedSecret = request.headers.get("x-bootstrap-secret") ?? "";
      if (!equalSecret(suppliedSecret, configuredSecret)) {
        return reply(401, { error: "Credencial de configuração inválida." });
      }

      const password = typeof body.password === "string" ? body.password : "";
      if (password.length < 6 || password.length > 128) {
        return reply(400, { error: "A senha inicial deve ter entre 6 e 128 caracteres." });
      }

      const created = await adminRequest("users", "POST", {
        email: ADMIN_EMAIL,
        password,
        email_confirm: true,
        app_metadata: { role: "admin", must_change_password: true },
      });
      if (!created.response.ok) {
        const message = String(created.data.message ?? created.data.msg ?? "");
        if (created.response.status === 422 || /already|registered|exists/i.test(message)) {
          return reply(409, { error: "O administrador inicial já foi criado." });
        }
        console.error("admin bootstrap failed", created.response.status, created.data);
        return reply(500, { error: "Não foi possível criar o administrador inicial." });
      }
      return reply(201, { ok: true, username: "admin", mustChangePassword: true });
    }

    if (action === "login") {
      const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (username !== "admin" || !password) {
        return reply(401, { error: "Usuário ou senha inválidos." });
      }

      // Diferencia ausência de administrador de uma senha digitada incorretamente.
      const listed = await adminRequest("users?page=1&per_page=100", "GET");
      const users = Array.isArray(listed.data.users) ? listed.data.users as Array<{ app_metadata?: { role?: string } }> : [];
      if (!users.some((candidate) => candidate.app_metadata?.role === "admin")) {
        return reply(409, { error: "Primeiro acesso ainda não configurado. Clique em Configurar primeiro acesso para criar o administrador." });
      }

      const response = await fetch(`${env("SUPABASE_URL")}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey: env("SUPABASE_ANON_KEY"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: ADMIN_EMAIL, password }),
      });
      const data = await response.json() as JsonRecord;
      if (!response.ok) return reply(401, { error: "Usuário ou senha inválidos." });

      const user = data.user as { app_metadata?: { role?: string; must_change_password?: boolean } } | undefined;
      if (user?.app_metadata?.role !== "admin") {
        return reply(403, { error: "Esta conta não possui permissão de administrador." });
      }
      return reply(200, {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        user,
        mustChangePassword: user.app_metadata.must_change_password === true,
      });
    }

    if (action === "logout") {
      const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\\s+/i, "");
      if (token) {
        await fetch(`${env("SUPABASE_URL")}/auth/v1/logout?scope=global`, {
          method: "POST",
          headers: {
            apikey: env("SUPABASE_ANON_KEY"),
            Authorization: `Bearer ${token}`,
          },
        });
      }
      return reply(200, { ok: true });
    }

    if (action === "session" || action === "change-password") {
      const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (!token) return reply(401, { error: "Sessão não informada." });
      const user = await authUser(token);
      if (!user || user.app_metadata?.role !== "admin") {
        return reply(401, { error: "Sessão inválida ou sem permissão de administrador." });
      }

      if (action === "session") {
        return reply(200, {
          user: { id: user.id, email: user.email },
          mustChangePassword: user.app_metadata.must_change_password === true,
        });
      }

      const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
      if (newPassword.length < 8 || newPassword.length > 128) {
        return reply(400, { error: "A nova senha deve ter pelo menos 8 caracteres." });
      }
      const updated = await adminRequest(`users/${user.id}`, "PUT", {
        password: newPassword,
        app_metadata: { ...user.app_metadata, role: "admin", must_change_password: false },
      });
      if (!updated.response.ok) {
        console.error("admin password update failed", updated.response.status, updated.data);
        return reply(500, { error: "Não foi possível atualizar a senha." });
      }
      return reply(200, { ok: true, mustChangePassword: false });
    }

    if (action === "refresh") {
      const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
      if (!refreshToken) return reply(400, { error: "Token de renovação não informado." });
      const response = await fetch(`${env("SUPABASE_URL")}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: {
          apikey: env("SUPABASE_ANON_KEY"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const data = await response.json() as JsonRecord;
      if (!response.ok) return reply(401, { error: "Sua sessão expirou. Entre novamente." });
      return reply(200, {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      });
    }

    return reply(400, { error: "Ação não reconhecida." });
  } catch (error) {
    console.error("admin-auth error", error);
    return reply(500, { error: "Serviço de autenticação indisponível." });
  }
});
