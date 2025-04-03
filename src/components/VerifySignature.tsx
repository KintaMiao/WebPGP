// src/components/VerifySignature.tsx
import React, { useState, useCallback } from 'react';
import * as openpgp from 'openpgp';

// --- Component Props ---
interface VerifySignatureProps {
  // Array of known public keys for verification
  publicKeys: openpgp.Key[];
}

export default function VerifySignature({ publicKeys }: VerifySignatureProps) {
  // --- State ---
  const [verifyMode, setVerifyMode] = useState<'cleartext' | 'detached'>('cleartext'); // Default to cleartext
  const [inputText, setInputText] = useState(''); // Holds clear-signed message OR original message for detached
  const [signatureText, setSignatureText] = useState(''); // Holds armored detached signature
  const [verificationResult, setVerificationResult] = useState<string | null>(null); // User-friendly result string
  const [isLoading, setIsLoading] = useState(false); // Loading indicator
  const [error, setError] = useState<string | null>(null); // Error messages

  // --- Verification Logic ---
  const handleVerify = useCallback(async () => {
    // 1. Reset state
    setIsLoading(true);
    setError(null);
    setVerificationResult(null);

    // 2. Basic Input Validation
    if (verifyMode === 'cleartext' && !inputText.trim()) {
      setError("请粘贴要验证的文本内签名消息 (Clear-signed message)。");
      setIsLoading(false);
      return;
    }
    if (verifyMode === 'detached' && (!inputText.trim() || !signatureText.trim())) {
      setError("请同时提供原始消息和分离式签名 (Detached signature)。");
      setIsLoading(false);
      return;
    }
    if (publicKeys.length === 0) {
        setError("无法验证签名，因为没有可用的公钥。请先导入签名者的公钥。");
        setIsLoading(false);
        return;
    }

    try {
        let verifyInput: {
            message: openpgp.Message<any> | openpgp.CleartextMessage; // Message or CleartextMessage object
            signature?: openpgp.Signature; // Optional detached signature
            verificationKeys: openpgp.Key[]; // Keys to verify against
        };

        // 3. Prepare verification input based on mode
        if (verifyMode === 'cleartext') {
            console.log("Verifying cleartext message...");
            const cleartextMessage = await openpgp.readCleartextMessage({ cleartextMessage: inputText });
             // verify needs the cleartext message object directly
             verifyInput = {
                 message: cleartextMessage,
                 verificationKeys: publicKeys
             };
        } else { // detached
            console.log("Verifying detached signature...");
            const message = await openpgp.createMessage({ text: inputText });
            const signature = await openpgp.readSignature({ armoredSignature: signatureText });
             verifyInput = {
                 message: message,
                 signature: signature,
                 verificationKeys: publicKeys
             };
        }

        // 4. Perform verification
        const result = await openpgp.verify(verifyInput);

        // 5. Process results
        if (!result.signatures || result.signatures.length === 0) {
            setVerificationResult("⚠️ 未找到有效的签名信息。");
            console.warn("Verification returned no signatures.", result);
             setIsLoading(false);
             return;
        }

        // Check the validity of the first signature
        const firstSignature = result.signatures[0];
        const isValid = await firstSignature.verified; // verified is a promise
        const signerKeyID = firstSignature.keyID;
        const signerHex = signerKeyID?.toHex() ?? 'Unknown';

        if (isValid === true) { // Explicitly check for true, as it's a promise result
             // Find signer User ID from our public keys
             const signerKey = publicKeys.find(pk => pk.getKeyID().equals(signerKeyID));
             const signerUserID = signerKey?.getUserIDs()[0] ?? `未知用户 (${signerHex.slice(-8)})`;
             setVerificationResult(`✔️ 签名有效！由 ${signerUserID} (KeyID: ...${signerHex.slice(-16)}) 签署。`);
             console.log("Signature verified successfully:", result);
        } else {
            // Signature is invalid or could not be verified with known keys
             setVerificationResult(`❌ 签名无效或无法使用已知公钥验证。(Signer KeyID: ...${signerHex.slice(-16)})`);
             console.warn("Signature verification failed or invalid:", result);
        }

    } catch (err: any) {
        console.error("Verification failed:", err);
        // Provide more specific errors if possible
        if (err.message.includes('Failed to read cleartext message') || err.message.includes('Misformed armored text')) {
             setError("验证失败：输入的文本格式不正确，请检查是否为有效的 PGP 签名消息。");
        } else if (err.message.includes('Failed to read signature') || err.message.includes('No valid signature packets found')) {
             setError("验证失败：无法读取分离式签名，请检查签名格式。");
        } else {
            setError(`验证失败: ${err.message}`);
        }
    } finally {
        // 6. Turn off loading indicator
        setIsLoading(false);
    }
  }, [verifyMode, inputText, signatureText, publicKeys]); // Dependencies


  // --- Render ---
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-2xl font-semibold mb-4 text-gray-700">验证签名</h2>

      {/* Verification Mode Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          选择验证模式:
        </label>
        <div className="flex space-x-4">
          <div className="flex items-center">
            <input
              type="radio"
              id="mode-cleartext"
              name="verifyMode"
              value="cleartext"
              checked={verifyMode === 'cleartext'}
              onChange={() => setVerifyMode('cleartext')}
              className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              disabled={isLoading}
            />
            <label htmlFor="mode-cleartext" className="ml-2 text-sm text-gray-700">
              文本内签名 (Cleartext Signed)
            </label>
          </div>
          <div className="flex items-center">
            <input
              type="radio"
              id="mode-detached"
              name="verifyMode"
              value="detached"
              checked={verifyMode === 'detached'}
              onChange={() => setVerifyMode('detached')}
              className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              disabled={isLoading}
            />
            <label htmlFor="mode-detached" className="ml-2 text-sm text-gray-700">
              分离式签名 (Detached Signature)
            </label>
          </div>
        </div>
      </div>

      {/* Input Area(s) */}
      <div className="mb-4">
        {verifyMode === 'cleartext' ? (
          <div>
            <label htmlFor="cleartext-message" className="block text-sm font-medium text-gray-700 mb-1">
              粘贴文本内签名消息:
            </label>
            <textarea
              id="cleartext-message"
              rows={8}
              className="w-full p-2 border rounded font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA256

This is the signed message content.
-----BEGIN PGP SIGNATURE-----
...
-----END PGP SIGNATURE-----`}
              disabled={isLoading}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="original-message" className="block text-sm font-medium text-gray-700 mb-1">
                粘贴原始消息:
              </label>
              <textarea
                id="original-message"
                rows={8}
                className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="The original message text that was signed."
                disabled={isLoading}
              />
            </div>
            <div>
              <label htmlFor="detached-signature" className="block text-sm font-medium text-gray-700 mb-1">
                粘贴分离式签名:
              </label>
              <textarea
                id="detached-signature"
                rows={8}
                className="w-full p-2 border rounded font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={signatureText}
                onChange={(e) => setSignatureText(e.target.value)}
                placeholder={`-----BEGIN PGP SIGNATURE-----
...
-----END PGP SIGNATURE-----`}
                disabled={isLoading}
              />
            </div>
          </div>
        )}
      </div>

      {/* Verify Button */}
      <button
        onClick={handleVerify}
        className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isLoading || !inputText.trim() || (verifyMode === 'detached' && !signatureText.trim()) || publicKeys.length === 0}
      >
        {isLoading ? '验证中...' : '开始验证'}
      </button>

      {/* Error Display */}
      {error && (
        <p className="mt-3 text-red-600 bg-red-100 p-3 rounded text-sm">{error}</p>
      )}

      {/* Verification Result */}
       {verificationResult && (
          <div className={`mt-4 p-3 rounded text-sm ${
              verificationResult.startsWith('✔️') ? 'bg-green-100 text-green-800' :
              verificationResult.startsWith('❌') ? 'bg-red-100 text-red-800' :
              'bg-yellow-100 text-yellow-800' // Default for warnings like "not found"
          }`}>
              {verificationResult}
          </div>
      )}

    </div>
  );
}