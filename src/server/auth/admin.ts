export function parseBasicAuth(headerValue: string | null) {
  if (!headerValue?.startsWith("Basic ")) {
    return null;
  }

  try {
    const base64Credentials = headerValue.slice(6);
    const decoded = Buffer.from(base64Credentials, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function isAdminAuthorized(headerValue: string | null) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return true;
  }

  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const credentials = parseBasicAuth(headerValue);

  return (
    credentials?.username === adminUsername &&
    credentials?.password === adminPassword
  );
}
