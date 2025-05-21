import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig((mode) => {
  const env = loadEnv(mode, process.cwd());
  return {
    base: './',
    build: {
      outDir: 'dist'
    },
    plugins: [vue()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `
            @use "@/styles/global.scss" as *;
            @use "@/styles/element/index.scss" as *;
          `,
        },
      },
    },
    server: {
      host: true,
      open: true,
      port: 8089,
      proxy: {
        "/api": {
          target: env.VITE_APP_BASE_API, //需代理的后端接口
          secure: false, //开启代理：在本地会创建一个虚拟服务端，然后发送请求的数据，并同时接收请求
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
