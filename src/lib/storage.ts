// src/lib/storage.ts
import * as openpgp from 'openpgp';
import { StoredKey, PGPKey } from '@/types'; // 确保路径正确

// --- 常量定义 ---
const STORAGE_KEY = 'openpgp-web-client-keys';
const MASTER_PASSWORD_VERIFIER_KEY = 'openpgp-master-password-verifier';
const VERIFIER_PLAINTEXT = 'master_password_correct'; // 用于验证主密码的固定文本

// --- 主密码管理 ---

/**
 * 检查 localStorage 中是否存在主密码验证器。
 * @returns boolean - 如果存在验证器则返回 true，否则返回 false。
 */
export function hasMasterPassword(): boolean {
  return localStorage.getItem(MASTER_PASSWORD_VERIFIER_KEY) !== null;
}

/**
 * 设置主密码。
 * 这会使用提供的密码加密一个固定的验证文本，并将结果存储在 localStorage 中。
 * @param password - 用户设置的主密码。
 * @throws 如果加密或存储过程中发生错误。
 */
export async function setMasterPassword(password: string): Promise<void> {
  try {
    // 使用 encryptData 加密验证文本，得到 Armored PGP MESSAGE 字符串
    const encryptedVerifierArmored = await encryptData(VERIFIER_PLAINTEXT, password);
    // 直接将加密后的字符串存储
    localStorage.setItem(MASTER_PASSWORD_VERIFIER_KEY, encryptedVerifierArmored);
  } catch (error) {
    console.error("Failed to set master password verifier:", error);
    throw new Error("无法设置主密码验证器。");
  }
}

/**
 * 验证提供的主密码是否正确。
 * 它会尝试使用提供的密码解密存储在 localStorage 中的验证器。
 * @param password - 用户输入的主密码。
 * @returns Promise<boolean> - 如果密码正确且能成功解密验证器，则返回 true，否则返回 false。
 */
export async function verifyMasterPassword(password: string): Promise<boolean> {
  // 从 localStorage 获取存储的加密验证器（Armored 字符串）
  const storedVerifierArmored = localStorage.getItem(MASTER_PASSWORD_VERIFIER_KEY);
  if (!storedVerifierArmored) {
    // 如果验证器不存在（例如首次使用），则无法验证
    console.warn("Master password verifier not found in storage.");
    return false;
  }
  try {
    // 使用 decryptData 尝试解密存储的验证器
    const decrypted = await decryptData(storedVerifierArmored, password);
    // 比较解密后的文本是否与原始验证文本匹配
    return decrypted === VERIFIER_PLAINTEXT;
  } catch (error) {
    // 如果解密失败（密码错误或数据损坏），则验证失败
    console.error("Failed to verify master password:", error);
    return false;
  }
}

// --- 对称数据加密/解密 (使用主密码) ---

/**
 * 使用提供的密码加密任意文本数据。
 * 返回加密后的 Armored PGP MESSAGE 格式字符串。
 * @param plaintext - 需要加密的明文文本。
 * @param password - 用于加密的密码（通常是主密码）。
 * @returns Promise<string> - 加密后的 Armored PGP MESSAGE 字符串。
 * @throws 如果加密过程中发生错误。
 */
export async function encryptData(plaintext: string, password: string): Promise<string> {
  try {
    // 创建一个 OpenPGP 消息对象
    const message = await openpgp.createMessage({ text: plaintext });
    // 使用密码进行加密，并指定输出格式为 armored
    const armoredEncrypted = await openpgp.encrypt({
      message,
      passwords: [password],
      format: 'armored'
    });
    return armoredEncrypted;
  } catch (error) {
    console.error("Encryption failed:", error);
    throw new Error("数据加密失败。");
  }
}

/**
 * 使用提供的密码解密之前由 encryptData 加密的数据。
 * @param encryptedArmored - 之前由 encryptData 生成的 Armored PGP MESSAGE 字符串。
 * @param password - 用于解密的密码（通常是主密码）。
 * @returns Promise<string> - 解密后的明文文本。
 * @throws 如果解密失败（例如密码错误、数据损坏）。
 */
export async function decryptData(encryptedArmored: string, password: string): Promise<string> {
  try {
    // 读取 Armored 消息
    const message = await openpgp.readMessage({ armoredMessage: encryptedArmored });
    // 使用密码进行解密，并指定输出格式为 string
    const { data: decryptedData } = await openpgp.decrypt({
      message,
      passwords: [password],
      format: 'string' // 直接获取解密后的字符串
    });
    // 确保返回的是字符串类型
    if (typeof decryptedData !== 'string') {
        throw new Error("Decrypted data is not a string.");
    }
    return decryptedData;
  } catch (error) {
    console.error("Decryption failed:", error);
    // 尝试更具体地识别密码错误
    if (error instanceof Error && (error.message.includes('password') || error.message.includes('Passphrase incorrect'))) {
        throw new Error("密码错误或数据已损坏。");
    }
    throw new Error("数据解密失败。");
  }
}

// --- 密钥存储与加载操作 ---

/**
 * 从 localStorage 加载所有存储的密钥。
 * 会自动解密私钥数据。
 * @param masterPassword - 用于解密存储的私钥的主密码。
 * @returns Promise<PGPKey[]> - 解析后的 PGPKey 对象数组。如果加载失败或没有密钥，则返回空数组。
 * @throws 如果在解密某个私钥时主密码错误或数据损坏。
 */
export async function loadKeysFromStorage(masterPassword: string): Promise<PGPKey[]> {
  const storedData = localStorage.getItem(STORAGE_KEY);
  if (!storedData) {
    return []; // 没有存储的密钥，返回空数组
  }

  let storedKeys: StoredKey[];
  try {
      storedKeys = JSON.parse(storedData);
      if (!Array.isArray(storedKeys)) {
          throw new Error("Stored key data is not an array.");
      }
  } catch(error) {
      console.error("Failed to parse stored keys from localStorage:", error);
      // 如果存储的数据格式错误，可以选择清空或返回空数组
      clearAllStoredKeys(); // 清空损坏的数据可能更安全
      return [];
  }

  const loadedKeys: PGPKey[] = [];

  for (const storedKey of storedKeys) {
    // 基本验证 storedKey 结构
    if (!storedKey || typeof storedKey.keyId !== 'string' || typeof storedKey.data !== 'string') {
        console.warn("Skipping invalid stored key entry:", storedKey);
        continue;
    }

    try {
      let armoredKeyData: string;
      let isPrivate = false;

      if (storedKey.type === 'private') {
        // 私钥需要使用主密码解密存储的 armored 数据
        armoredKeyData = await decryptData(storedKey.data, masterPassword);
        isPrivate = true;
      } else {
        // 公钥直接使用存储的 armored 数据
        armoredKeyData = storedKey.data;
        isPrivate = false;
      }

      // 使用解密后（或原始）的 armored 数据解析密钥对象
      let keyObject: openpgp.Key | openpgp.PrivateKey | null = null;
      try {
        if (isPrivate) {
            // 尝试读取为私钥
            keyObject = await openpgp.readPrivateKey({ armoredKey: armoredKeyData });
            // 注意：这里的私钥对象是未锁定的，因为是用主密码解密的。
            // 如果原始私钥本身还带有密码，该密码信息在存储/加载中丢失了。
            // 这是一个简化：我们假设主密码是访问私钥的唯一屏障。
        } else {
            // 尝试读取为公钥
            keyObject = await openpgp.readKey({ armoredKey: armoredKeyData });
        }
      } catch (parseError) {
           console.error(`Failed to parse key data for key ID ${storedKey.keyId}:`, parseError);
           // 解析失败，跳过这个密钥
           continue;
      }


      if (keyObject) {
        // 从解析成功的 keyObject 中获取最新信息，这比依赖存储的元数据更可靠
        const actualKeyId = keyObject.getKeyID().toHex();
        const primaryUser = await keyObject.getPrimaryUser();
        // 处理可能没有 userID 的情况
        const primaryUserId = primaryUser?.user?.userID?.userID ?? `No User ID (${actualKeyId.slice(-8)})`;
        const userIds = keyObject.getUserIDs().map((uidPacket: any) => uidPacket?.userID ?? `No UserID packet`);
        const creationTime = keyObject.getCreationTime();

        // 使用从 keyObject 获取的权威信息构建 PGPKey 对象
        loadedKeys.push({
          keyId: actualKeyId,
          armored: armoredKeyData, // 存储解密后的或原始的 armored
          keyObject: keyObject,
          userIds: userIds.length > 0 ? userIds : [primaryUserId], // 确保至少有一个标识符
          primaryUserId: primaryUserId,
          isPrivate: keyObject.isPrivate(), // 使用 keyObject 的方法判断更准确
          creationTime: creationTime,
        });
      } else {
         // 理论上如果解析成功，keyObject 不会是 null，但作为防御性编程
         console.warn(`Parsed key object is null for stored key ID: ${storedKey.keyId}`);
      }
    } catch (error) {
      // 处理在解密或解析单个密钥时发生的错误
      console.error(`Error loading key associated with stored ID ${storedKey.keyId}:`, error);
      // 如果是密码错误，则抛出，强制用户重新输入主密码
      if (error instanceof Error && error.message.includes('密码错误')) {
          throw new Error(`加载密钥 ${storedKey.keyId.slice(-8)} 时主密码错误或数据损坏。请检查主密码或重置应用。`);
      }
      // 对于其他错误（例如密钥数据损坏），记录警告并跳过此密钥
       console.warn(`Skipping key ${storedKey.keyId} due to loading error.`);
    }
  }
  console.log(`Successfully loaded ${loadedKeys.length} keys from storage.`);
  return loadedKeys;
}


/**
 * 将当前内存中的 PGPKey 数组保存到 localStorage。
 * 私钥数据会被主密码加密后存储。
 * @param keys - 需要保存的 PGPKey 对象数组。
 * @param masterPassword - 用于加密私钥的主密码。
 * @throws 如果在准备或存储过程中发生错误。
 */
export async function saveKeysToStorage(keys: PGPKey[], masterPassword: string): Promise<void> {
  const keysToStore: StoredKey[] = [];

  for (const key of keys) {
    try {
        let dataToStore: string;
        if (key.isPrivate) {
            // 加密私钥的 armored 字符串
            dataToStore = await encryptData(key.armored, masterPassword);
        } else {
            // 公钥直接使用它的 armored 字符串
            dataToStore = key.armored;
        }

        // 构建 StoredKey 对象，包含一些元数据以便快速显示
        keysToStore.push({
            keyId: key.keyId,
            type: key.isPrivate ? 'private' : 'public',
            data: dataToStore,
            userIds: key.userIds,
            primaryUserId: key.primaryUserId,
            creationTime: key.creationTime.toISOString(), // 存储为 ISO 格式字符串
        });

    } catch(error) {
        // 如果准备某个密钥失败，记录错误并抛出，防止存储不完整的数据
        console.error(`Error preparing key ${key.keyId} for storage:`, error);
        throw new Error(`无法准备密钥 ${key.keyId.slice(-8)} 进行存储。`);
    }
  }

  try {
      // 将 StoredKey 数组序列化为 JSON 字符串并存储
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keysToStore));
      console.log(`Saved ${keysToStore.length} keys to storage.`);
  } catch (error) {
      console.error("Failed to save keys to localStorage:", error);
      // 处理可能的存储错误（例如超出 localStorage 配额）
      throw new Error("无法将密钥保存到浏览器存储。存储空间可能已满。");
  }
}

/**
 * 从 localStorage 中彻底删除所有存储的密钥和主密码验证器。
 * 此操作不可恢复。
 */
export function clearAllStoredKeys(): void {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(MASTER_PASSWORD_VERIFIER_KEY);
    console.log("All keys and master password verifier removed from storage.");
}