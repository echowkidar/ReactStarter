/**
 * PKI Module — AMU Salary Section LPC Certificate Authority
 * Generates and manages a Root CA and document signing certificates
 * for digitally signing LPC (Last Pay Certificate) PDF documents.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PKI_DIR = path.join(__dirname, 'pki');
const CA_KEY_PATH = path.join(PKI_DIR, 'ca-key.pem');
const CA_CERT_PATH = path.join(PKI_DIR, 'ca-cert.pem');
const CA_P12_PATH = path.join(PKI_DIR, 'ca.p12');

export const P12_PASSWORD = 'AMUSalarySection@LPC2024';

export interface PKIData {
  caKeyPem: string;
  caCertPem: string;
  p12Buffer: Buffer;
}

let pkiCache: PKIData | null = null;

/**
 * Initialize the PKI Certificate Authority.
 * Creates CA key + cert + P12 on first run, loads from disk on subsequent runs.
 */
export async function initializePKI(): Promise<PKIData> {
  if (pkiCache) return pkiCache;

  // Ensure PKI directory exists
  if (!fs.existsSync(PKI_DIR)) {
    fs.mkdirSync(PKI_DIR, { recursive: true });
  }

  // Load existing CA if available
  if (fs.existsSync(CA_KEY_PATH) && fs.existsSync(CA_CERT_PATH) && fs.existsSync(CA_P12_PATH)) {
    console.log('[PKI] Loading existing Certificate Authority...');
    const caKeyPem = fs.readFileSync(CA_KEY_PATH, 'utf-8');
    const caCertPem = fs.readFileSync(CA_CERT_PATH, 'utf-8');
    const p12Buffer = fs.readFileSync(CA_P12_PATH);
    pkiCache = { caKeyPem, caCertPem, p12Buffer };
    console.log('[PKI] Certificate Authority loaded successfully.');
    return pkiCache;
  }

  // Generate new CA using Node.js built-in crypto
  console.log('[PKI] Generating new Certificate Authority for LPC signing...');
  
  try {
    const forge = await import('node-forge');
    // node-forge may export as default or named, handle both cases
    const forgeApi = (forge as any).default ?? forge;
    const pki = forgeApi.pki;
    
    // Generate RSA key pair
    const keys = pki.rsa.generateKeyPair(2048);
    
    // Create CA certificate
    const cert = pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

    const attrs = [
      { name: 'commonName', value: 'AMU Salary Section LPC Certificate Authority' },
      { name: 'organizationName', value: 'Aligarh Muslim University' },
      { name: 'organizationalUnitName', value: 'Finance & Accounts Department - Salary Section' },
      { name: 'countryName', value: 'IN' },
      { name: 'stateOrProvinceName', value: 'Uttar Pradesh' },
      { name: 'localityName', value: 'Aligarh' },
    ];

    cert.setSubject(attrs);
    cert.setIssuer(attrs); // Self-signed CA
    cert.setExtensions([
      { name: 'basicConstraints', cA: true },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, digitalSignature: true },
      { name: 'subjectKeyIdentifier' },
    ]);

    cert.sign(keys.privateKey, forgeApi.md.sha256.create());

    const caKeyPem = pki.privateKeyToPem(keys.privateKey);
    const caCertPem = pki.certificateToPem(cert);

    // Create P12/PFX bundle
    const p12Asn1 = forgeApi.pkcs12.toPkcs12Asn1(
      keys.privateKey,
      [cert],
      P12_PASSWORD,
      { algorithm: '3des' }
    );
    const p12Der = forgeApi.asn1.toDer(p12Asn1).getBytes();
    const p12Buffer = Buffer.from(p12Der, 'binary');

    // Save to disk
    fs.writeFileSync(CA_KEY_PATH, caKeyPem, { mode: 0o600 });
    fs.writeFileSync(CA_CERT_PATH, caCertPem);
    fs.writeFileSync(CA_P12_PATH, p12Buffer);

    pkiCache = { caKeyPem, caCertPem, p12Buffer };
    console.log('[PKI] Certificate Authority generated and saved successfully.');
    return pkiCache;

  } catch (error) {
    console.error('[PKI] Failed to generate CA with node-forge:', error);
    // Return a stub so the app still works (PDF signing will be skipped)
    pkiCache = { caKeyPem: '', caCertPem: '', p12Buffer: Buffer.alloc(0) };
    return pkiCache;
  }
}


/** Get path to CA certificate file (for download) */
export function getCACertPath(): string {
  return CA_CERT_PATH;
}

/** Get path to CA P12 file */
export function getCAP12Path(): string {
  return CA_P12_PATH;
}

/** Check if PKI has been initialized */
export function isPKIReady(): boolean {
  return pkiCache !== null && pkiCache.p12Buffer.length > 0;
}

/** Get P12 buffer (for signing) */
export function getP12Buffer(): Buffer {
  return pkiCache?.p12Buffer ?? Buffer.alloc(0);
}

/** Generate a document-specific signing certificate signed by the CA */
export async function generateDocSigningCert(): Promise<{
  certPem: string;
  keyPem: string;
  p12Buffer: Buffer;
  serialNumber: string;
} | null> {
  if (!pkiCache || !pkiCache.caKeyPem) return null;
  
  try {
    const forge = await import('node-forge');
    const forgeApi = (forge as any).default ?? forge;
    const pki = forgeApi.pki;
    
    const caKey = pki.privateKeyFromPem(pkiCache.caKeyPem);
    const caCert = pki.certificateFromPem(pkiCache.caCertPem);
    
    // Generate key for this document
    const docKeys = pki.rsa.generateKeyPair(2048);
    const serialNumber = crypto.randomBytes(8).toString('hex').toUpperCase();
    
    const docCert = pki.createCertificate();
    docCert.publicKey = docKeys.publicKey;
    docCert.serialNumber = serialNumber;
    docCert.validity.notBefore = new Date();
    docCert.validity.notAfter = new Date();
    docCert.validity.notAfter.setFullYear(docCert.validity.notBefore.getFullYear() + 5);

    const attrs = [
      { name: 'commonName', value: 'AMU LPC Document Signer' },
      { name: 'organizationName', value: 'Aligarh Muslim University' },
      { name: 'organizationalUnitName', value: 'Salary Section' },
      { name: 'countryName', value: 'IN' },
    ];

    docCert.setSubject(attrs);
    docCert.setIssuer(caCert.subject.attributes);
    docCert.setExtensions([
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
      { name: 'extKeyUsage', emailProtection: true },
    ]);

    docCert.sign(caKey, forgeApi.md.sha256.create());

    const certPem = pki.certificateToPem(docCert);
    const keyPem = pki.privateKeyToPem(docKeys.privateKey);

    // Create P12 with cert chain (doc cert + CA cert)
    const p12Asn1 = forgeApi.pkcs12.toPkcs12Asn1(
      docKeys.privateKey,
      [docCert, caCert],
      P12_PASSWORD,
      { algorithm: '3des' }
    );
    const p12Der = forgeApi.asn1.toDer(p12Asn1).getBytes();
    const p12Buffer = Buffer.from(p12Der, 'binary');

    return { certPem, keyPem, p12Buffer, serialNumber };
  } catch (error) {
    console.error('[PKI] Failed to generate document signing cert:', error);
    return null;
  }
}
