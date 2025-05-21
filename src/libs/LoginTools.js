/**
 * @Author: ZC
 * @Description: 登陆相关
 * @Date: 2024/8/6 11:12
 */

export function clearCache() {
  sessionStorage.removeItem('medox-token-value');
  sessionStorage.removeItem('medox-token-name');
  sessionStorage.removeItem('medox-roles');
  sessionStorage.removeItem('medox-menus');
  sessionStorage.removeItem('medox-permCodes');
  sessionStorage.removeItem('medox-point');
  sessionStorage.removeItem('medox-user');
  sessionStorage.removeItem('medox-slider');
  sessionStorage.removeItem('medox-active-menu-id');
  sessionStorage.removeItem('medox-store');
  sessionStorage.removeItem('medox-user-info');

  //cookie
  document.cookie = "cname=; exdays=Thu, 01 Jan 1970 00:00:00 GMT";
}