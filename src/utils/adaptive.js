/**
 * 提供用于自适应布局的辅助方法。
 * @author LXQ
 */
export class Adptive {
  /**
   * @private
   * 用于计算相对视口宽度的辅助属性。
   */
  static #size = {
    $width: 1920,
    $height: 1080,
  };

  /**
   * 计算相对于视口宽度的值。
   * @param {number} width - 要转换的宽度值。
   * @returns {number} 相对于视口宽度的值。
   */
  static vw(width) {
    return (width / Adptive.#size.$width) * innerWidth;
  }

  /**
   * 计算相对于视口高度的值。
   * @param {number} height - 要转换的高度值。
   * @returns {number} 相对于视口高度的值。
   */
  static vh(height) {
    return (height / Adptive.#size.$height) * innerHeight;
  }
}
