import { createRouter, createWebHashHistory } from "vue-router";
import { convertToVueRouterData } from "@/router/DynamicRoutes.js";
import COMMON_CONSTANTS from "@/config/CommonConstants.js";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      // redirect: "/login",
      redirect: "/maptest",
    },
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/login/index.vue"),
      meta: {
        title: "登录页",
      },
    },
    {
      path: "/maptest",
      name: "maptest",
      component: () => import("@/views/Mapbox/index2.vue"),
      meta: {
        title: "测试页",
      },
    },
    {
      path: "/emptylogin",
      name: "emptylogin",
      component: () => import("@/views/emptyLogin/index.vue"),
      meta: {
        title: "登录页",
      },
    },
    {
      path: "/overview",
      name: "overview",
      component: () => import("@/views/Overview/index.vue"),
      meta: {
        title: "大屏页",
      },
    },
    // {
    //   path: "/",
    //   name: "layout",
    //   component: () => import("@/layout/index.vue"),
    //   // children: [
    //   //   {
    //   //     path: "/home",
    //   //     name: "home",
    //   //     component: () => import("@/views/home/index.vue"),
    //   //     meta: {
    //   //       title: "首页",
    //   //     },
    //   //   },
    //   //   {
    //   //     path: "/ledger",
    //   //     name: "ledger",
    //   //     component: () => import("@/components/EquipmentLedger/EquipmentLedger.vue"),
    //   //     meta: {
    //   //       title: "设备台账",
    //   //     },
    //   //   },
    //   //   {
    //   //     path: "/deployment",
    //   //     name: "deployment",
    //   //     component: () => import("@/components/EquipmentDeployment/EquipmentDeployment.vue"),
    //   //     meta: {
    //   //       title: "部署方案",
    //   //     },
    //   //   },
    //   //   {
    //   //     path: "/report",
    //   //     name: "report",
    //   //     component: () => import("@/components/EquipmentReport/EquipmentReport.vue"),
    //   //     meta: {
    //   //       title: "监测报告管理",
    //   //     },
    //   //   },
    //   //   // {
    //   //   //   path: "/warning",
    //   //   //   name: "warning",
    //   //   //   component: () => import("@/views/map/warning/index.vue"),
    //   //   //   meta: {
    //   //   //     title: "预警服务",
    //   //   //   },
    //   //   // },
    //   //   // {
    //   //   //   path: "/card",
    //   //   //   name: "card",
    //   //   //   component: () => import("@/views/map/card/index.vue"),
    //   //   //   meta: {
    //   //   //     title: "灾害一张卡",
    //   //   //   },
    //   //   // },
    //   //   // {
    //   //   //   path: "/user",
    //   //   //   name: "user",
    //   //   //   component: () => import("@/views/map/user/index.vue"),
    //   //   //   meta: {
    //   //   //     title: "用户管理",
    //   //   //   },
    //   //   // },
    //   // ],
    // },
  ],
});

// 路由,防止页面刷新丢失
const menuJson = sessionStorage.getItem("medox-menus");
const menuData = JSON.parse(menuJson);
if (menuData && menuData.length > 0) {
  const routerData = convertToVueRouterData(
    menuData.filter(
      (item) =>
        item.menuType == 1 &&
        (item.bindType == COMMON_CONSTANTS.MENU_BIND_TYPE.ROUTE_MENU ||
          item.bindType == COMMON_CONSTANTS.MENU_BIND_TYPE.EXTERNAL_LINK)
    )
  );
  router.options.routes.forEach((o) => {
    if (o.name === "layout") {
      routerData.forEach((item) => {
        router.addRoute("layout", item);
        o.children.push(item);
      });
    }
  });
}

// 路由拦截
router.beforeEach((to, from, next) => {
  const routes = router.getRoutes();
  const routesUrlArr = routes.map((ele) => {
    return ele.path;
  });
  if (routesUrlArr.includes(to.path) || routesUrlArr.includes(to.name)) {
    if (
      to.path != "/" &&
      to.path != "/login" &&
      to.path != "/maptest" &&
      to.path != "/emptylogin" &&
      to.path != "/callback" &&
      to.path != "/sso-login" &&
      to.path != "/web-iframe"
    ) {
      const token = sessionStorage.getItem("medox-token-value");
      if (!token) {
        // next('/');
        return;
      }
    }
    next();
  }
});

export default router;
