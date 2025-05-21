/**
 * 深度工具
 * @author LXQ
 */
class Deep {
  /**
   * 深度拷贝
   * @param {object} obj - 拷贝对象
   * @returns {any} 返还深度拷贝后的对象
   */
  static copy(obj) {
    const objectMap = new Map();
    const customCopy = (_obj) => {
      if (typeof _obj !== "object" || _obj === null) {
        return _obj;
      }

      if (objectMap.has(_obj)) {
        return objectMap.get(_obj);
      }

      const newObj = Array.isArray(_obj) ? [] : {};
      objectMap.set(_obj, newObj);

      for (const key of Object.keys(_obj)) {
        newObj[key] = customCopy(_obj[key]);
      }

      return newObj;
    };

    return customCopy(obj);
  }
}

export { Deep };
