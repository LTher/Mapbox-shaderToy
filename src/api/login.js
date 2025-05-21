/**
 * @Author: ZC
 * @Description:
 * @Date: 2024/7/19 14:21
 */
import { request } from "./axios";

export class UserLogin {

  /**
   * @description: 获得验证码
   */
  static async captchaGet(params) {
    return request("/captcha/get", params, "post");
  }

  /**
   * @description: 校验验证码
   */
  static async captchaCheck(params) {
    return request("/captcha/check", params, "post");
  }

  /**
   * @description: 登录
   */
  static async systemUaaAuthLogin(params) {
    return request("/system/uaa/auth/login", params, "post");
  }

  /**
   * @description: 查询登录信息
   */
  static async systemUaaAuthGetLoginInfo() {
    return request("/system/uaa/auth/getLoginInfo", {}, "get");
  }

  /**
   * @description: 退出登陆
   */
  static async systemUaaAuthLogout(params) {
    return request("/system/uaa/auth/logout", params, "post");
  }

}