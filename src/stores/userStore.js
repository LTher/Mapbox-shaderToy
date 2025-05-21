/**
 * @Author: ZC
 * @Description:
 * @Date: 2024/6/11 13:40
 */
import { defineStore } from "pinia";
import { ref, reactive } from "vue";

export const useUserStore = defineStore('user', () => {

}, {
  persist: true,
})