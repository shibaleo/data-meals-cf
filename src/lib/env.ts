export const env = {
  get DATABASE_URL(): string {
    const v = process.env.DATABASE_URL;
    if (!v) throw new Error("DATABASE_URL is not set");
    return v;
  },
  get VITE_CLERK_PUBLISHABLE_KEY(): string | undefined {
    return process.env.VITE_CLERK_PUBLISHABLE_KEY;
  },
  get CLERK_SECRET_KEY(): string | undefined {
    return process.env.CLERK_SECRET_KEY;
  },
  get BASE_URL(): string {
    return process.env.VITE_BASE_URL ?? "http://localhost:3000";
  },
};
