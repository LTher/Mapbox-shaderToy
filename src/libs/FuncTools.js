/**
 * @Author: ZC
 * @Description:
 * @Date: 2024/7/19 17:07
 */
import { sm2, sm3 } from 'sm-crypto';


// SM2 公钥
const SM2_PUBLIC_KEY =
  '046e34b74509ec83ddc1051f2b838c2e914e1beba4061fc6ecd3609d2ba99a2de21913338730718a5af54408085757719ccde8818c0e0b682b918253a73bff7311';
// SM2 私钥
const SM2_PRIVATE_KEY = '3251aa12331cee593ee3b105fc7b258fa42d094ac8acb3202258f37266246ace';

/**
 * sm2加密
 */
export function sm2Encryption(str) {
  if (!str) {
    return;
  }
  let encodeStr = sm2.doEncrypt(str, SM2_PUBLIC_KEY, 1);
  return `04${encodeStr.toUpperCase()}`;
}

/**
 * 提取树的所有节点，最终树的所有节点都会存入传入的nodeList数组中
 */
export function getAllTreeNode(treeData, nodeList) {
  // 判断是否为数组
  if (Array.isArray(treeData)) {
    treeData.forEach(item => {
      if (item && item.children && item.children.length > 0) {
        nodeList.push(item);
        getAllTreeNode(item.children, nodeList);
      } else {
        nodeList.push(item);
      }
    });
  } else {
    if (item && treeData.children && treeData.children.length > 0) {
      nodeList.push(treeData);
      getAllTreeNode(treeData.children, nodeList);
    } else {
      nodeList.push(treeData);
    }
  }
}

// const RSA_PUBLIC_KEY =
//   'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCzl6YkmuWLJKi/OwenyIwHqwIJcI8QAK2b6u/DWc4wnKE2Ngq2JhUj3xxBb74ycuhPv1HJIROencpNJK4fdUHg90Q7nCHaR7JHrjZwS9kY0Grc2y0zXNO5V195LoloV+mf4oE9u6VBaiJ+75Cj+p7QgZTmGvpepFNjKTIZ+wFFHQIDAQAB';
// const RSA_PRIVATE_KEY =
//   'MIICdwIBADANBgkqhkiG9w0BAQEFAASCAmEwggJdAgEAAoGBALOXpiSa5YskqL87B6fIjAerAglwjxAArZvq78NZzjCcoTY2CrYmFSPfHEFvvjJy6E+/UckhE56dyk0krh91QeD3RDucIdpHskeuNnBL2RjQatzbLTNc07lXX3kuiWhX6Z/igT27pUFqIn7vkKP6ntCBlOYa+l6kU2MpMhn7AUUdAgMBAAECgYEAmWL+bek2AB9xWNLr+OuaXbo65SETr1FE9hQ0b562MmK0df62K1hfWeHm2iS8R45IyEPZcHUlsqWF8VlQtmGJv1Jrxsdis/RBQqtq7R6vqU+ptEVD8JUJn6UaaRX0kkfmA3r0n6ywDPfWSuzJVea8l9Zj/QGA3uET0xpH+GxZb8ECQQDXE8qxBqfRaZ0YXVRRrIzEOtFYzZnipIxXGJC0Jo7hxYVOVCrjmHXudceIvAyyVs2IIHQNo+eFavgUrvyR+LG1AkEA1cNroERaW3ovPiEThJfzzmmiq30b2LNLHoIGZYXtch1t5TW0ocW2212sPL5Qic8TO8Wsr/b1aj/WGctWUnWGyQJAdVsnTlEDYRDv10uVprswVCKD+KC3RyPiL+QHkUU40ZillIf4nxehwewiZEm349fZbl3G9Wpp+jLUCvUwe7XnwQJBAKtUELwIbN9qw9ipDAq2+2sSEZYfFSWPNoMCNfxC5ngTDFSswdTzMccKghTBeK2rcb/zhKAYcMSy23gbGFnI5rkCQD5+rEvXsN76QbMpP4o6dn3mvMXzCMhIED/l1IXQzxJVj4b/1gTLxN+4mymQb2RZsAN1x5EgkdSzYpnOWOx1xVo=';
