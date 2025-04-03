// src/app/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import * as openpgp from 'openpgp';
import { PGPKey, KeyGenOptions } from '@/types'; // 导入类型
import {
    hasMasterPassword,
    setMasterPassword,
    verifyMasterPassword,
    loadKeysFromStorage,
    saveKeysToStorage,
    clearAllStoredKeys,
    decryptData // 需要导入 decryptData 来解密单个密钥（如果需要）
} from '@/lib/storage'; // 导入存储工具函数
import { PasswordModal } from '@/components/Modal'; // 导入密码模态框

// 导入子组件 (稍后会创建或更新它们)
import KeyManagement from '@/components/KeyManagement';
import EncryptMessage from '@/components/EncryptMessage';
import DecryptMessage from '@/components/DecryptMessage';
import SignMessage from '@/components/SignMessage';
import VerifySignature from '@/components/VerifySignature';

export default function Home() {
    // --- 状态管理 ---
    const [keys, setKeys] = useState<PGPKey[]>([]); // 存储所有解密/加载后的密钥
    const [isAppLocked, setIsAppLocked] = useState<boolean>(true); // 应用是否被主密码锁定
    const [masterPassword, setMasterPasswordState] = useState<string | null>(null); // 存储已验证的主密码 (仅内存)
    const [showMasterPasswordModal, setShowMasterPasswordModal] = useState<boolean>(false); // 是否显示主密码模态框
    const [masterPasswordError, setMasterPasswordError] = useState<string | null>(null); // 主密码错误提示
    const [isLoading, setIsLoading] = useState<boolean>(true); // 初始加载状态

    // --- Web Worker 配置和应用初始化 ---
    useEffect(() => {
        // 配置 OpenPGP.js Worker 路径
        // 假设 openpgp.worker.js 和 openpgp.asm.js 在 public 目录下
        openpgp.config.workerPath = '/openpgp.worker.js';
        // openpgp.config.integrity_protect = true; // 可以增强安全性，但可能需要更多配置
        console.log("OpenPGP worker path configured.");

        // 检查是否已设置主密码
        const needsMasterPassword = hasMasterPassword();
        if (needsMasterPassword) {
            setIsAppLocked(true);
            setShowMasterPasswordModal(true); // 提示输入主密码
            setIsLoading(false); // 停止加载，等待用户输入
        } else {
            // 没有主密码，可能是首次使用
            setIsAppLocked(false); // 应用未锁定
            setIsLoading(false); // 加载完成 (没有密钥可加载)
            console.log("No master password set. App unlocked.");
            // 可以选择在这里提示用户设置主密码
        }
        // 注意：如果 needsMasterPassword 为 true，加载密钥的操作将在 handleMasterPasswordSubmit 中进行
    }, []);

    // --- 主密码处理 ---
    const handleMasterPasswordSubmit = async (password: string) => {
        setMasterPasswordError(null); // 清除旧错误
        setIsLoading(true); // 开始处理

        if (!hasMasterPassword()) {
            // 首次设置主密码
            try {
                await setMasterPassword(password);
                setMasterPasswordState(password); // 存入内存
                setIsAppLocked(false);
                setShowMasterPasswordModal(false);
                setKeys([]); // 初始密钥为空
                console.log("Master password set successfully.");
            } catch (error) {
                console.error("Failed to set master password:", error);
                setMasterPasswordError(error instanceof Error ? error.message : "设置主密码失败");
            } finally {
                setIsLoading(false);
            }
        } else {
            // 验证现有主密码
            const isValid = await verifyMasterPassword(password);
            if (isValid) {
                setMasterPasswordState(password); // 存入内存
                setIsAppLocked(false);
                setShowMasterPasswordModal(false);
                // 密码正确，加载密钥
                try {
                    const loadedKeys = await loadKeysFromStorage(password);
                    setKeys(loadedKeys);
                    console.log(`Loaded ${loadedKeys.length} keys.`);
                } catch (error) {
                     console.error("Failed to load keys after unlocking:", error);
                     setMasterPasswordError(error instanceof Error ? error.message : "加载密钥失败");
                     // 加载失败，保持锁定状态？或者清空密钥？让用户决定可能更好
                     // 为了简单，我们保持锁定并显示错误
                     setIsAppLocked(true);
                     setShowMasterPasswordModal(true);
                }
            } else {
                setMasterPasswordError("主密码错误，请重试。");
            }
             setIsLoading(false); // 处理完成
        }
    };

    // --- 密钥操作 (增删改查) ---

    // 使用 useCallback 包装这些函数，以便在传递给子组件时保持引用稳定
    const saveKeys = useCallback(async (updatedKeys: PGPKey[]) => {
        if (!masterPassword) {
            console.error("Cannot save keys: Master password not available.");
            alert("错误：无法保存密钥，主密码无效。");
            return;
        }
        try {
            await saveKeysToStorage(updatedKeys, masterPassword);
        } catch (error) {
             console.error("Failed to save keys:", error);
             alert(`保存密钥失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }, [masterPassword]); // 依赖 masterPassword

    const addKey = useCallback(async (newKey: PGPKey) => {
        // 检查 KeyID 是否已存在
        const existingKeyIndex = keys.findIndex(k => k.keyId === newKey.keyId);

        let updatedKeys: PGPKey[];

        if (existingKeyIndex !== -1) {
            // KeyID 已存在
            const existingKey = keys[existingKeyIndex];
            if (existingKey.isPrivate) {
                // 已存在私钥，不允许覆盖（或提示用户？）
                alert(`错误：具有相同 KeyID (${newKey.keyId.slice(-8)}) 的私钥已存在。`);
                return; // 或者抛出错误
            } else if (newKey.isPrivate) {
                // 导入的是私钥，而现有的是公钥 -> 升级！
                console.log(`Upgrading key ${newKey.keyId.slice(-8)} from public to private.`);
                updatedKeys = [...keys];
                updatedKeys[existingKeyIndex] = newKey; // 替换为新的私钥对象
                alert(`密钥 ${newKey.keyId.slice(-8)} 已从公钥升级为私钥。`);
            } else {
                // 导入的是公钥，现有也是公钥 -> 无需操作
                 alert(`具有相同 KeyID (${newKey.keyId.slice(-8)}) 的公钥已存在。`);
                return;
            }
        } else {
            // 新 KeyID，直接添加
            updatedKeys = [...keys, newKey];
            alert(`成功导入 ${newKey.isPrivate ? '私钥' : '公钥'}: ${newKey.primaryUserId} (${newKey.keyId.slice(-8)})`);
        }

        setKeys(updatedKeys);
        await saveKeys(updatedKeys);

    }, [keys, saveKeys]); // 依赖 keys 和 saveKeys

    const deleteKey = useCallback(async (keyId: string) => {
        // 添加确认步骤
        const keyToDelete = keys.find(k => k.keyId === keyId);
        if (!keyToDelete) return;

        const confirmation = window.confirm(
            `确实要删除密钥 ${keyToDelete.primaryUserId} (${keyId.slice(-8)}) 吗？\n` +
            `${keyToDelete.isPrivate ? '这是一个私钥，删除后将无法解密/签名！' : ''}\n` +
            `此操作不可恢复。`
        );

        if (confirmation) {
            const updatedKeys = keys.filter(key => key.keyId !== keyId);
            setKeys(updatedKeys);
            await saveKeys(updatedKeys);
            alert(`密钥 ${keyId.slice(-8)} 已删除。`);
        }
    }, [keys, saveKeys]); // 依赖 keys 和 saveKeys

    // 提供给子组件解密单个私钥的函数 (如果需要临时解锁进行操作)
    // 注意：此函数返回的是未加密的 armored 私钥，需谨慎使用
    const getDecryptedPrivateKeyArmored = useCallback(async (keyId: string, passphrase?: string): Promise<string | null> => {
        const key = keys.find(k => k.keyId === keyId && k.isPrivate);
        if (!key) return null;

        // 尝试使用密钥自身的密码解密 keyObject
        // openpgp.js v5+ decryptKey 需要 Key object
        if (!key.keyObject || !key.keyObject.isPrivate()) {
             console.error("Key object is not a private key or is missing.");
             return null;
        }
         // 首先，检查 keyObject 是否已解锁（可能在导入时已提供密码）
        if (!key.keyObject.isDecrypted()) {
            if (!passphrase) {
                // 如果需要密码但未提供，则无法解密
                 console.warn(`Passphrase needed for key ${keyId.slice(-8)}, but not provided.`);
                throw new Error(`需要密钥 ${keyId.slice(-8)} 的密码。`); // 抛出错误让调用者处理
            }
            try {
                const decryptedKeyObject = await openpgp.decryptKey({
                    privateKey: key.keyObject as openpgp.PrivateKey,
                    passphrase: passphrase,
                });
                // 返回解密后的 armored 字符串
                 return decryptedKeyObject.armor();
            } catch (error) {
                console.error(`Failed to decrypt key ${keyId} with provided passphrase:`, error);
                 if (error instanceof Error && (error.message.includes('password') || error.message.includes('Passphrase'))) {
                     throw new Error(`密钥 ${keyId.slice(-8)} 的密码错误。`);
                 }
                throw new Error(`解密密钥 ${keyId.slice(-8)} 失败。`);
            }
        } else {
             // 如果 keyObject 已经是解密的，直接导出 armored 字符串
             return key.keyObject.armor();
        }

    }, [keys]); // 依赖 keys

    // --- 渲染 ---

    // 加载中或等待主密码时显示不同内容
    if (isLoading) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center p-12 bg-gray-100">
                <div className="text-xl text-gray-600">加载中...</div>
            </main>
        );
    }

    // 应用被锁定时，只显示主密码模态框
    if (isAppLocked) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center p-12 bg-gray-100">
                 <PasswordModal
                    isOpen={showMasterPasswordModal}
                    onClose={() => { /* 不允许用户关闭，必须输入密码 */ }}
                    onSubmit={handleMasterPasswordSubmit}
                    title={hasMasterPassword() ? "解锁应用" : "设置主密码"}
                    message={hasMasterPassword()
                        ? "请输入您的主密码以加载密钥并解锁应用。"
                        : "首次使用，请设置一个强主密码来保护您的私钥。忘记主密码将无法访问私钥！"
                    }
                />
                {masterPasswordError && (
                    <p className="mt-4 text-red-600 bg-red-100 p-3 rounded">{masterPasswordError}</p>
                )}
                 {/* 可以添加一个重置应用的按钮 */}
                 <button
                    onClick={() => {
                        if (window.confirm("警告：这将删除所有已存储的密钥和主密码设置，数据将丢失且无法恢复！确定要重置吗？")) {
                            clearAllStoredKeys();
                            // 强制刷新页面以重新开始设置流程
                            window.location.reload();
                        }
                    }}
                    className="mt-8 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                 >
                    重置应用 (删除所有数据)
                 </button>
            </main>
        );
    }


    // --- 应用解锁后的主界面 ---
    // 准备传递给子组件的 props
    const publicKeys = keys.filter(k => !k.isPrivate).map(k => k.keyObject as openpgp.Key);
    const privatePGPKeys = keys.filter(k => k.isPrivate); // 传递 PGPKey 对象，包含更多信息

    return (
        <main className="flex min-h-screen flex-col items-center justify-start p-6 md:p-12 bg-gray-100">
            <h1 className="text-3xl md:text-4xl font-bold mb-8 text-gray-800">Web OpenPGP 客户端</h1>

            {/* 主密码已设置且应用已解锁的提示 */}
            <div className="w-full max-w-4xl mb-4 text-sm text-green-700 bg-green-100 p-2 rounded text-center">
                应用已使用主密码解锁。
                 <button
                    onClick={() => {
                        // 简单地锁定应用（刷新页面会要求重新输入密码）
                        // 更复杂的方式是清除内存中的 masterPassword 并设置 isAppLocked
                        setMasterPasswordState(null);
                        setIsAppLocked(true);
                        setShowMasterPasswordModal(true); // 准备下次解锁
                        setKeys([]); // 清除内存中的密钥
                    }}
                    className="ml-4 px-2 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600"
                 >
                    锁定应用
                 </button>
            </div>


            <div className="w-full max-w-4xl space-y-6">
                {/* 密钥管理 */}
                <KeyManagement
                    keys={keys}
                    onAddKey={addKey}
                    onDeleteKey={deleteKey}
                    // onGenerateKey={generateKey} // generateKey 需要在这里实现或传入
                />

                {/* 加密消息 */}
                <EncryptMessage
                    publicKeys={publicKeys} // 只传递 openpgp Key 对象
                 />

                {/* 解密消息 */}
                <DecryptMessage
                    privateKeys={privatePGPKeys} // 传递 PGPKey 对象
                    publicKeys={publicKeys} // 用于验证签名
                    getDecryptedPrivateKeyArmored={getDecryptedPrivateKeyArmored} // 传递解密函数
                />

                {/* 签名消息 */}
                <SignMessage
                    privateKeys={privatePGPKeys}
                    getDecryptedPrivateKeyArmored={getDecryptedPrivateKeyArmored}
                />

                {/* 验证签名 */}
                <VerifySignature
                     publicKeys={publicKeys}
                />
            </div>
        </main>
    );
}