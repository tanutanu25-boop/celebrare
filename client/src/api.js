export const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

export const API_URL = `${API_BASE}/api`;

export function getAuthToken() {
  return localStorage.getItem("celebrare_token") || "";
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem("celebrare_token", token);
  } else {
    localStorage.removeItem("celebrare_token");
  }
}

export async function apiRequest(path, options = {}) {
  const token = getAuthToken();
  const headers = { ...(options.headers || {}) };

  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : { success: response.ok, message: await response.text() };

  if (!response.ok) {
    const err = new Error(data.message || `Request failed (${response.status})`);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export function formatLocalTime(isoString) {
  if (!isoString) return "—";
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return String(isoString);
  }
}
