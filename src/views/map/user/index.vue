<template>
  <div class="user-manage">
    <iframe
      :src="iframeSrc"
      frameborder="0"
      ref="userIframe"
      @load="onIframeLoad"
    ></iframe>
  </div>
</template>

<script setup>
/**
 @author: zc
 @date: 2024/7/17 9:51
 @description: 用户管理
 */
import { ref } from "vue";

const iframeSrc = ref(import.meta.env.VITE_USER_ADDR);
const userIframe = ref();
const onIframeLoad = () => {
  const iframe = userIframe.value.contentWindow;
  // 传递用户名、密码
  iframe.postMessage(
    {
      type: "SESSION_DATA",
      data: sessionStorage.getItem("medox-user-info"),
    },
    iframeSrc.value
  );
};
</script>

<style scoped lang="scss">
.user-manage {
  position: fixed;
  top: vh(80px);
  width: vw($defaultWidth);
  height: vh(1000px);
  background: rgba(255, 255, 255, 1);
  z-index: 1209;

  iframe {
    width: 100%;
    height: 100%;
    border: none;
  }
}
</style>
