// src/components/EncryptMessage.tsx
import React, { useState, useCallback } from 'react';
import * as openpgp from 'openpgp';

// --- Component Props ---
interface EncryptMessageProps {
  // 接收解析后的 openpgp.Key 公钥对象数组
  publicKeys: openpgp.Key[];
}

export default function EncryptMessage({ publicKeys }: EncryptMessageProps) {
  // --- State ---
  const [plaintext, setPlaintext] = useState(''); // 明文输入
  const [ciphertext, setCiphertext] = useState(''); // 加密后的密文输出
  const [selectedKeyIds, setSelectedKeyIds] = useState<Set<string>>(new Set()); // 存储选中的公钥 Key ID (使用 Set 方便增删和检查)
  const [isLoading, setIsLoading] = useState(false); // 加密操作的加载状态
  const [error, setError] = useState<string | null>(null); // 错误信息

  // --- Recipient Selection Handler ---
  const handleRecipientChange = (keyId: string, checked: boolean) => {
    setSelectedKeyIds(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (checked) {
        newSelected.add(keyId);
      } else {
        newSelected.delete(keyId);
      }
      return newSelected;
    });
  };

  // --- Encryption Logic ---
  const handleEncrypt = useCallback(async () => {
    // 0. Basic validation
    if (!plaintext.trim()) {
      setError("请输入要加密的消息。");
      return;
    }
    if (selectedKeyIds.size === 0) {
      setError("请至少选择一个收件人的公钥。");
      return;
    }

    // 1. Reset state
    setIsLoading(true);
    setError(null);
    setCiphertext('');

    try {
        // 2. Find selected key objects
        // Map selectedKeyIds (Set<string>) to an array of key IDs
        const keyIdArray = Array.from(selectedKeyIds);
        // Find the corresponding openpgp.Key objects from the props
        const encryptionKeys = keyIdArray.map(id => {
            const key = publicKeys.find(pk => pk.getKeyID().toHex() === id);
            if (!key) {
                // This should ideally not happen if the list is consistent
                throw new Error(`找不到 KeyID 为 ${id.slice(-8)} 的公钥对象。`);
            }
            return key;
        });

        console.log(`Encrypting for ${encryptionKeys.length} recipients:`, encryptionKeys.map(k=>k.getKeyID().toHex()));

        // 3. Create message object
        const message = await openpgp.createMessage({ text: plaintext });

        // 4. Encrypt the message
        const encryptedArmored = await openpgp.encrypt({
            message,
            encryptionKeys: encryptionKeys, // Pass the array of openpgp.Key objects
            // signingKeys?: PrivateKey | PrivateKey[]; // Optionally sign while encrypting
            format: 'armored' // Ensure output is armored string
        });

        // 5. Update state with result
        setCiphertext(encryptedArmored);
        // Optionally clear plaintext after successful encryption
        // setPlaintext('');
        // setSelectedKeyIds(new Set()); // Optionally clear selection

    } catch (err: any) {
        console.error("Encryption failed:", err);
        setError(`加密失败: ${err.message}`);
    } finally {
        // 6. Turn off loading indicator
        setIsLoading(false);
    }
  }, [plaintext, selectedKeyIds, publicKeys]); // Dependencies for useCallback


  // --- Helper to copy ciphertext ---
  const copyToClipboard = async () => {
    if (!ciphertext) return;
    try {
        await navigator.clipboard.writeText(ciphertext);
        alert("密文已复制到剪贴板！");
    } catch (err) {
        console.error('Failed to copy text: ', err);
        alert("复制失败，请手动复制。");
    }
   };

  // --- Render ---
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-2xl font-semibold mb-4 text-gray-700">加密消息</h2>

      {/* Plaintext Input */}
      <div className="mb-4">
        <label htmlFor="plaintext" className="block text-sm font-medium text-gray-700 mb-1">
          输入明文:
        </label>
        <textarea
          id="plaintext"
          rows={5}
          className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={plaintext}
          onChange={(e) => setPlaintext(e.target.value)}
          placeholder="在此输入你想加密的消息..."
          disabled={isLoading}
        />
      </div>

      {/* Recipient Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          选择收件人公钥:
        </label>
        {publicKeys.length === 0 ? (
          <p className="text-sm text-gray-500">没有可用的公钥。请先在密钥管理中导入公钥。</p>
        ) : (
          <div className="max-h-40 overflow-y-auto border rounded p-2 bg-gray-50 space-y-1">
            {publicKeys.map(key => {
              // 提取主要 UserID 以便显示
               const primaryUserId = key.getUserIDs()[0] ?? `Unknown (${key.getKeyID().toHex().slice(-8)})`;
               const keyIdHex = key.getKeyID().toHex();
               return (
                  <div key={keyIdHex} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`pk-${keyIdHex}`}
                      checked={selectedKeyIds.has(keyIdHex)}
                      onChange={(e) => handleRecipientChange(keyIdHex, e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      disabled={isLoading}
                    />
                    <label htmlFor={`pk-${keyIdHex}`} className="ml-2 text-sm text-gray-700 cursor-pointer">
                      {primaryUserId} <span className="text-xs text-gray-500 font-mono">({keyIdHex.slice(-16)})</span>
                    </label>
                  </div>
               );
            })}
          </div>
        )}
      </div>

      {/* Encrypt Button */}
      <button
        onClick={handleEncrypt}
        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isLoading || !plaintext.trim() || publicKeys.length === 0 || selectedKeyIds.size === 0}
      >
        {isLoading ? '加密中...' : '开始加密'}
      </button>

      {/* Error Display */}
      {error && (
        <p className="mt-3 text-red-600 bg-red-100 p-3 rounded text-sm">{error}</p>
      )}

      {/* Ciphertext Output */}
      {ciphertext && (
        <div className="mt-6">
           <label htmlFor="ciphertext" className="block text-sm font-medium text-gray-700 mb-1">
             加密后的消息 (PGP MESSAGE):
           </label>
           <textarea
            id="ciphertext"
            rows={8}
            readOnly
            className="w-full p-2 border rounded bg-gray-50 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={ciphertext}
          />
          <button
             onClick={copyToClipboard}
             className="mt-2 px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
          >
             复制密文
           </button>
        </div>
      )}
    </div>
  );
}