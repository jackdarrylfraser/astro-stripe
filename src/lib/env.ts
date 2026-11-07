const env = import.meta.env;

export function requiredEnv(
  name: keyof ImportMetaEnv,
  fallbackName?: keyof ImportMetaEnv,
): string {
  const value = env[name] || (fallbackName && env[fallbackName]);
  if (!value) {
    const alternatives = fallbackName ? ` (or ${fallbackName})` : '';
    throw new Error(`Missing required environment variable: ${name}${alternatives}`);
  }
  return value;
}
