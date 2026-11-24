"use client";

/**
 * Suscripción Web Push de este dispositivo. En iPhone solo funciona con el CRM
 * abierto desde la pantalla de inicio (iOS 16.4+), no desde Safari normal.
 */

const CLAVE = "vocero.push";

export function pushActivoAqui(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) === "on";
  } catch {
    return false;
  }
}

function marcar(on: boolean) {
  try {
    if (on) window.localStorage.setItem(CLAVE, "on");
    else window.localStorage.removeItem(CLAVE);
  } catch {}
}

export function pushSoportado(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** iPhone/iPad en Safari normal (no instalado): push no está disponible ahí. */
export function iosSinInstalar(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const instalada =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return ios && !instalada;
}

function aBytes(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/** Pide permiso (debe llamarse desde un toque) y registra el dispositivo. */
export async function activarPush(): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (!pushSoportado()) return { ok: false, motivo: "Este navegador no admite notificaciones." };
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return { ok: false, motivo: "No se dio permiso para notificaciones." };
  const r = await fetch("/api/push");
  const { publicKey } = (await r.json().catch(() => ({}))) as { publicKey?: string | null };
  if (!publicKey) return { ok: false, motivo: "Las notificaciones aún no están configuradas en el servidor." };
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(publicKey) });
  const g = await fetch("/api/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!g.ok) return { ok: false, motivo: "No se pudo registrar este dispositivo." };
  marcar(true);
  return { ok: true };
}

export async function desactivarPush(): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/push", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  marcar(false);
}

/** ¿Este dispositivo ya tiene una suscripción viva? */
export async function suscritoAqui(): Promise<boolean> {
  if (!pushSoportado()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  marcar(Boolean(sub));
  return Boolean(sub);
}
