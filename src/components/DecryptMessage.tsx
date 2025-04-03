// src/components/DecryptMessage.tsx
import React, { useState, useCallback } from 'react';
import * as openpgp from 'openpgp';
import { PGPKey } from '@/types'; // Import shared types
import { PasswordModal } from './Modal'; // Import the password modal

// --- Component Props ---
interface DecryptMessageProps {
  privateKeys: PGPKey[]; // User's available private keys (PGPKey objects)
  publicKeys: openpgp.Key[]; // User's available public keys (for signature verification)
  // Function provided by parent to get a temporarily decrypted armored key string
  getDecryptedPrivateKeyArmored: (keyId: string, passphrase?: string) => Promise<string | null>;
}

export default function DecryptMessage({ privateKeys, publicKeys, getDecryptedPrivateKeyArmored }: DecryptMessageProps) {
  // --- State ---
  const [ciphertext, setCiphertext] = useState(''); // Input: Armored PGP message
  const [plaintext, setPlaintext] = useState(''); // Output: Decrypted message
  const [signatureInfo, setSignatureInfo] = useState<string | null>(null); // Output: Signature verification result
  const [isLoading, setIsLoading] = useState(false); // Loading indicator for decryption/verification
  const [error, setError] = useState<string | null>(null); // Error messages
  const [showKeyPasswordModal, setShowKeyPasswordModal] = useState(false); // Key password modal visibility
  const [keyIdRequiringPassword, setKeyIdRequiringPassword] = useState<string | null>(null); // Key ID needing password
  const [messageToDecrypt, setMessageToDecrypt] = useState<openpgp.Message<Uint8Array> | null>(null); // Store parsed message needing password

  // --- Decryption Logic ---
  const handleDecryptAttempt = useCallback(async (
    parsedMessage: openpgp.Message<Uint8Array>,
    decryptionKeysAttempt: openpgp.PrivateKey[]
  ) => {
      try {
          console.log(`Attempting decryption with ${decryptionKeysAttempt.length} keys...`);
          const { data: decryptedData, signatures } = await openpgp.decrypt({
              message: parsedMessage,
              decryptionKeys: decryptionKeysAttempt, // Pass the keys to try
              format: 'string' // Expect string output
          });

          console.log("Decryption successful.");
          setPlaintext(decryptedData as string);

          // --- Signature Verification ---
          setSignatureInfo(null); // Reset previous signature info
          if (signatures && signatures.length > 0) {
              console.log(`Found ${signatures.length} signature(s). Verifying the first one.`);
              setIsLoading(true); // Show loading for verification step as well
              setSignatureInfo("正在验证签名...");
              try {
                  // We need the message data in a format verify() understands
                  // Re-creating the message from the decrypted text is usually safe
                  const messageForVerify = await openpgp.createMessage({ text: decryptedData as string });

                  const verificationResult = await openpgp.verify({
                      message: messageForVerify, // Use the re-created message
                      signature: signatures[0], // Verify the first signature found
                      verificationKeys: publicKeys // Provide all known public keys
                  });

                  // Process the verification results (check the first signature's validity)
                  const validity = await verificationResult.signatures[0]?.verified;
                  const signerKeyID = verificationResult.signatures[0]?.keyID;

                  if (validity) {
                      const signerHex = signerKeyID?.toHex() ?? 'Unknown';
                       // Find signer User ID from our public keys
                       const signerKey = publicKeys.find(pk => pk.getKeyID().equals(signerKeyID));
                       const signerUserID = signerKey?.getUserIDs()[0] ?? `未知用户 (${signerHex.slice(-8)})`;
                      setSignatureInfo(`✔️ 有效签名来自: ${signerUserID} (KeyID: ...${signerHex.slice(-16)})`);
                      console.log("Signature verified successfully:", verificationResult);
                  } else {
                      const reason = verificationResult.signatures[0] ? '签名无效或无法验证。' : '无法获取签名信息。';
                      const signerHex = signerKeyID?.toHex() ?? 'N/A';
                      setSignatureInfo(`❌ 签名验证失败: ${reason} (Signer KeyID: ...${signerHex.slice(-16)})`);
                      console.warn("Signature verification failed:", verificationResult);
                  }
              } catch (verifyError: any) {
                  console.error("Signature verification error:", verifyError);
                  setSignatureInfo(`⚠️ 签名验证时出错: ${verifyError.message}`);
              } finally {
                   setIsLoading(false); // Turn off loading after verification attempt
              }
          } else {
              setSignatureInfo("消息未签名。");
          }
          // Clear error on success
          setError(null);

      } catch (decryptError: any) {
          console.error("Decryption attempt failed:", decryptError);
          // Check if the error is due to an encrypted private key needing a password
          // OpenPGP.js error messages can vary, check for common patterns
          if (decryptError.message.includes('private key is encrypted') || decryptError.message.includes('Passphrase required')) {
               // Try to find which key ID might be causing this
               // Often the error message might contain the Key ID, but it's not guaranteed or standardized.
               // We might need to parse the message headers again if the error isn't helpful.
               const keyIDsInMessage = parsedMessage.getEncryptionKeyIDs().map(kid => kid.toHex());
               const potentialKeys = privateKeys.filter(pk => keyIDsInMessage.includes(pk.keyId));

               let keyIdHint = 'Unknown Key';
               if (potentialKeys.length === 1) {
                   keyIdHint = potentialKeys[0].keyId.slice(-16); // Use the likely key ID
               } else if (keyIDsInMessage.length > 0) {
                   keyIdHint = keyIDsInMessage[0].slice(-16) + (keyIDsInMessage.length > 1 ? ' 或其他' : '');
               }

               console.log(`Decryption failed due to encrypted key. Key hint: ${keyIdHint}`);
               setError(`需要密码才能解密此消息。`); // Inform user generally
               setMessageToDecrypt(parsedMessage); // Store the message object
               setKeyIdRequiringPassword(keyIdHint); // Set hint for modal
               setShowKeyPasswordModal(true); // Show password modal
               // Keep isLoading true while modal is shown? Or set false? Let's set false.
               setIsLoading(false);
               // Stop further processing here

          } else if (decryptError.message.includes('No private key available')) {
              setError("解密失败：找不到适用于此消息的私钥。请确保导入了正确的私钥。");
               setIsLoading(false);
          }
          else {
              // Other decryption errors
              setError(`解密失败: ${decryptError.message}`);
               setIsLoading(false);
          }
      }
  }, [publicKeys, privateKeys]); // Dependencies for useCallback


  // --- Main Decrypt Button Handler ---
  const handleDecryptClick = useCallback(async () => {
      if (!ciphertext.trim()) {
          setError("请粘贴要解密的 PGP 消息。");
          return;
      }

      setIsLoading(true);
      setError(null);
      setPlaintext('');
      setSignatureInfo(null);
      setMessageToDecrypt(null); // Clear any previously stored message
      setKeyIdRequiringPassword(null);

      try {
          // 1. Read the armored message
          const parsedMessage = await openpgp.readMessage({ armoredMessage: ciphertext });

          // 2. Get all available private key objects from props
          const privateKeyObjects = privateKeys.map(pk => pk.keyObject as openpgp.PrivateKey).filter(Boolean); // Filter out any null/undefined keyObjects

          if (privateKeyObjects.length === 0) {
               throw new Error("没有可用的私钥来尝试解密。");
          }

          // 3. Attempt decryption using all available keys initially
          await handleDecryptAttempt(parsedMessage, privateKeyObjects);

      } catch (err: any) {
           console.error("Initial read or key preparation failed:", err);
           setError(`处理消息失败: ${err.message}`);
           setIsLoading(false); // Ensure loading is off on initial read failure
      }
      // Note: isLoading is handled within handleDecryptAttempt for password prompts etc.

  }, [ciphertext, privateKeys, handleDecryptAttempt]); // Dependencies


  // --- Handler for Key Password Modal ---
  const handleKeyPasswordSubmit = useCallback(async (password: string) => {
      if (!messageToDecrypt || !keyIdRequiringPassword) {
          console.error("Password submitted but required context (message or keyId) is missing.");
          setError("内部错误：无法使用密码重试解密。");
          setShowKeyPasswordModal(false);
          return;
      }

      // Close modal and show loading
      setShowKeyPasswordModal(false);
      setIsLoading(true);
      setError(null); // Clear previous password error prompt

      console.log(`Attempting to unlock key hinted as ${keyIdRequiringPassword} and retry decryption.`);

      // We need the actual Key ID to pass to getDecryptedPrivateKeyArmored.
      // The hint might not be the full ID. Let's find the potential key(s) again.
      const keyIDsInMessage = messageToDecrypt.getEncryptionKeyIDs().map(kid => kid.toHex());
      const potentialKeys = privateKeys.filter(pk => keyIDsInMessage.includes(pk.keyId));

      if (potentialKeys.length === 0) {
          setError("内部错误：找不到与消息匹配的需要密码的私钥。");
          setIsLoading(false);
          return;
      }

      // Strategy: Try unlocking each potential key and attempt decryption with the unlocked one.
      let decryptionSuccessful = false;
      for (const targetKey of potentialKeys) {
           try {
               console.log(`Trying to unlock key: ${targetKey.keyId.slice(-16)}`);
               // Use the function from props to get the decrypted armored key
               const decryptedArmored = await getDecryptedPrivateKeyArmored(targetKey.keyId, password);

               if (decryptedArmored) {
                   // Parse the temporarily unlocked key
                   const unlockedKeyObject = await openpgp.readPrivateKey({ armoredKey: decryptedArmored });
                   console.log(`Key ${targetKey.keyId.slice(-16)} unlocked. Retrying decryption...`);

                   // Retry decryption using *only* this unlocked key
                   await handleDecryptAttempt(messageToDecrypt, [unlockedKeyObject]);
                   decryptionSuccessful = true; // Mark as successful if handleDecryptAttempt doesn't throw
                   break; // Stop trying other keys if successful
               } else {
                   // This case might mean getDecryptedPrivateKeyArmored returned null without error (shouldn't happen)
                   console.warn(`getDecryptedPrivateKeyArmored returned null for key ${targetKey.keyId}`);
               }
           } catch (unlockOrRetryError: any) {
                console.error(`Failed attempt with key ${targetKey.keyId.slice(-16)}:`, unlockOrRetryError);
                // If error includes password, likely wrong password for *this specific key*
                 if (unlockOrRetryError.message.includes('密码错误') || unlockOrRetryError.message.includes('Passphrase')) {
                     setError(`密钥 ${targetKey.keyId.slice(-8)} 的密码错误。`);
                     // Do not break; continue to try other potential keys if any
                 } else {
                     // A different error occurred during unlock or the second decryption attempt
                     setError(`尝试使用密钥 ${targetKey.keyId.slice(-8)} 解密时出错: ${unlockOrRetryError.message}`);
                      // Continue trying other keys maybe? Or stop? Let's stop for now on non-password errors.
                      // break;
                 }
           }
      } // End of loop through potentialKeys

       if (!decryptionSuccessful) {
            // If loop finished without success (e.g., wrong password for all tried keys)
            // Keep the last relevant error message.
            console.log("Decryption failed after trying all potential keys with password.");
        }

      // Clear context and turn off loading regardless of success/failure in loop
       setMessageToDecrypt(null);
       setKeyIdRequiringPassword(null);
       setIsLoading(false); // Ensure loading is off


  }, [messageToDecrypt, keyIdRequiringPassword, getDecryptedPrivateKeyArmored, handleDecryptAttempt, privateKeys]);


  // --- Helper to copy plaintext ---
   const copyToClipboard = async () => {
    if (!plaintext) return;
    try {
        await navigator.clipboard.writeText(plaintext);
        alert("解密后的明文已复制到剪贴板！");
    } catch (err) {
        console.error('Failed to copy text: ', err);
        alert("复制失败，请手动复制。");
    }
   };

  // --- Render ---
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-2xl font-semibold mb-4 text-gray-700">解密消息</h2>

      {/* Ciphertext Input */}
      <div className="mb-4">
        <label htmlFor="ciphertext-decrypt" className="block text-sm font-medium text-gray-700 mb-1">
          粘贴 PGP 消息:
        </label>
        <textarea
          id="ciphertext-decrypt"
          rows={5}
          className="w-full p-2 border rounded font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={ciphertext}
          onChange={(e) => setCiphertext(e.target.value)}
          placeholder="-----BEGIN PGP MESSAGE----- ..."
          disabled={isLoading}
        />
      </div>

      {/* Decrypt Button */}
      <button
        onClick={handleDecryptClick}
        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isLoading || !ciphertext.trim() || privateKeys.length === 0}
      >
        {isLoading ? '处理中...' : '解密消息'}
      </button>

       {/* Error Display */}
      {error && (
        <p className="mt-3 text-red-600 bg-red-100 p-3 rounded text-sm">{error}</p>
      )}

      {/* Plaintext Output */}
      {plaintext && (
        <div className="mt-6 border-t pt-4">
           <label htmlFor="plaintext-output" className="block text-sm font-medium text-gray-700 mb-1">
             解密后的明文:
           </label>
           <textarea
            id="plaintext-output"
            rows={8}
            readOnly
            className="w-full p-2 border rounded bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={plaintext}
          />
           <button
             onClick={copyToClipboard}
             className="mt-2 px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
          >
             复制明文
           </button>
        </div>
      )}

      {/* Signature Info */}
      {signatureInfo && (
          <div className={`mt-4 p-3 rounded text-sm ${
              signatureInfo.startsWith('✔️') ? 'bg-green-100 text-green-800' :
              signatureInfo.startsWith('❌') ? 'bg-red-100 text-red-800' :
              signatureInfo.startsWith('⚠️') ? 'bg-yellow-100 text-yellow-800' :
              'bg-blue-100 text-blue-800' // Default for "正在验证" or "未签名"
          }`}>
              {signatureInfo}
          </div>
      )}


      {/* --- Key Password Modal --- */}
      <PasswordModal
        isOpen={showKeyPasswordModal}
        onClose={() => {
            // Cancelling the modal means aborting this decryption attempt
            setShowKeyPasswordModal(false);
            setError("解密已取消，因为未提供所需的密钥密码。");
            setMessageToDecrypt(null); // Clear context
            setKeyIdRequiringPassword(null);
            setIsLoading(false); // Ensure loading is off
        }}
        onSubmit={handleKeyPasswordSubmit}
        title="需要密钥密码"
        message={`请输入私钥 (${keyIdRequiringPassword ?? '未知'}) 的密码以继续解密：`}
      />
    </div>
  );
}