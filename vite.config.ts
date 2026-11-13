import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/meu-simulador-financeiro/",
  test: { environment: "jsdom", restoreMocks: true },
});
