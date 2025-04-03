// src/types/index.ts
import * as openpgp from 'openpgp';

// 定义 PGP 密钥对象的结构
export interface PGPKey {
  keyId: string;              // 密钥的唯一 ID (长格式，十六进制)
  armored: string;            // 密钥的 Armored 文本表示
  keyObject: openpgp.Key | openpgp.PrivateKey; // 解析后的 openpgp.js 密钥对象
  userIds: string[];          // 与此密钥关联的用户 ID (例如 "UserName <email@example.com>")
  primaryUserId: string;      // 主要的用户 ID
  isPrivate: boolean;         // 标记这是否是私钥
  creationTime: Date;         // 密钥创建时间
  // 注意: isLocked 状态通常在需要时动态判断或在解密/签名时处理，
  // 直接存储 isLocked 状态可能不准确（例如密码可能被缓存）
  // 我们将在操作时处理密码需求
}

// 定义密钥生成选项的结构 (如果需要传递给函数)
export interface KeyGenOptions {
  name: string;
  email: string;
  passphrase?: string; // 用户设置的保护私钥的密码
  keyType?: 'rsa' | 'ecc'; // 默认 'ecc' (推荐)
  curve?: 'curve25519' | 'p256' | 'p384' | 'p521' | 'brainpoolP256r1' | 'brainpoolP384r1' | 'brainpoolP512r1'; // ECC 曲线, 默认 'curve25519'
  rsaBits?: 2048 | 3072 | 4096; // RSA 位数, 默认 4096
}

// 定义存储在 localStorage 中的加密数据结构
export interface EncryptedData {
  iv: string;       // 初始化向量 (Base64)
  ciphertext: string; // 加密后的数据 (Base64)
}

// 定义存储在 localStorage 中的密钥条目结构
export interface StoredKey {
    keyId: string;
    type: 'public' | 'private';
    // 公钥直接存储 armored 格式
    // 私钥存储为使用主密码加密后的 EncryptedData
    data: string;
    // 存储一些元数据以便显示，避免每次加载都解密私钥来获取
    userIds: string[];
    primaryUserId: string;
    creationTime: string; // 存储为 ISO 字符串
}