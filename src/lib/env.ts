const env = import.meta.env;

export function requiredEnv(
  name: keyof ImportMetaEnv,
): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
