import { createApp } from "vue";
import { createPinia } from "pinia";
import router from "./router";
import "./style.css";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import App from "./App.vue";

// createApp(App).mount('#app')

const app = createApp(App);

app.use(createPinia());

app.use(router);

app.use(ElementPlus);

(async () => {
  //   await preloadImage();
  app.mount("#app");
})();
