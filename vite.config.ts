import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Сборка под площадку выбирается режимом: `vite build --mode vkplay` (по умолчанию web).
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const platform = mode === "vkplay" ? "vkplay" : "web";
  return {
    // относительные пути: игра открывается и из iframe на чужом домене, и из подпапки хостинга
    base: "./",
    plugins: [react(), tailwindcss(), viteSingleFile()],
    define: {
      __PLATFORM__: JSON.stringify(platform),
    },
    build: {
      outDir: `dist/${platform}`,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  };
});
