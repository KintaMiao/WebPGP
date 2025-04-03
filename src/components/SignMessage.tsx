// src/components/SignMessage.tsx
import React, { useState, useCallback } from 'react';
import * as openpgp from 'openpgp';
import { PGPKey } from '@/types'; // Import shared types
import { PasswordModal } from './Modal'; // Import the password modal

// --- Component Props ---
interface SignMessageProps {
  privateKeys: PGPKey[]; // User's available private keys (PGPKey objects)
  // Function provided by parent to get a temporarily decrypted armored key string
  getDecryptedPrivateKeyArmored: (keyId: string, passphrase?: string) => Promise<string | null>;
}

export default function SignMessage({ privateKeys, getDecryptedPrivateKeyArmored }: SignMessageProps) {
  // --- State ---
  const [plaintext, setPlaintext] = useState(''); // Input message to sign
  const [signedMessageOutput, setSignedMessageOutput] = useState(''); // Output: Clear-signed message or detached signature
  const [selectedPrivateKeyId, setSelectedPrivateKeyId] = useState<string>(privateKeys[0]?.keyId ?? ''); // Default to first key if available
  const [signMode, setSignMode] = useState<'cleartext' | 'detached'>('cleartext'); // Default mode
  const [isLoading, setIsLoading] = useState(false); // Loading indicator for signing
  const [error, setError] = useState<string | null>(null); // Error messages
  const [showKeyPasswordModal, setShowKeyPasswordModal] = useState(false); // Key password modal visibility
  const [keyIdRequiringPassword, setKeyIdRequiringPassword] = useState<string | null>(null); // Key ID needing password
  const [dataToSign, setDataToSign] = useState<string | null>(null); // Store plaintext when password is required

   // Ensure default selected key ID is updated if keys change
   React.useEffect(() => {
     if (!selectedPrivateKeyId && privateKeys.length > 0) {
       setSelectedPrivateKeyId(privateKeys[0].keyId);
     }
     // If the currently selected key is removed, reset to the first available one
     if (selectedPrivateKeyId && !privateKeys.some(k => k.keyId === selectedPrivateKeyId) && privateKeys.length > 0) {
        setSelectedPrivateKeyId(privateKeys[0].keyId);
     } else if (privateKeys.length === 0) {
         setSelectedPrivateKeyId(''); // No keys available
     }
   }, [privateKeys, selectedPrivateKeyId]);


  // --- Core Signing Logic ---
  // This function performs the actual signing after the key is potentially unlocked
  const performSign = useCallback(async (
      textToSign: string,
      unlockedPrivateKeyObject: openpgp.PrivateKey, // Expects an unlocked key object
      mode: 'cleartext' | 'detached'
  ) => {
       try {
            console.log(`Performing ${mode} sign with key ${unlockedPrivateKeyObject.getKeyID().toHex().slice(-8)}`);
            const message = await openpgp.createMessage({ text: textToSign });

            if (mode === 'cleartext') {
                 const cleartextSigned = await openpgp.sign({
                    message,
                    signingKeys: [unlockedPrivateKeyObject],
                    detached: false,
                    format: 'armored'
                 });
                 setSignedMessageOutput(cleartextSigned);
            } else { // detached
                const detachedSignature = await openpgp.sign({
                    message,
                    signingKeys: [unlockedPrivateKeyObject],
                    detached: true,
                    format: 'armored'
                 });
                 setSignedMessageOutput(detachedSignature);
            }
            setError(null); // Clear error on success

       } catch (signError: any) {
           console.error("Signing operation failed:", signError);
           throw new Error(`签名操作失败: ${signError.message}`); // Re-throw to be caught by caller
       }
  }, []); // No external dependencies needed here


  // --- Main Sign Button Handler ---
  const handleSignClick = useCallback(async () => {
      // 1. Validation
      if (!plaintext.trim()) {
          setError("请输入要签名的消息。");
          return;
      }
      if (!selectedPrivateKeyId) {
          setError("请选择一个用于签名的私钥。");
          return;
      }
      const selectedKey = privateKeys.find(k => k.keyId === selectedPrivateKeyId);
      if (!selectedKey || !selectedKey.keyObject || !selectedKey.keyObject.isPrivate()) {
          setError("选择的密钥无效或不是私钥。");
          return;
      }

      // 2. Reset State
      setIsLoading(true);
      setError(null);
      setSignedMessageOutput('');
      setDataToSign(null); // Clear previously stored data
      setKeyIdRequiringPassword(null);

      const privateKeyObject = selectedKey.keyObject as openpgp.PrivateKey;

      try {
        // 3. Check if key needs unlocking
        if (privateKeyObject.isDecrypted()) {
            console.log(`Key ${selectedPrivateKeyId.slice(-8)} is already decrypted. Proceeding to sign.`);
            await performSign(plaintext, privateKeyObject, signMode);
            setIsLoading(false); // Signing done (or failed in performSign)
        } else {
            // 4. Key needs password - Show modal
            console.log(`Key ${selectedPrivateKeyId.slice(-8)} requires a passphrase.`);
            setDataToSign(plaintext); // Store current plaintext
            setKeyIdRequiringPassword(selectedPrivateKeyId.slice(-16)); // Set hint for modal
            setShowKeyPasswordModal(true);
            // Keep loading indicator on while modal is shown? Let's turn it off.
            setIsLoading(false);
        }
      } catch (err: any) {
            // Catch errors from performSign if key was already decrypted
            console.error("Error during signing process:", err);
            setError(err.message);
            setIsLoading(false);
      }

  }, [plaintext, selectedPrivateKeyId, signMode, privateKeys, performSign]);


  // --- Handler for Key Password Modal ---
  const handleKeyPasswordSubmit = useCallback(async (password: string) => {
     if (!dataToSign || !selectedPrivateKeyId) {
          console.error("Password submitted but required context (data or keyId) is missing.");
          setError("内部错误：无法使用密码进行签名。");
          setShowKeyPasswordModal(false);
          return;
     }

     const selectedKey = privateKeys.find(k => k.keyId === selectedPrivateKeyId);
      if (!selectedKey) { // Should not happen if selectedPrivateKeyId is valid
           setError("内部错误：找不到选定的私钥。");
           setShowKeyPasswordModal(false);
           return;
      }

      // Close modal and show loading
      setShowKeyPasswordModal(false);
      setIsLoading(true);
      setError(null); // Clear previous password error prompt

      console.log(`Attempting to unlock key ${selectedPrivateKeyId.slice(-8)} with password and sign.`);

      try {
            // 1. Use the prop function to get the temporarily unlocked armored key
            const decryptedArmored = await getDecryptedPrivateKeyArmored(selectedPrivateKeyId, password);

            if (!decryptedArmored) {
                // Should ideally throw specific error in getDecryptedPrivateKeyArmored
                throw new Error("无法使用提供的密码解密密钥。");
            }

            // 2. Parse the temporarily unlocked armored key into an object
            const unlockedKeyObject = await openpgp.readPrivateKey({ armoredKey: decryptedArmored });

             // 3. Perform the signing operation with the unlocked key
             await performSign(dataToSign, unlockedKeyObject, signMode);

      } catch (unlockOrSignError: any) {
          console.error("Failed attempt after password submission:", unlockOrSignError);
           // Handle specific password errors more clearly
         if (unlockOrSignError.message.includes('密码错误') || unlockOrSignError.message.includes('Passphrase')) {
             setError(`密钥 ${selectedPrivateKeyId.slice(-8)} 的密码错误。`);
         } else {
              setError(`使用密码签名时出错: ${unlockOrSignError.message}`);
         }
      } finally {
           // Clear context and turn off loading
           setDataToSign(null);
           setKeyIdRequiringPassword(null);
           setIsLoading(false);
      }

  }, [dataToSign, selectedPrivateKeyId, getDecryptedPrivateKeyArmored, performSign, signMode, privateKeys]);


  // --- Helper to copy output ---
  const copyToClipboard = async () => {
    if (!signedMessageOutput) return;
    try {
        await navigator.clipboard.writeText(signedMessageOutput);
        alert("签名结果已复制到剪贴板！");
    } catch (err) {
        console.error('Failed to copy text: ', err);
        alert("复制失败，请手动复制。");
    }
   };

  // --- Render ---
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-2xl font-semibold mb-4 text-gray-700">签名消息</h2>

      {/* Plaintext Input */}
      <div className="mb-4">
        <label htmlFor="plaintext-sign" className="block text-sm font-medium text-gray-700 mb-1">
          输入要签名的消息:
        </label>
        <textarea
          id="plaintext-sign"
          rows={5}
          className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={plaintext}
          onChange={(e) => setPlaintext(e.target.value)}
          placeholder="在此输入你想签名的消息..."
          disabled={isLoading}
        />
      </div>

      {/* Key Selection and Mode */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
           {/* Private Key Selection */}
         <div>
            <label htmlFor="signing-key" className="block text-sm font-medium text-gray-700 mb-1">
            选择签名私钥:
            </label>
            <select
                id="signing-key"
                className="w-full p-2 border rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                value={selectedPrivateKeyId}
                onChange={(e) => setSelectedPrivateKeyId(e.target.value)}
                disabled={isLoading || privateKeys.length === 0}
            >
            {privateKeys.length === 0 && <option value="">无可用私钥</option>}
            {privateKeys.map(key => (
                <option key={key.keyId} value={key.keyId}>
                    {key.primaryUserId} (...{key.keyId.slice(-16)})
                </option>
            ))}
            </select>
         </div>

         {/* Signing Mode Selection */}
         <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
            选择签名模式:
            </label>
             <div className="flex space-x-4 items-center h-full" > {/* Align items vertically */}
              <div className="flex items-center">
                <input
                  type="radio"
                  id="mode-sign-cleartext"
                  name="signMode"
                  value="cleartext"
                  checked={signMode === 'cleartext'}
                  onChange={() => setSignMode('cleartext')}
                  className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <label htmlFor="mode-sign-cleartext" className="ml-2 text-sm text-gray-700">
                  文本内签名
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="radio"
                  id="mode-sign-detached"
                  name="signMode"
                  value="detached"
                  checked={signMode === 'detached'}
                  onChange={() => setSignMode('detached')}
                  className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <label htmlFor="mode-sign-detached" className="ml-2 text-sm text-gray-700">
                  分离式签名
                </label>
              </div>
            </div>
         </div>
      </div>


      {/* Sign Button */}
      <button
        onClick={handleSignClick}
        className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isLoading || !plaintext.trim() || !selectedPrivateKeyId}
      >
        {isLoading ? '签名中...' : '开始签名'}
      </button>

      {/* Error Display */}
      {error && (
        <p className="mt-3 text-red-600 bg-red-100 p-3 rounded text-sm">{error}</p>
      )}

       {/* Signed Output */}
      {signedMessageOutput && (
        <div className="mt-6 border-t pt-4">
           <label htmlFor="signed-output" className="block text-sm font-medium text-gray-700 mb-1">
             签名结果 ({signMode === 'cleartext' ? '文本内签名消息' : '分离式签名'}):
           </label>
           <textarea
            id="signed-output"
            rows={8}
            readOnly
            className="w-full p-2 border rounded bg-gray-50 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={signedMessageOutput}
          />
           <button
             onClick={copyToClipboard}
             className="mt-2 px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
          >
             复制结果
           </button>
        </div>
      )}

       {/* --- Key Password Modal --- */}
      <PasswordModal
        isOpen={showKeyPasswordModal}
        onClose={() => {
            // Cancelling the modal means aborting this signing attempt
            setShowKeyPasswordModal(false);
            setError("签名已取消，因为未提供所需的密钥密码。");
            setDataToSign(null); // Clear context
            setKeyIdRequiringPassword(null);
            setIsLoading(false); // Ensure loading is off
        }}
        onSubmit={handleKeyPasswordSubmit}
        title="需要密钥密码"
        message={`请输入私钥 (...${keyIdRequiringPassword ?? '未知'}) 的密码以继续签名：`}
      />

    </div>
  );
}