// src/components/KeyManagement.tsx
import React, { useState, useCallback } from 'react';
import * as openpgp from 'openpgp';
import { PGPKey, KeyGenOptions } from '@/types'; // Import shared types
import Modal, { PasswordModal } from './Modal'; // Import default Modal and named PasswordModal

// --- Helper Functions ---
function formatDate(date: Date): string {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return 'Invalid Date';
    }
    return date.toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
    });
}

// --- Component Props ---
interface KeyManagementProps {
  keys: PGPKey[];
  onAddKey: (newKey: PGPKey) => Promise<void>; // Function to add a key to the main state
  onDeleteKey: (keyId: string) => Promise<void>; // Function to delete a key
  // We'll implement generateKey logic inside this component first, then potentially move if needed
}

// --- The Component ---
export default function KeyManagement({ keys, onAddKey, onDeleteKey }: KeyManagementProps) {
  // --- State ---
  const [keyImportText, setKeyImportText] = useState(''); // Textarea for pasting keys
  const [isImporting, setIsImporting] = useState(false); // Loading state for import
  const [importError, setImportError] = useState<string | null>(null); // Error message for import
  const [showImportPasswordModal, setShowImportPasswordModal] = useState(false); // PW Modal visibility
  const [armoredKeyToImport, setArmoredKeyToImport] = useState<string | null>(null); // Store key needing PW
  const [keyIdRequiringPassword, setKeyIdRequiringPassword] = useState<string | null>(null); // For PW Modal title

  const [showGenerateModal, setShowGenerateModal] = useState(false); // Generation Modal visibility
  const [isGenerating, setIsGenerating] = useState(false); // Loading state for generation
  const [generateError, setGenerateError] = useState<string | null>(null); // Error for generation
  const [genOptions, setGenOptions] = useState<KeyGenOptions>({ // Form state for generation
    name: '',
    email: '',
    passphrase: '',
    keyType: 'ecc', // Default to ECC
    curve: 'curve25519', // Default curve
    rsaBits: 4096, // Default RSA bits (if selected)
  });

  // --- Key Import Logic ---
  const handleImportAttempt = useCallback(async (armoredKey: string, passphrase?: string) => {
    setIsImporting(true);
    setImportError(null);
    let keyObject: openpgp.Key | openpgp.PrivateKey | null = null;
    let parsedKey: PGPKey | null = null;

    try {
        // --- 1. Try reading as Private Key ---
        try {
            console.log("Attempting to read as private key...");
            keyObject = await openpgp.readPrivateKey({ armoredKey, passphrase });
            console.log("Successfully read as private key:", keyObject.getKeyID().toHex());
        } catch (privError: any) {
            console.log("Failed to read as private key:", privError.message);
            // Check if it failed specifically because it's encrypted AND no passphrase was provided
            if (privError.message.includes('encrypted') && !passphrase) {
                 console.log("Private key is encrypted, requesting passphrase...");
                // Extract KeyID(s) from the armored key for better prompt
                // Note: readKeyPacketHeaders is simpler but might not always get the primary key ID easily.
                // Reading as generic key first might be better.
                 let keyIdHint = 'Unknown Key';
                 try {
                    const pubKey = await openpgp.readKey({ armoredKey });
                    keyIdHint = pubKey.getKeyID().toHex().slice(-16);
                 } catch (e) { /* Ignore error reading as public key here */ }

                setArmoredKeyToImport(armoredKey); // Store the key text
                setKeyIdRequiringPassword(keyIdHint); // Store hint for modal
                setShowImportPasswordModal(true); // Show password modal
                // Stop processing here, wait for modal submission
                setIsImporting(false); // Turn off loading indicator while modal is open
                return; // Exit the function
            }
             // If it's another private key error, or if a passphrase was provided but failed,
             // fall through to try reading as a public key.
             keyObject = null; // Ensure keyObject is null before trying public key
        }

        // --- 2. Try reading as Public Key (if private read failed or wasn't attempted) ---
        if (!keyObject) {
            try {
                console.log("Attempting to read as public key...");
                keyObject = await openpgp.readKey({ armoredKey });
                console.log("Successfully read as public key:", keyObject.getKeyID().toHex());
            } catch (pubError: any) {
                console.error("Failed to read key as either private or public:", pubError);
                throw new Error(`无法读取密钥。请检查密钥格式。错误: ${pubError.message}`);
            }
        }

        // --- 3. Build PGPKey Object and Add ---
        if (keyObject) {
            const keyId = keyObject.getKeyID().toHex();
            const isPrivate = keyObject.isPrivate();
            const primaryUser = await keyObject.getPrimaryUser();
            const primaryUserId = primaryUser?.user?.userID?.userID ?? `No User ID (${keyId.slice(-8)})`;
            const userIds = keyObject.getUserIDs().map((uidPacket: any) => uidPacket?.userID ?? 'No UserID packet');
            const creationTime = keyObject.getCreationTime();

            parsedKey = {
                keyId,
                armored: armoredKey, // Store the original armored key provided by user
                keyObject,
                userIds: userIds.length > 0 ? userIds : [primaryUserId],
                primaryUserId,
                isPrivate,
                creationTime,
            };

            await onAddKey(parsedKey); // Call parent function to add/update the key
            setKeyImportText(''); // Clear textarea on success
            setArmoredKeyToImport(null); // Clear temporary storage
            setKeyIdRequiringPassword(null);

        } else {
             // Should not happen if logic above is correct, but as a fallback
             throw new Error("未能成功解析密钥对象。");
        }

    } catch (error: any) {
        console.error("Key import failed:", error);
        setImportError(`导入失败: ${error.message}`);
    } finally {
        setIsImporting(false);
        // Ensure modal is closed if it was open and process finished (error or success)
        // but not if we *just* opened it for password input
        if (showImportPasswordModal && armoredKeyToImport === null) {
             setShowImportPasswordModal(false);
        }
    }
  }, [onAddKey, showImportPasswordModal, armoredKeyToImport]); // Dependencies for useCallback

  // Handler for the Import button click
  const handleImportClick = () => {
    if (!keyImportText.trim()) {
      setImportError("请先粘贴 Armored PGP 密钥。");
      return;
    }
    handleImportAttempt(keyImportText.trim());
  };

  // Handler for the password modal submission
  const handleImportWithPassword = (password: string) => {
    if (armoredKeyToImport) {
        setShowImportPasswordModal(false); // Close modal immediately
        handleImportAttempt(armoredKeyToImport, password); // Re-attempt import with password
    } else {
        console.error("handleImportWithPassword called without armoredKeyToImport set.");
        setImportError("内部错误：丢失了要导入的密钥。");
         setShowImportPasswordModal(false);
    }
  };

  // --- Key Generation Logic ---
  const handleGenerateModalOpen = () => {
      setGenerateError(null); // Clear previous errors
      setShowGenerateModal(true);
  };

  const handleGenerateModalClose = () => {
      setShowGenerateModal(false);
      // Optionally reset form fields when closing
      // setGenOptions({ name: '', email: '', passphrase: '', keyType: 'ecc', curve: 'curve25519', rsaBits: 4096 });
  };

  const handleGenerateKey = async (event: React.FormEvent) => {
      event.preventDefault();
      setIsGenerating(true);
      setGenerateError(null);

      const { name, email, passphrase, keyType, curve, rsaBits } = genOptions;

      if (!name.trim() || !email.trim()) {
          setGenerateError("姓名和邮箱不能为空。");
          setIsGenerating(false);
          return;
      }

      // Basic email format check (not exhaustive)
      if (!/\S+@\S+\.\S+/.test(email)) {
           setGenerateError("邮箱格式无效。");
           setIsGenerating(false);
           return;
      }

      // Passphrase confirmation might be needed in a real app
      // if (passphrase !== confirmPassphrase) { ... }

      try {
          console.log(`Generating ${keyType} key...`, genOptions);

          const options: any = {
              type: keyType,
              userIDs: [{ name, email }],
              passphrase: passphrase || undefined, // Pass undefined if empty, generateKey handles it
          };

          if (keyType === 'ecc') {
              options.curve = curve;
          } else { // RSA
              options.rsaBits = rsaBits;
          }

          // Generate the key pair
          const keyPair = await openpgp.generateKey(options);
          console.log("Key pair generated.");

          // Import the generated private key
          console.log("Importing generated private key...");
          await handleImportAttempt(keyPair.privateKey); // Import private first

          // Import the generated public key
          // The addKey logic in page.tsx should handle the "upgrade" gracefully if private is added first
          console.log("Importing generated public key...");
          await handleImportAttempt(keyPair.publicKey);

          handleGenerateModalClose(); // Close modal on success
          alert(`成功生成并导入 ${keyType.toUpperCase()} 密钥对！`);

      } catch (error: any) {
           console.error("Key generation failed:", error);
           setGenerateError(`生成失败: ${error.message}`);
      } finally {
          setIsGenerating(false);
      }
  };

  // --- Key Deletion Logic ---
  const handleDeleteClick = (keyId: string) => {
      // Confirmation is handled in page.tsx's deleteKey, just call it
      onDeleteKey(keyId);
  };

  // --- Key Export Logic ---
  const handleExportClick = (keyId: string, isPrivate: boolean) => {
      const keyToExp = keys.find(k => k.keyId === keyId);
      if (!keyToExp) {
          alert("错误：找不到要导出的密钥。");
          return;
      }

      // **Security Warning for Private Key Export**
      if (isPrivate) {
          if (!window.confirm(
              "警告：你正在尝试导出私钥！\n" +
              "私钥包含敏感信息，请务必妥善保管，不要在不安全的渠道分享。\n\n" +
              "确定要导出私钥吗？"
          )) {
              return; // User cancelled
          }
      }

      try {
        const armoredKey = keyToExp.armored; // Export the originally imported/generated armored key
        const blob = new Blob([armoredKey], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const filename = `${isPrivate ? 'private' : 'public'}_key_${keyToExp.primaryUserId.replace(/[^a-z0-9]/gi, '_')}_${keyId.slice(-8)}.asc`;
        link.download = filename;
        document.body.appendChild(link); // Required for Firefox
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url); // Clean up
      } catch (error: any) {
          console.error("Export failed:", error);
          alert(`导出密钥失败: ${error.message}`);
      }
  };


  // --- Render ---
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-2xl font-semibold mb-4 text-gray-700">密钥管理</h2>

      {/* --- Import Section --- */}
      <div className="mb-6 border-b pb-6">
        <h3 className="text-lg font-medium mb-2 text-gray-600">导入密钥</h3>
        <textarea
          placeholder="在此粘贴 Armored PGP 密钥 (公钥或私钥)..."
          className="w-full h-24 p-2 border rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={keyImportText}
          onChange={(e) => setKeyImportText(e.target.value)}
          disabled={isImporting}
        />
        {importError && <p className="text-red-600 text-sm mt-1">{importError}</p>}
        <button
          onClick={handleImportClick}
          className={`mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed`}
          disabled={isImporting || !keyImportText.trim()}
        >
          {isImporting ? '导入中...' : '导入密钥'}
        </button>
      </div>

      {/* --- Generate Section --- */}
      <div className="mb-6 border-b pb-6">
        <h3 className="text-lg font-medium mb-2 text-gray-600">生成新密钥</h3>
         <button
          onClick={handleGenerateModalOpen}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          生成新密钥对
        </button>
      </div>


      {/* --- Key List Section --- */}
      <div>
        <h3 className="text-lg font-medium mb-3 text-gray-600">已导入的密钥 ({keys.length})</h3>
        {keys.length === 0 ? (
          <p className="text-gray-500">尚未导入或生成任何密钥。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 tracking-wider">类型</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 tracking-wider">用户 ID</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 tracking-wider">Key ID (末尾)</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 tracking-wider">创建日期</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {keys.map(key => (
                  <tr key={key.keyId}>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        key.isPrivate ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {key.isPrivate ? '私钥' : '公钥'}
                      </span>
                    </td>
                    <td className="px-4 py-2 break-words max-w-xs">{key.primaryUserId}</td>
                    <td className="px-4 py-2 whitespace-nowrap font-mono">{key.keyId.slice(-16)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatDate(key.creationTime)}</td>
                    <td className="px-4 py-2 whitespace-nowrap space-x-2">
                      <button
                        onClick={() => handleExportClick(key.keyId, false)}
                        title="导出公钥"
                        className="text-blue-600 hover:text-blue-800 text-xs p-1 bg-blue-100 rounded"
                      >
                        导出公钥
                      </button>
                      {key.isPrivate && (
                        <button
                          onClick={() => handleExportClick(key.keyId, true)}
                          title="导出私钥"
                          className="text-yellow-600 hover:text-yellow-800 text-xs p-1 bg-yellow-100 rounded"
                        >
                          导出私钥
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteClick(key.keyId)}
                        title="删除密钥"
                        className="text-red-600 hover:text-red-800 text-xs p-1 bg-red-100 rounded"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

       {/* --- Modals --- */}
        <PasswordModal
            isOpen={showImportPasswordModal}
            onClose={() => {
                // Closing modal without submitting means cancelling the import for this key
                setShowImportPasswordModal(false);
                setArmoredKeyToImport(null); // Clear the key needing password
                setKeyIdRequiringPassword(null);
                setImportError("导入已取消，因为未提供密码。"); // Optionally inform user
            }}
            onSubmit={handleImportWithPassword}
            title="需要密钥密码"
            message={`请输入用于导入私钥 (${keyIdRequiringPassword ?? ''}) 的密码：`}
        />

        {/* --- Generation Modal --- */}
        {/* Using the generic Modal component for the generation form */}
        <Modal
            isOpen={showGenerateModal}
            onClose={handleGenerateModalClose}
            title="生成新的 PGP 密钥对"
        >
            <form onSubmit={handleGenerateKey} className="space-y-4">
                <div>
                    <label htmlFor="genName" className="block text-sm font-medium text-gray-700">姓名</label>
                    <input
                        type="text" id="genName" required
                        className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        value={genOptions.name}
                        onChange={e => setGenOptions({...genOptions, name: e.target.value})} />
                </div>
                 <div>
                    <label htmlFor="genEmail" className="block text-sm font-medium text-gray-700">邮箱</label>
                    <input
                        type="email" id="genEmail" required
                        className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        value={genOptions.email}
                        onChange={e => setGenOptions({...genOptions, email: e.target.value})} />
                </div>
                <div>
                    <label htmlFor="genPassphrase" className="block text-sm font-medium text-gray-700">
                        密码 (可选, 用于保护私钥)
                    </label>
                    <input
                        type="password" id="genPassphrase"
                        className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        value={genOptions.passphrase}
                        onChange={e => setGenOptions({...genOptions, passphrase: e.target.value})}
                        aria-describedby="passphrase-help"
                         />
                     <p className="mt-1 text-xs text-gray-500" id="passphrase-help">
                       如果留空，私钥将不会被密码保护（不推荐）。
                     </p>
                </div>
                {/* Key Type Selection */}
                 <div>
                     <label className="block text-sm font-medium text-gray-700">密钥类型</label>
                     <select
                         className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                         value={genOptions.keyType}
                         onChange={e => setGenOptions({...genOptions, keyType: e.target.value as 'rsa' | 'ecc'})}
                     >
                         <option value="ecc">ECC (推荐: Curve25519)</option>
                         <option value="rsa">RSA</option>
                     </select>
                 </div>

                 {/* ECC Curve Selection (Conditional) */}
                 {genOptions.keyType === 'ecc' && (
                      <div>
                         <label htmlFor="genCurve" className="block text-sm font-medium text-gray-700">ECC 曲线</label>
                         <select
                             id="genCurve" required
                             className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                             value={genOptions.curve}
                             onChange={e => setGenOptions({...genOptions, curve: e.target.value as any})}
                         >
                             <option value="curve25519">Curve25519 (快速, 安全)</option>
                             <option value="p256">NIST P-256</option>
                             <option value="p384">NIST P-384</option>
                             <option value="p521">NIST P-521</option>
                             {/* Add brainpool later if needed */}
                         </select>
                     </div>
                 )}

                 {/* RSA Bit Length Selection (Conditional) */}
                  {genOptions.keyType === 'rsa' && (
                      <div>
                         <label htmlFor="genRsaBits" className="block text-sm font-medium text-gray-700">RSA 位数</label>
                         <select
                             id="genRsaBits" required
                             className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                             value={genOptions.rsaBits}
                             onChange={e => setGenOptions({...genOptions, rsaBits: parseInt(e.target.value, 10) as any})}
                         >
                             <option value={4096}>4096 (推荐)</option>
                             <option value={3072}>3072</option>
                             <option value={2048}>2048 (最低)</option>
                         </select>
                     </div>
                 )}

                {/* Error Display */}
                {generateError && <p className="text-red-600 text-sm">{generateError}</p>}

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3 pt-4">
                     <button
                        type="button"
                        onClick={handleGenerateModalClose}
                        className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                        disabled={isGenerating}
                    >
                        取消
                    </button>
                     <button
                        type="submit"
                        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                         disabled={isGenerating}
                    >
                        {isGenerating ? '生成中...' : '确认生成'}
                    </button>
                </div>
            </form>
        </Modal>

    </div>
  );
}