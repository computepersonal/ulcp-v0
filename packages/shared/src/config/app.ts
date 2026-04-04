export const appConfig = {
  appName: process.env["APP_NAME"] ?? "ULCP",
  nodeEnv: (process.env["NODE_ENV"] ?? "development") as
    | "development"
    | "production"
    | "test",
  isProduction: process.env["NODE_ENV"] === "production",
  isDevelopment:
    !process.env["NODE_ENV"] || process.env["NODE_ENV"] === "development",
};
