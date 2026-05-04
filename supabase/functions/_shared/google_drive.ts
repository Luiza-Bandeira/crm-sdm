// ============================================================
// Google Drive API Integration
// Requer Service Account JSON key configurada como Secret
// ============================================================

import { create } from "https://deno.land/x/djwt@v2.8/mod.ts";

async function getAccessToken() {
  const serviceAccount = JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT') || '{}');
  if (!serviceAccount.client_email) {
    console.error('[google-drive] Service Account não configurada');
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const pem = serviceAccount.private_key.replace(/\\n/g, "\n");
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/drive.file",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    },
    await crypto.subtle.importKey(
      "pkcs8",
      binaryDer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      true,
      ["sign"]
    )
  );

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const data = await res.json();
  return data.access_token;
}

export async function createClientFolder(clientName: string) {
  const token = await getAccessToken();
  if (!token) return null;

  const parentFolderId = Deno.env.get('GOOGLE_DRIVE_PARENT_FOLDER_ID');

  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `${clientName} - Protocolo Financeiro`,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentFolderId ? [parentFolderId] : [],
    }),
  });

  const resText = await res.text();
  console.log('[google-drive] Resposta bruta:', resText);
  let folder;
  try {
    folder = JSON.parse(resText);
  } catch (e) {
    throw new Error(`Erro ao parsear JSON do Drive: ${resText}`);
  }
  
  if (!folder.id) {
    throw new Error(`Falha ao criar pasta. Status: ${res.status}. Resposta: ${resText}`);
  }
  
  // Tornar a pasta acessível via link (Leitor para qualquer pessoa com o link)
  // Nota: Isso é opcional, você pode preferir convidar o e-mail do cliente.
  await fetch(`https://www.googleapis.com/drive/v3/files/${folder.id}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: "writer",
      type: "anyone",
    }),
  });

  return `https://drive.google.com/drive/folders/${folder.id}`;
}
