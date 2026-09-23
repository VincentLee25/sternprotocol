const SESSION_KEY = "stern-company-session-v1";

export function readCompanySession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (!value?.accessToken || !value?.user || !value?.company) return null;
    return value;
  } catch {
    return null;
  }
}

export function writeCompanySession(session) {
  if (!session) {
    clearCompanySession();
    return;
  }
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // The in-memory session still works when browser storage is unavailable.
  }
}

export function clearCompanySession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // A blocked storage API should not prevent sign-out.
  }
}
