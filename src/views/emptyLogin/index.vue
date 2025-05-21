<template>
</template>

<script setup>
/**
 @author: zc
 @date: 2024/7/18 9:26
 @description: 登陆页
 */
import { onMounted } from "vue"
import { UserLogin } from "@/api/login.js"
import { convertToVueRouterData, getRoutes, view } from "@/router/DynamicRoutes.js"
import COMMON_CONSTANTS from "@/config/CommonConstants.js"
import { useRouter } from "vue-router"

const router = useRouter();

function getCookie(cookieName) {
    const strCookie = document.cookie
    const cookieList = strCookie.split(';')

    for (let i = 0; i < cookieList.length; i++) {
        const arr = cookieList[i].split('=')
        if (cookieName === arr[0].trim()) {
            return arr[1]
        }
    }

    return ''
}

/**
 * @description: 处理登录
 * @param {*} data
 * @param {*} routePath
 * @return {*}
 */
const handleLogin = (data, routePath) => {
    UserLogin.systemUaaAuthGetLoginInfo().then(async infoRes => {
        if (infoRes.data.code == 200) {
            if (infoRes.data.data.menus.length == 0) {
                ElMessage({
                    message: '请先分配菜单！',
                    type: 'warning',
                });
                return;
            }
            sessionStorage.setItem('medox-user', JSON.stringify(infoRes.data.data.user));
            sessionStorage.setItem('medox-roles', JSON.stringify(infoRes.data.data.roles));
            sessionStorage.setItem('medox-menus', JSON.stringify(infoRes.data.data.menus));
            sessionStorage.setItem('medox-permCodes', JSON.stringify(infoRes.data.data.permCodes));
            const routerData = convertToVueRouterData(
                infoRes.data.data.menus.filter(
                    item => item.menuType == 1 && (item.bindType == COMMON_CONSTANTS.MENU_BIND_TYPE.ROUTE_MENU
                        || item.bindType == COMMON_CONSTANTS.MENU_BIND_TYPE.EXTERNAL_LINK)
                ),
            );
            router.options.routes.forEach(o => {
                if (o.name === "layout") {
                    routerData.forEach(item => {
                        router.addRoute("layout", item);
                        o.children.push(item)
                    })
                }
            })
            await router.replace({ path: '/home' });
            ElMessage({
                message: '登录成功！',
                type: 'success',
            });
        }
    })
}

onMounted(() => {
    // cookie登录
    const satoken = getCookie('satoken')
    if (satoken !== '') {
        sessionStorage.setItem('medox-token-value', satoken);
        sessionStorage.setItem('medox-token-name', "satoken");
        handleLogin()
    }
})
</script>

<style scoped lang="scss"></style>