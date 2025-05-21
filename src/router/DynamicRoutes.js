/**
 * @Author: ZC
 * @Description: 动态路由工具
 * @Date: 2024/7/22 14:26
 */
import COMMON_CONSTANTS from "@/config/CommonConstants.js";

export function view(path) {
  let modules = import.meta.glob("../views/**/*.vue");
  return modules[`../views/${path}`];
}

/**
 * 将菜单数组转为路由格式
 * @param data
 * @returns {*}
 */
export function convertToVueRouterData(data) {
  return data.map(item => {
    let route;
    if(item.bindType == COMMON_CONSTANTS.MENU_BIND_TYPE.ROUTE_MENU) {
      let path = item.routerUrl;
      route = {
        path: path,
        name: path,
        meta: {
          title: item.menuName,
          keepAlive: item.cacheable,
          menuData: item,
        },
      };
      if (item.componentPath) {
        route.component = view(item.componentPath);
      }
      if (item.children && item.children.length > 0) {
        route.children = convertToVueRouterData(item.children);
      }
      return route;
    } else if(item.bindType == COMMON_CONSTANTS.MENU_BIND_TYPE.EXTERNAL_LINK && item.routingMethod == 0){
      // 外链并嵌套
      let path = `/web-iframe-${item.menuId}`;
      route = {
        path: path,
        name: path,
        query: {
          targetUrl: item.targetUrl
        },
        meta: {
          title: item.menuName,
          keepAlive: item.cacheable,
          menuData: item,
        }
      };
      route.component = () => Promise.resolve(require('@/views/sys/web-iframe/index.vue').default);
      return route;
    }
  });
}

export function getRoutes(route) {
  return wrapInLayoutChildren(route);
}

// 递归方法，将路由项放在Layout组件的children下
function wrapInLayoutChildren(routes) {
  let result = [];
  routes.map(ele => {
    if(ele) {
      result.push({
        path: '/',
        component: () => import('@/layout/index.vue'),
        children: [
          {
            path: ele.path,
            name: ele.path,
            component: ele.component,
            meta: {
              title: ele.meta.title,
              keepAlive: ele.meta.menuData.cacheable,
              menuData: ele.meta.menuData,
            },
          },
        ],
      });
    }
  });
  return result;
}