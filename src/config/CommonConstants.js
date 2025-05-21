/**
 * @Author: ZC
 * @Description:
 * @Date: 2024/7/22 14:29
 */

const COMMON_CONSTANTS = {
  // 是否
  YES_OR_NO_OPTIONS: [
    {
      value: '1',
      label: '是',
    },
    {
      value: '0',
      label: '否',
    },
  ],

  // 是否布尔类型
  YES_OR_NO_BOOL_OPTIONS: [
    {
      value: true,
      label: '是',
    },
    {
      value: false,
      label: '否',
    },
  ],

  // 菜单类型选项
  MENU_TYPE_OPTIONS: [
    {
      value: 0,
      label: '目录',
    },
    {
      value: 1,
      label: '菜单',
    },
    {
      value: 2,
      label: '按钮',
    },
    {
      value: 3,
      label: '片段',
    },
  ],

  // 路由跳转方式
  ROUTING_SKIP_METHOD: [
    {
      value: 0,
      label: '页面嵌套',
    },
    {
      value: 1,
      label: '打开新页面',
    },
  ],

  // 菜单绑定类型
  MENU_BIND_TYPE_OPTIONS: [
    {
      value: 0,
      label: '路由菜单',
    },
    {
      value: 3,
      label: '外部链接',
    },
    {
      value: 1,
      label: '一张图路由菜单',
    },
  ],

  // 菜单绑定枚举
  MENU_BIND_TYPE: {
    'ROUTE_MENU': 1,
    'EXTERNAL_LINK': 3,
  },


  // 权限字类型
  PERM_CODE_TYPE: [
    {
      value: 0,
      label: '表单',
    },
    {
      value: 1,
      label: '片段',
    },
    {
      value: 2,
      label: '操作',
    },
  ],

  // 模块类型
  PERM_MODULE_TYPE: [
    {
      value: 0,
      label: '分组',
    },
    {
      value: 1,
      label: '接口',
    },
  ],

  // 日志类型
  SYS_LOG_TYPE: [
    {
      value: 0,
      label: '登录',
    },
    {
      value: 10,
      label: '退出',
    },
    {
      value: 20,
      label: '查询',
    },
    {
      value: 30,
      label: '新增',
    },
    {
      value: 40,
      label: '修改',
    },
    {
      value: 50,
      label: '删除',
    },
    {
      value: 60,
      label: '导出',
    },
    {
      value: 70,
      label: '导入',
    },
    {
      value: -1,
      label: '其他',
    },
  ],

  // 字典类型
  DIC_TYPE_OPTIONS: [
    {
      value: 0,
      label: '系统字典',
    },
    {
      value: 1,
      label: '业务字典',
    },
  ]
};
export default COMMON_CONSTANTS;
