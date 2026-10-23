// Secrets are built at runtime so this repository never contains a real-looking token.
export const ghp = 'ghp_' + 'A1b2C3d4'.repeat(4) + 'E5f6';
export const pat = 'github_pat_' + '11ABCDEFG0'.repeat(3) + '_xyz';
export const aws = 'AKIA' + 'QWERTYUIOPASDFGH';
export const key = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ') + '\nMIIEowIBAAKCAQEA\n';
export const sk = 'sk-' + 'abcd1234'.repeat(5);
